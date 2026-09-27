import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addCheckpoint, addLedger, createProject, logUsage } from "@/lib/db/writes";
import { starterFor } from "@/lib/blueprint/fixtures";
import { streamPlan, type PlanEvent } from "@/lib/llm/stream-plan";
import { modelBudgetOk } from "@/lib/llm/guard";
import type { Blueprint, Framework } from "@/lib/blueprint/schema";
import { estimate } from "@/lib/blueprint/estimate";
import { cleanTree, type ImportReportWithTree } from "@/lib/import/snapshot";
import { cleanAgents } from "@/lib/import/agents";
import { applyDetectedAgents, detectedAgentsPrompt, mappingNote, pickAgents } from "@/lib/import/map";
import { startNotConnected } from "@/lib/llm/draft";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const FW: Record<string, Framework> = { langgraph: "langgraph", crewai: "crewai", openai_agents: "openai_agents", google_adk: "google_adk", lyzr: "lyzr", mastra: "mastra" };

const pretty = (s: string) => s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40);

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { report?: ImportReportWithTree; houseRules?: string[] };
  if (!body.report?.repo?.name) return Response.json({ error: "Analyze a repository first" }, { status: 400 });
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
  const houseRules = (body.houseRules ?? []).map((r) => r.trim()).filter(Boolean).slice(0, 12);
  const supa = await createClient();
  const allowModel = await modelBudgetOk(supa, user);
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
        agentNote = `Read ${report.agents!.length} agent definitions but couldn't lay them onto this plan, so its agents are proposals. Your code is untouched.`;
      }
    }
    // Honest from the first save: nothing outside the app is connected on an imported project yet.
    next = startNotConnected(next);
    if (!next.meta.name || next.meta.name.length < 3) next.meta.name = pretty(report.repo.name);
    next.estimate = estimate(next);
    return next;
  };
  const picked = scanned ? pickAgents(report.agents!, report.tree) : null;

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
      const { blueprint, mode, usage, vertical } = await streamPlan({
        prompt,
        userId: user.id,
        allowModel,
        send,
        fallback: () => {
          const s = starterFor(`${report.repo.description ?? ""} ${report.readmeExcerpt.slice(0, 1500)}`).blueprint;
          s.meta.name = pretty(report.repo.name);
          s.meta.tagline = report.repo.description?.slice(0, 90) ?? s.meta.tagline;
          return s;
        },
        failureNote: "The model didn't answer in time, so I mapped the repo onto the closest starter plan. Everything in your repo is untouched.",
        adjust,
      });
      try {
        const brief = `Imported from github.com/${report.repo.owner}/${report.repo.name}${report.repo.description ? `: ${report.repo.description}` : ""}`;
        const project = await createProject(supa, {
          ownerId: user.id,
          name: blueprint.meta.name,
          vertical,
          source: "import",
          brief,
          blueprint,
          importReport: report,
          buildState: "draft",
          settings: { houseRules, github: { connected: true, repo: `${report.repo.owner}/${report.repo.name}`, account: report.repo.owner } },
        });
        const cp = await addCheckpoint(supa, project.id, { label: "Imported from GitHub", kind: "import", blueprint, summary: `${report.repo.owner}/${report.repo.name} · ${report.fileCount} files · ${report.frameworks.map((f) => f.label).join(", ") || "no agent framework"}` });
        await supa.from("work_orders").insert({ project_id: project.id, request: brief, kind: "build", estimate: blueprint.estimate, status: "proposed" });
        await addLedger(supa, project.id, [
          { lane: "thought", kind: "import", title: `Read ${report.repo.owner}/${report.repo.name}`, body: `${report.fileCount} files. Found ${report.frameworks.map((f) => f.label).join(", ") || "no agent framework"} on ${report.stack.map((s) => s.label).slice(0, 4).join(", ") || "an unknown stack"}.${agentNote ? ` ${agentNote}` : ""}${report.cached ? " (Cached analysis: GitHub rate limit.)" : ""}`, credits: 0 },
          { lane: "checked", kind: "import", title: `Signed ${houseRules.length} House Rules`, body: houseRules.map((r) => `• ${r}`).join("\n"), credits: 0 },
          {
            lane: "thought",
            kind: "work_order",
            title: `Mapped the repo into ${blueprint.screens.length} screens and ${blueprint.agents.length} ${picked?.mapped.length ? "agents from your code" : "agents"}`,
            body: `${mode === "live" ? `Mapped with ${usage?.model}. Mapping is free.` : "Offline mode: screens and data come from the closest starter plan."}${agentNote ? ` ${agentNote}` : ""} Every outside connection starts as not connected (test data) until you add its keys. The first change will open as a pull request. Nothing is pushed to main.`,
            credits: 0,
            checkpointId: cp.id,
          },
        ]);
        if (usage) await logUsage(supa, { userId: user.id, projectId: project.id, kind: "import", provider: "anthropic", model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd, credits: 0, meta: { op: "import", modelCredits: usage.credits } });
        send({ t: "done", projectId: project.id, mode, name: blueprint.meta.name });
      } catch (e) {
        console.error("[import] save failed", e);
        send({ t: "error", message: "Couldn't save the project. Try again." });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
