import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addCheckpoint, addLedger, createProject, logUsage } from "@/lib/db/writes";
import { starterFor } from "@/lib/blueprint/fixtures";
import { matchVertical } from "@/lib/blueprint/match";
import { streamPlan, type PlanEvent } from "@/lib/llm/stream-plan";
import { holdModelBudget } from "@/lib/llm/guard";
import { PRICE, canAfford, outOfCreditsNote } from "@/lib/pricing";
import { projectCapMessage } from "@/lib/security/caps";
import { verify } from "@/lib/security/sign";
import type { Blueprint, Framework } from "@/lib/blueprint/schema";
import { estimate } from "@/lib/blueprint/estimate";
import { cleanTree, type ImportReportWithTree } from "@/lib/import/snapshot";
import { cleanAgents } from "@/lib/import/agents";
import { applyDetectedAgents, detectedAgentsPrompt, mappingNote } from "@/lib/import/map";
import { startNotConnected } from "@/lib/llm/draft";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const FW: Record<string, Framework> = { langgraph: "langgraph", crewai: "crewai", openai_agents: "openai_agents", google_adk: "google_adk", lyzr: "lyzr", mastra: "mastra" };

/** "1 AI helper", "2 AI helpers": counts in plain words. */
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const pretty = (s: string) => s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40);

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { report?: ImportReportWithTree; sig?: unknown; houseRules?: unknown };
  if (!body.report?.repo?.name) return Response.json({ error: "Analyse a repository first" }, { status: 400 });
  // Only the analysis the server made goes into the planner and the database, never one edited in the browser.
  if (!verify(body.report, body.sig)) return Response.json({ error: "That analysis has expired. Read the repository again." }, { status: 400 });
  // The real file tree is stored with the report so the Code tab shows the repo as it is, untouched.
  // The agents read from the repo's source come back from the client too, so they are cleaned the same way.
  const scan = body.report.agentScan;
  const report: ImportReportWithTree = {
    ...body.report,
    tree: cleanTree(body.report.tree),
    agents: cleanAgents(body.report.agents),
    agentScan: scan ? { filesRead: cleanTree(scan.filesRead)?.slice(0, 12) ?? [], candidates: Number(scan.candidates) || 0, toolCount: Number(scan.toolCount) || 0 } : undefined,
  };
  const filesRead = report.agentScan?.filesRead.length ?? 0;
  const houseRules = (Array.isArray(body.houseRules) ? body.houseRules : [])
    .filter((r): r is string => typeof r === "string")
    .map((r) => r.trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 12);
  const supa = await createClient();
  // Don't spend a model call on a mapping that couldn't be saved.
  const full = await projectCapMessage(supa, user);
  if (full) return Response.json({ error: full, code: "cap" }, { status: 403 });
  const hold = await holdModelBudget(user, "import");
  if (!hold.ok && hold.reason === "rate") return Response.json({ error: "That's a lot of imports in a few minutes. Wait a little, then try again." }, { status: 429 });
  // Mapping a repo with Claude costs credits; without enough, it maps onto the closest starter plan, free.
  const afford = hold.ok ? await canAfford(user.id, user.isAnonymous, "import") : null;
  if (hold.ok && afford && !afford.ok) await hold.release();
  const useModel = hold.ok && Boolean(afford?.ok);
  // Without Claude the screens come from a starter plan picked by the README's words. When none is close, say so.
  const starterText = `${report.repo.description ?? ""} ${report.readmeExcerpt.slice(0, 1500)}`;
  const weak = matchVertical(starterText).weak;
  const starterWords = weak ? "a general starter plan (none is close to this repo)" : "the closest starter plan";
  const noModelNote = user.isAnonymous
    ? `As a guest, the screens come from ${starterWords} and any agents are read from your code. Sign in and Claude maps it all from your code.`
    : afford && !afford.ok
      ? outOfCreditsNote(afford.credits, `the screens come from ${starterWords} and any agents are read from your code`)
      : undefined;
  const framework = report.frameworks.map((f) => FW[f.id]).find(Boolean) ?? "lyzr";
  // Older clients (and cached reports from before agents were read) send no agents: keep the earlier behaviour.
  const scanned = Array.isArray(report.agents);
  let agentNote = scanned ? mappingNote(report.agents!, [], [], "", 0, filesRead) : "";

  const adjust = (bp: Blueprint): Blueprint => {
    let next = structuredClone(bp);
    // Proposals are written in the repo's framework; agents read from the repo keep their own (applyDetectedAgents).
    next.agents.forEach((a) => {
      a.framework = framework;
      a.origin = !scanned && report.frameworks.some((f) => FW[f.id]) ? "imported" : "generated";
    });
    if (scanned) {
      try {
        const mapped = applyDetectedAgents(next, report.agents!, { tree: report.tree, filesRead, modelId: bp.agents[0]?.cost.model });
        next = mapped.blueprint;
        agentNote = mapped.note;
      } catch (e) {
        // Never invent: if the real agents can't be laid onto this plan, its agents stay, marked as proposals.
        console.error("[import] agent mapping failed", e instanceof Error ? e.message : e);
        next.agents.forEach((a) => (a.origin = "generated"));
        agentNote = `Read ${report.agents!.length} agent definitions but couldn't lay them onto this plan, so its AI helpers are proposals. Your code is untouched.`;
      }
    }
    // Honest from the first save: nothing outside the app is connected on an imported project yet.
    next = startNotConnected(next);
    if (!next.meta.name || next.meta.name.length < 3) next.meta.name = pretty(report.repo.name);
    next.estimate = estimate(next);
    return next;
  };

  const prompt = `Reverse-engineer the plan of this EXISTING repository so it can be developed further in Prod AI. Map what is already there. Do not invent a different product.
Repository: ${report.repo.owner}/${report.repo.name}: ${report.repo.description ?? "no description"}
Primary language: ${report.repo.language ?? "unknown"} · ${report.fileCount} files
Stack: ${report.stack.map((s) => s.label).join(", ") || "unknown"}
Agent frameworks found: ${report.frameworks.map((f) => `${f.label} (${f.evidence})`).join("; ") || "none"}
Conventions: ${report.conventions.join("; ")}
Folders understood: ${report.coverage.understood.join("; ")}
README (excerpt):
${report.readmeExcerpt.slice(0, 5000)}

House rules the owner set (respect them in agent rules where relevant): ${houseRules.join(" | ")}
Use the repository's own names for agents and screens where the README or folders reveal them. Name the product after the repository.${scanned ? detectedAgentsPrompt(report.agents, report.tree, filesRead) : ""}`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (e: PlanEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      let projectId: string | null = null;
      let spent: Awaited<ReturnType<typeof streamPlan>>["spent"] = null;
      try {
        const { blueprint, mode, spent: cost, vertical } = await streamPlan({
          prompt,
          userId: user.id,
          allowModel: useModel,
          noModelNote,
          send,
          fallback: () => {
            const s = starterFor(starterText).blueprint;
            s.meta.name = pretty(report.repo.name);
            s.meta.tagline = report.repo.description?.slice(0, 90) ?? s.meta.tagline;
            return s;
          },
          failureNote: `The model didn't answer in time, so the screens come from ${starterWords} and any agents are read from your code. Everything in your repo is untouched.`,
          adjust,
        });
        spent = cost;
        const brief = `Imported from github.com/${report.repo.owner}/${report.repo.name}${report.repo.description ? `: ${report.repo.description}` : ""}`;
        // Who drew the map, kept with the project so the Sheet can say where the screens came from:
        // Claude reading the code, or a starter plan (only the agents, if any, are read from the code).
        const mappedBy: "claude" | "starter" = mode === "live" ? "claude" : "starter";
        const settings = { houseRules, github: { connected: true, repo: `${report.repo.owner}/${report.repo.name}`, account: report.repo.owner }, mappedBy };
        const fromCode = blueprint.agents.filter((a) => a.origin === "imported").length;
        const project = await createProject(supa, {
          ownerId: user.id,
          name: blueprint.meta.name,
          vertical,
          source: "import",
          brief,
          blueprint,
          importReport: report,
          buildState: "draft",
          settings,
        });
        projectId = project.id;
        const cp = await addCheckpoint(supa, project.id, { label: "Imported from GitHub", kind: "import", blueprint, summary: `${report.repo.owner}/${report.repo.name} · ${report.fileCount} files · ${report.frameworks.map((f) => f.label).join(", ") || "no agent framework"}` });
        await supa.from("work_orders").insert({ project_id: project.id, request: brief, kind: "build", estimate: blueprint.estimate, status: "proposed" });
        await addLedger(supa, project.id, [
          { lane: "thought", kind: "import", title: `Read ${report.repo.owner}/${report.repo.name}`, body: `${report.fileCount} files. Found ${report.frameworks.map((f) => f.label).join(", ") || "no agent framework"} on ${report.stack.map((s) => s.label).slice(0, 4).join(", ") || "an unknown stack"}.${agentNote ? ` ${agentNote}` : ""}${report.cached ? " (Cached analysis: GitHub rate limit.)" : ""}`, credits: 0 },
          { lane: "checked", kind: "import", title: `Signed ${houseRules.length} House Rules`, body: houseRules.map((r) => `• ${r}`).join("\n"), credits: 0 },
          {
            lane: "thought",
            kind: "work_order",
            // Say where each part came from: Claude read the code, or the screens come from a starter plan and only the agents from the code.
            title:
              mappedBy === "claude"
                ? `Mapped the repo into ${count(blueprint.screens.length, "screen")} and ${count(blueprint.agents.length, "AI helper")}`
                : fromCode
                  ? `Started from ${weak ? "a general" : "the closest"} starter plan: ${count(blueprint.screens.length, "screen")}, with ${count(fromCode, "AI helper")} from your code`
                  : `Started from ${weak ? "a general" : "the closest"} starter plan: ${count(blueprint.screens.length, "screen")} and ${count(blueprint.agents.length, "AI helper")}`,
            body: `${mappedBy === "claude" ? `Mapped by Claude from your code · ${PRICE.import} credits.` : `The screens and data come from ${starterWords}, not from your code${user.isAnonymous ? ". Sign in and Claude maps it from your code" : ""}.`}${agentNote ? ` ${agentNote}` : ""} Every outside connection starts as not connected (test data) until you add its keys. The first change will open as a pull request. Nothing is pushed to main.`,
            credits: mode === "live" ? PRICE.import : 0,
            checkpointId: cp.id,
          },
        ]);
        send({ t: "done", projectId: project.id, mode, name: blueprint.meta.name });
      } catch (e) {
        console.error("[import] save failed", e);
        // At the project cap the person can't fix it by trying again: say so, with its own code so the page offers sign-in instead.
        const cap = e instanceof Error && /project cap|row-level/i.test(e.message) ? await projectCapMessage(supa, user) : null;
        send(cap ? { t: "error", message: cap, code: "cap" } : { t: "error", message: "Couldn't save the project. Try again." });
      } finally {
        // A saved mapping by Claude costs its price; a failed call or a mapping that couldn't be saved costs nothing.
        // Its real cost is metered either way, for the daily model budget.
        const charged = spent && !spent.failed && projectId ? PRICE.import : 0;
        if (spent) await logUsage({ userId: user.id, projectId, kind: "import", provider: "anthropic", model: spent.model, inputTokens: spent.inputTokens, outputTokens: spent.outputTokens, costUsd: spent.costUsd, credits: charged, meta: { op: "import", modelCredits: spent.credits, failed: spent.failed, estimated: spent.estimated } });
        if (useModel) await hold.release();
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
