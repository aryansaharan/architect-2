import { after } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { logUsage } from "@/lib/db/writes";
import { holdModelBudget } from "@/lib/llm/guard";
import { questionsWithModel } from "@/lib/llm/questions";
import { decideKind, kindFromWords } from "@/lib/code-apps/kind";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * POST { brief } → { questions, kind, kindReason, kindBy }: the questions written for this brief
 * (or `questions: null` when there's no model, the daily model budget is used up, or it was too slow),
 * and which kind of app it is: "business" (a tool for a team's work) or "code" (anything else, which
 * Claude writes as real code), with a one-line reason. Claude decides the kind with the fast model, at
 * the same time as the questions; without a model the brief's words decide (`kindBy: "words"`).
 * The new-project page shows the template questions right away and swaps these in only if they arrive
 * before the person has answered anything; the person can switch the kind before planning.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { brief: raw } = (await req.json().catch(() => ({}))) as { brief?: unknown };
  const brief = (typeof raw === "string" ? raw : "").trim().slice(0, 2000);
  if (brief.length < 12) return Response.json({ error: "Describe what you want in a sentence or two" }, { status: 400 });

  // No budget (or asking too often) just means the page keeps its template questions, and the words pick the kind.
  // One hold covers both small calls (questions and kind), so it holds a little more than the questions alone.
  const hold = await holdModelBudget(user, "questions", 0.04);
  if (!hold.ok) {
    const k = kindFromWords(brief);
    return Response.json({ questions: null, mode: "offline", reason: hold.reason, kind: k.kind, kindReason: k.reason, kindBy: k.by }, { headers: { "Cache-Control": "no-store" } });
  }

  const started = Date.now();
  const [result, kind] = await Promise.all([questionsWithModel(brief, { userId: user.id }), decideKind(brief, { userId: user.id })]);
  const ms = Date.now() - started;

  // Questions and the kind are free to you, like quotes: 0 credits on your meter. Tokens and real cost are still
  // metered (even for an answer that wasn't usable, or a call that timed out) for the daily model budget.
  // Metered after the response, so it never slows it; the hold is released once the cost is recorded.
  const usage = result.usage;
  const kindUsage = kind.usage;
  after(async () => {
    if (usage) await logUsage({ userId: user.id, projectId: null, kind: "llm", provider: "anthropic", model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd, credits: 0, meta: { op: "questions", free: true, modelCredits: usage.credits, ms, used: result.mode === "live" } });
    if (kindUsage) await logUsage({ userId: user.id, projectId: null, kind: "llm", provider: "anthropic", model: kindUsage.model, inputTokens: kindUsage.inputTokens, outputTokens: kindUsage.outputTokens, costUsd: kindUsage.costUsd, credits: 0, meta: { op: "kind", free: true, modelCredits: kindUsage.credits, failed: kindUsage.failed, used: kind.by === "claude" } });
    await hold.release();
  });
  const kinds = { kind: kind.kind, kindReason: kind.reason, kindBy: kind.by };
  if (result.mode === "offline") return Response.json({ questions: null, mode: "offline", ...kinds }, { headers: { "Cache-Control": "no-store" } });
  return Response.json({ questions: result.questions, mode: "live", model: result.usage.model, ms: result.ms, ...kinds }, { headers: { "Cache-Control": "no-store" } });
}
