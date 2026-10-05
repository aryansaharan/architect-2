import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addCheckpoint, addLedger, createProject, logUsage } from "@/lib/db/writes";
import { starterFor } from "@/lib/blueprint/fixtures";
import { guestStarterNote, matchVertical } from "@/lib/blueprint/match";
import { streamPlan, type PlanEvent } from "@/lib/llm/stream-plan";
import { holdModelBudget } from "@/lib/llm/guard";
import { PRICE, canAfford, outOfCreditsNote } from "@/lib/pricing";
import { projectCapMessage } from "@/lib/security/caps";
import { NOTHING_CONNECTED_NOTE, cleanConnections, connectionsNote, ensureConnections, isNothingOnly, saysNothingConnected, startNotConnected } from "@/lib/llm/draft";
import { estimate } from "@/lib/blueprint/estimate";
import type { Blueprint } from "@/lib/blueprint/schema";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** "1 AI helper", "2 AI helpers": counts in plain words. */
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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
  // Don't spend a model call on a plan that couldn't be saved.
  const full = await projectCapMessage(supa, user);
  if (full) return Response.json({ error: full, code: "cap" }, { status: 403 });
  const hold = await holdModelBudget(user, "plan");
  if (!hold.ok && hold.reason === "rate") return Response.json({ error: "That's a lot of plans in a few minutes. Wait a little, then try again." }, { status: 429 });
  // A plan by Claude costs credits; without enough, it starts from the closest starter plan, free.
  const afford = hold.ok ? await canAfford(user.id, user.isAnonymous, "plan") : null;
  if (hold.ok && afford && !afford.ok) await hold.release();
  const useModel = hold.ok && Boolean(afford?.ok);
  // When no starter plan shares the brief's words, say so plainly instead of calling it the closest.
  const weak = matchVertical(brief).weak;
  const noModelNote = user.isAnonymous
    ? guestStarterNote(brief)
    : afford && !afford.ok
      ? outOfCreditsNote(afford.credits, weak ? "and none of the starter plans is close to this, so this plan starts from a general one" : "this plan starts from the closest starter plan")
      : undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (e: PlanEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      let projectId: string | null = null;
      let spent: Awaited<ReturnType<typeof streamPlan>>["spent"] = null;
      try {
        const { blueprint, mode, spent: cost, vertical } = await streamPlan({
          prompt: `Brief: ${brief}\n\nAnswers to quick questions:\n${answers || "(skipped, use sensible defaults)"}${nothingConnected ? `\n\n${NOTHING_CONNECTED_NOTE}` : wanted.length ? `\n\n${connectionsNote(wanted)}` : ""}`,
          userId: user.id,
          allowModel: useModel,
          noModelNote,
          send,
          fallback: () => starterFor(brief).blueprint,
          adjust,
          failureNote: weak
            ? "The model didn't answer in time, and none of the starter plans is close to this, so this is a general one to start from. You can reshape it before building."
            : "The model didn't answer in time, so I started from the closest starter plan. You can reshape it before building.",
        });
        spent = cost;
        const project = await createProject(supa, { ownerId: user.id, name: blueprint.meta.name, vertical, brief, blueprint, buildState: "draft" });
        projectId = project.id;
        const cp = await addCheckpoint(supa, project.id, {
          label: "Plan v1",
          kind: "blueprint",
          blueprint,
          summary: `${count(blueprint.screens.length, "screen")} · ${count(blueprint.agents.length, "AI helper")} · ${count(blueprint.entities.length, "data type")} · ${count(blueprint.connections.length, "connection")}`,
        });
        await supa.from("work_orders").insert({ project_id: project.id, request: brief, kind: "build", estimate: blueprint.estimate, status: "proposed" });
        const notConnected = blueprint.connections.filter((c) => c.status === "missing").map((c) => c.name);
        const keysNote = notConnected.length ? ` ${notConnected.join(", ")} ${notConnected.length === 1 ? "is" : "are"} not connected yet and run on test data until you add keys.` : "";
        await addLedger(supa, project.id, [
          { lane: "thought", kind: "brief", title: "You described the project", body: answers ? `${brief}\n\n${answers}` : brief },
          {
            lane: "thought",
            kind: "work_order",
            title: `Planned ${count(blueprint.screens.length, "screen")} and ${count(blueprint.agents.length, "AI helper")}`,
            // Plain facts, no model names: who planned it, what it costs, and that nothing is built yet.
            body:
              mode === "live"
                ? `Planned by Claude from your words · ${PRICE.plan} credits. Making it real is free, and nothing is built until you press it.${keysNote}`
                : `Started from ${weak ? "a general starter plan (none is close to this)" : "the closest starter plan"}, free. Making it real is free too, and nothing is built until you press it.${keysNote}`,
            credits: mode === "live" ? PRICE.plan : 0,
            checkpointId: cp.id,
          },
        ]);
        send({ t: "done", projectId: project.id, mode, name: blueprint.meta.name });
      } catch (e) {
        console.error("[plan] save failed", e);
        // At the project cap the person can't fix it by trying again: say so, with its own code so the page offers sign-in instead.
        const cap = e instanceof Error && /project cap|row-level/i.test(e.message) ? await projectCapMessage(supa, user) : null;
        send(cap ? { t: "error", message: cap, code: "cap" } : { t: "error", message: "Couldn't save the project. Try again." });
      } finally {
        // A saved plan by Claude costs its price; a failed call or a plan that couldn't be saved costs you nothing.
        // Its real cost is metered either way, for the daily model budget (the provider bills a failed call too).
        const charged = spent && !spent.failed && projectId ? PRICE.plan : 0;
        if (spent) await logUsage({ userId: user.id, projectId, kind: "llm", provider: "anthropic", model: spent.model, inputTokens: spent.inputTokens, outputTokens: spent.outputTokens, costUsd: spent.costUsd, credits: charged, meta: { op: "plan", modelCredits: spent.credits, failed: spent.failed, estimated: spent.estimated } });
        if (useModel) await hold.release();
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
