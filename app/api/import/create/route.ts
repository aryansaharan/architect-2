import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addCheckpoint, addLedger, createProject, logUsage } from "@/lib/db/writes";
import { starterFor } from "@/lib/blueprint/fixtures";
import { streamPlan, type PlanEvent } from "@/lib/llm/stream-plan";
import { modelBudgetOk } from "@/lib/llm/guard";
import type { Blueprint, Framework } from "@/lib/blueprint/schema";
import type { ImportReport } from "@/lib/db/types";
import { estimate } from "@/lib/blueprint/estimate";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const FW: Record<string, Framework> = { langgraph: "langgraph", crewai: "crewai", openai_agents: "openai_agents", google_adk: "google_adk", lyzr: "lyzr", mastra: "mastra" };

const pretty = (s: string) => s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40);

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { report?: ImportReport; houseRules?: string[] };
  const report = body.report;
  if (!report?.repo?.name) return Response.json({ error: "Analyze a repository first" }, { status: 400 });
  const houseRules = (body.houseRules ?? []).map((r) => r.trim()).filter(Boolean).slice(0, 12);
  const supa = await createClient();
  const allowModel = await modelBudgetOk(supa, user);
  const framework = report.frameworks.map((f) => FW[f.id]).find(Boolean) ?? "lyzr";

  const adjust = (bp: Blueprint): Blueprint => {
    const next = structuredClone(bp);
    next.agents.forEach((a) => {
      a.framework = framework;
      a.origin = report.frameworks.some((f) => FW[f.id]) ? "imported" : "generated";
    });
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
Use the repository's own names for agents and screens where the README or folders reveal them. Name the product after the repository.`;

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
          { lane: "thought", kind: "import", title: `Read ${report.repo.owner}/${report.repo.name}`, body: `${report.fileCount} files. Found ${report.frameworks.map((f) => f.label).join(", ") || "no agent framework"} on ${report.stack.map((s) => s.label).slice(0, 4).join(", ") || "an unknown stack"}.${report.cached ? " (Cached analysis: GitHub rate limit.)" : ""}`, credits: 0 },
          { lane: "checked", kind: "import", title: `Signed ${houseRules.length} House Rules`, body: houseRules.map((r) => `• ${r}`).join("\n"), credits: 0 },
          { lane: "thought", kind: "work_order", title: `Mapped the repo into ${blueprint.screens.length} screens and ${blueprint.agents.length} agents`, body: mode === "live" ? `Mapped with ${usage?.model}. Mapping is free. The first change will open as a pull request. Nothing is pushed to main.` : "Offline mode: mapped onto the closest starter plan.", credits: 0, checkpointId: cp.id },
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
