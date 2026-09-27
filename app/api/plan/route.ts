import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addCheckpoint, addLedger, createProject, logUsage } from "@/lib/db/writes";
import { starterFor } from "@/lib/blueprint/fixtures";
import { streamPlan, type PlanEvent } from "@/lib/llm/stream-plan";
import { modelBudgetOk } from "@/lib/llm/guard";
import { NOTHING_CONNECTED_NOTE, cleanConnections, connectionsNote, ensureConnections, isNothingOnly, saysNothingConnected, startNotConnected } from "@/lib/llm/draft";
import { buildTimeLabel, estimate } from "@/lib/blueprint/estimate";
import type { Blueprint } from "@/lib/blueprint/schema";
import { buildTimeline, totalDuration } from "@/lib/sim/buildTimeline";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { brief?: string; answers?: string; connections?: unknown };
  const brief = (body.brief ?? "").trim().slice(0, 2000);
  if (brief.length < 8) return Response.json({ error: "Describe what you want in a sentence or two" }, { status: 400 });
  const answers = (body.answers ?? "").slice(0, 600);
  // "What must it connect to?" is a multi-select ("Email, SMS"). Older clients send only the answers text.
  const connections = cleanConnections(body.connections);
  // "Connect to: Nothing yet" (alone) holds twice: in the prompt, and deterministically on the result (model or starter).
  const nothingConnected = connections ? isNothingOnly(connections) : saysNothingConnected(answers);
  // Named systems hold twice too: the planner is told, and any it leaves out are added as needing setup.
  const wanted = connections && !nothingConnected ? connections.filter((c) => !/^(nothing|nowhere|none) yet$/i.test(c)) : [];
  // Honest from the first save: every outside connection starts as not connected (test data) until keys are
  // added in preflight or the connection flow, whether the plan came from the model or a starter. Only the
  // app's own database is ready. The curated demo seed is not planned here, so it keeps its configured systems.
  const adjust = (bp: Blueprint): Blueprint => {
    let next = startNotConnected(bp);
    if (wanted.length) {
      const withAll = ensureConnections(next, wanted);
      if (withAll !== next) next = { ...withAll, estimate: estimate(withAll) };
    }
    return next;
  };
  const supa = await createClient();
  const allowModel = await modelBudgetOk(supa, user);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (e: PlanEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      const { blueprint, mode, usage, vertical } = await streamPlan({
        prompt: `Brief: ${brief}\n\nAnswers to quick questions:\n${answers || "(skipped, use sensible defaults)"}${nothingConnected ? `\n\n${NOTHING_CONNECTED_NOTE}` : wanted.length ? `\n\n${connectionsNote(wanted)}` : ""}`,
        userId: user.id,
        allowModel,
        send,
        fallback: () => starterFor(brief).blueprint,
        adjust,
        failureNote: "The model didn't answer in time, so I started from the closest starter plan. You can reshape it before building.",
      });
      try {
        const project = await createProject(supa, { ownerId: user.id, name: blueprint.meta.name, vertical, brief, blueprint, buildState: "draft" });
        const cp = await addCheckpoint(supa, project.id, {
          label: "Plan v1",
          kind: "blueprint",
          blueprint,
          summary: `${blueprint.screens.length} screens · ${blueprint.agents.length} agents · ${blueprint.entities.length} data types · ${blueprint.connections.length} connections`,
        });
        await supa.from("work_orders").insert({ project_id: project.id, request: brief, kind: "build", estimate: blueprint.estimate, status: "proposed" });
        const notConnected = blueprint.connections.filter((c) => c.status === "missing").map((c) => c.name);
        const keysNote = notConnected.length ? ` ${notConnected.join(", ")} ${notConnected.length === 1 ? "is" : "are"} not connected yet and run on test data until you add keys.` : "";
        await addLedger(supa, project.id, [
          { lane: "thought", kind: "brief", title: "You described the project", body: answers ? `${brief}\n\n${answers}` : brief },
          {
            lane: "thought",
            kind: "work_order",
            title: `Planned ${blueprint.screens.length} screens and ${blueprint.agents.length} agents`,
            body:
              mode === "live"
                ? `Planned with ${usage?.model}. Planning is free. Building it: ${buildTimeLabel(blueprint.estimate.minutes, totalDuration(buildTimeline(blueprint))).label}, ${blueprint.estimate.credits} credits. Nothing is built until you approve.${keysNote}`
                : `Offline mode: started from the closest starter plan. Planning is free. Building it: ${buildTimeLabel(blueprint.estimate.minutes, totalDuration(buildTimeline(blueprint))).label}, ${blueprint.estimate.credits} credits.${keysNote}`,
            credits: 0,
            checkpointId: cp.id,
          },
        ]);
        // Planning is free to you: 0 credits on your meter. Tokens and real cost are still recorded for our own metrics and the daily model budget.
        if (usage) await logUsage(supa, { userId: user.id, projectId: project.id, kind: "llm", provider: "anthropic", model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd, credits: 0, meta: { op: "plan", free: true, modelCredits: usage.credits } });
        send({ t: "done", projectId: project.id, mode, name: blueprint.meta.name });
      } catch (e) {
        console.error("[plan] save failed", e);
        send({ t: "error", message: e instanceof Error && /guest project cap|row-level/i.test(e.message) ? "Guests can keep up to 8 projects. Sign in to make more." : "Couldn't save the project. Try again." });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
