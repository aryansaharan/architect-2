import "server-only";
import { generateText } from "ai";
import { usageSummary } from "@/lib/db/queries";
import { logUsage } from "@/lib/db/writes";
import { holdModelBudgetAs, promptHoldUsd } from "@/lib/llm/guard";
import { costOf, failedSpend } from "@/lib/llm/pricing";
import { getModel, supportsEffort } from "@/lib/llm/provider";
import { PRICE, canAfford, outOfCreditsNote } from "@/lib/pricing";
import { monthStartIso } from "@/lib/prices";
import { adminClient } from "@/lib/supabase/admin";

/**
 * prod.ai.ask: one short, plain-text answer from Claude for a code app. Whoever pays (the owner for a
 * published app, the person testing in the studio) is checked first: the model budget hold (which also
 * rate-limits the caller), this month's credits, and for a published app the project's spending cap.
 * A successful answer costs PRICE.helperMessage; a failed call is metered at its real cost but never charged.
 */
export const PROMPT_MAX = 4_000;
/** About 600 words. */
const MAX_OUTPUT_TOKENS = 900;

export type AskResult = { ok: true; answer: string } | { ok: false; status: number; error: string };

/** The prompt from a request body: text, 1 to 4,000 characters. */
export function readPrompt(body: unknown): { ok: true; prompt: string } | { ok: false; error: string } {
  const prompt = body && typeof body === "object" ? (body as { prompt?: unknown }).prompt : undefined;
  if (typeof prompt !== "string" || !prompt.trim()) return { ok: false, error: "Send a question: { prompt: \"...\" }." };
  if (prompt.length > PROMPT_MAX) return { ok: false, error: `A question can be at most ${PROMPT_MAX.toLocaleString("en-US")} characters.` };
  return { ok: true, prompt: prompt.trim() };
}

const instructions = (title: string) =>
  [
    `You answer requests from inside a small web app called "${title.slice(0, 60)}". The app passes along what its user asked, or what the app needs.`,
    "Answer in plain text: no Markdown, no headings, no code fences unless code is asked for. Be direct and brief, at most about 600 words.",
    "If the request asks for a specific format (a list, JSON, one word), give exactly that and nothing around it.",
  ].join("\n");

/** Whether the payer is a guest (no credits, no model budget). Unknown accounts count as guests: nothing is spent. */
export async function isGuestAccount(userId: string): Promise<boolean> {
  const { data, error } = await adminClient().auth.admin.getUserById(userId);
  return Boolean(error || !data?.user || data.user.is_anonymous);
}

export async function askForCodeApp(p: {
  prompt: string;
  title: string;
  projectId: string;
  payer: { id: string; isGuest: boolean };
  /** Who is asking, for the rate limit: "user:<id>" or a visitor's network key. */
  rateKey: string;
  surface: "live" | "preview";
  actor: string;
  /** A published app stops at the owner's monthly cap for the project. */
  capCredits?: number;
}): Promise<AskResult> {
  const m = getModel();
  if (!m) return { ok: false, status: 503, error: "AI isn't switched on for this copy of Prod AI." };
  if (p.payer.isGuest) return { ok: false, status: 402, error: p.surface === "live" ? "The app's AI isn't available: its owner hasn't signed in to Prod AI." : "Sign in to use AI in your app. Each answer costs 5 credits from your monthly allowance." };
  const system = instructions(p.title);
  const hold = await holdModelBudgetAs({ payerId: p.payer.id, payerIsGuest: false, rateKey: `${p.rateKey}:code-ai`, op: "chat", estimateUsd: promptHoldUsd(system.length + p.prompt.length, MAX_OUTPUT_TOKENS) });
  if (!hold.ok) return hold.reason === "rate" ? { ok: false, status: 429, error: "That's a lot of questions in a few minutes. Give it a moment, then try again." } : { ok: false, status: 503, error: "The AI has done all it can for today. Try again tomorrow." };
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await hold.release();
  };
  try {
    const [afford, spent] = await Promise.all([canAfford(p.payer.id, false, "helperMessage"), p.capCredits !== undefined ? usageSummary(adminClient(), { projectId: p.projectId, sinceIso: monthStartIso() }).catch(() => null) : Promise.resolve(null)]);
    if (!afford.ok) return { ok: false, status: 402, error: p.surface === "live" ? "The app's owner has used this month's AI credits, so its AI is resting until they come back." : outOfCreditsNote(afford.credits, "the app's AI can't answer right now") };
    if (p.capCredits !== undefined && (!spent || spent.credits >= p.capCredits)) return { ok: false, status: 402, error: "This app has reached its monthly spending limit, so its AI is resting for now." };

    const meta = { op: "code-ai", surface: p.surface, actor: p.actor };
    let result: Awaited<ReturnType<typeof generateText>> | null = null;
    try {
      result = await generateText({
        model: m.model,
        instructions: system,
        prompt: p.prompt,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        timeout: 60_000,
        maxRetries: 0,
        providerOptions: { anthropic: { ...(supportsEffort(m.id) ? { effort: "low" as const } : {}), metadata: { userId: p.actor.slice(0, 60) } } },
      });
    } catch (e) {
      console.error("[code-apps] ai failed:", e instanceof Error ? e.message.slice(0, 200) : e);
      const spend = await failedSpend(m.id, undefined, { inputTokens: Math.ceil((system.length + p.prompt.length) / 3.5), outputTokens: MAX_OUTPUT_TOKENS });
      await logUsage({ userId: p.payer.id, projectId: p.projectId, kind: "llm", provider: "anthropic", model: m.id, inputTokens: spend.inputTokens, outputTokens: spend.outputTokens, costUsd: spend.costUsd, credits: 0, meta: { ...meta, failed: true, estimated: spend.estimated } });
      return { ok: false, status: 502, error: "The AI didn't answer this time. Try again." };
    }
    const input = result.usage.inputTokens ?? 0;
    const output = result.usage.outputTokens ?? 0;
    const answer = result.text.trim();
    // An empty answer isn't one: it's metered but not charged.
    await logUsage({ userId: p.payer.id, projectId: p.projectId, kind: "llm", provider: "anthropic", model: m.id, inputTokens: input, outputTokens: output, costUsd: costOf(m.id, input, output).costUsd, credits: answer ? PRICE.helperMessage : 0, meta: answer ? meta : { ...meta, failed: true } });
    if (!answer) return { ok: false, status: 502, error: "The AI didn't answer this time. Try again." };
    return { ok: true, answer };
  } finally {
    await release();
  }
}
