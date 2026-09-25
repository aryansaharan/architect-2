import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addCheckpoint, addLedger, createProject, logUsage } from "@/lib/db/writes";
import { starterFor } from "@/lib/blueprint/fixtures";
import { streamPlan, type PlanEvent } from "@/lib/llm/stream-plan";
import { modelBudgetOk } from "@/lib/llm/guard";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { brief?: string; answers?: string };
  const brief = (body.brief ?? "").trim().slice(0, 2000);
  if (brief.length < 8) return Response.json({ error: "Describe what you want in a sentence or two" }, { status: 400 });
  const answers = (body.answers ?? "").slice(0, 600);
  const supa = await createClient();
  const allowModel = await modelBudgetOk(supa, user);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (e: PlanEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      const { blueprint, mode, usage, vertical } = await streamPlan({
        prompt: `Brief: ${brief}\n\nAnswers to quick questions:\n${answers || "(skipped — use sensible defaults)"}`,
        userId: user.id,
        allowModel,
        send,
        fallback: () => starterFor(brief).blueprint,
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
        await addLedger(supa, project.id, [
          { lane: "thought", kind: "brief", title: "You described the project", body: answers ? `${brief}\n\n${answers}` : brief },
          {
            lane: "thought",
            kind: "work_order",
            title: `Planned ${blueprint.screens.length} screens and ${blueprint.agents.length} agents`,
            body:
              mode === "live"
                ? `Planned with ${usage?.model}. Estimated ${blueprint.estimate.minutes} min and ${blueprint.estimate.credits} credits to build — nothing runs until you approve.`
                : `Offline mode: started from the closest starter plan. Estimated ${blueprint.estimate.minutes} min and ${blueprint.estimate.credits} credits to build.`,
            credits: usage?.credits ?? 0,
            checkpointId: cp.id,
          },
        ]);
        if (usage) await logUsage(supa, { userId: user.id, projectId: project.id, kind: "llm", provider: "anthropic", model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd, credits: usage.credits, meta: { op: "plan" } });
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
