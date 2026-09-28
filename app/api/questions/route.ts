import { after } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { logUsage } from "@/lib/db/writes";
import { holdModelBudget } from "@/lib/llm/guard";
import { questionsWithModel } from "@/lib/llm/questions";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * POST { brief } → { questions } written for this brief, or { questions: null }
 * when there's no model, the daily model budget is used up, or it was too slow.
 * The new-project page shows the template questions right away and swaps these
 * in only if they arrive before the person has answered anything.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { brief: raw } = (await req.json().catch(() => ({}))) as { brief?: unknown };
  const brief = (typeof raw === "string" ? raw : "").trim().slice(0, 2000);
  if (brief.length < 12) return Response.json({ error: "Describe what you want in a sentence or two" }, { status: 400 });

  // No budget (or asking too often) just means the page keeps its template questions.
  const hold = await holdModelBudget(user, "questions");
  if (!hold.ok) return Response.json({ questions: null, mode: "offline", reason: hold.reason });

  const started = Date.now();
  const result = await questionsWithModel(brief, { userId: user.id });
  const ms = Date.now() - started;

  // Questions are free to you, like planning: 0 credits on your meter. Tokens and real cost are still
  // metered (even for an answer that wasn't usable, or a call that timed out) for the daily model budget.
  // Metered after the response, so it never slows it; the hold is released once the cost is recorded.
  const usage = result.usage;
  after(async () => {
    if (usage) await logUsage({ userId: user.id, projectId: null, kind: "llm", provider: "anthropic", model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd, credits: 0, meta: { op: "questions", free: true, modelCredits: usage.credits, ms, used: result.mode === "live" } });
    await hold.release();
  });
  if (result.mode === "offline") return Response.json({ questions: null, mode: "offline" }, { headers: { "Cache-Control": "no-store" } });
  return Response.json({ questions: result.questions, mode: "live", model: result.usage.model, ms: result.ms }, { headers: { "Cache-Control": "no-store" } });
}
