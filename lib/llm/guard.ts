import "server-only";
import type { SessionUser } from "@/lib/auth";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { withinLimit } from "@/lib/security/rate-limit";
import { BlueprintSchema } from "@/lib/blueprint/schema";
import { getModel } from "./provider";
import { costOf } from "./pricing";

/**
 * Protects the model bill. Every model call first passes a rate limit for what the person is
 * doing, then holds its worst-case cost against two 24-hour budgets: the person's and the whole
 * site's (public.model_budget_hold, decided one request at a time). Past either, the feature takes
 * its scripted path: the product keeps working, it just stops calling the model. Guests have no
 * model budget by default, so a new browser never costs anything. The real cost is metered by
 * logUsage the moment the call returns; the hold is released after that.
 */
export type ModelOp = "plan" | "questions" | "change" | "chat" | "agent" | "import";

/** The least each call holds (a call with a big prompt holds more, see promptHoldUsd), and how often a person may make it. */
const OPS: Record<ModelOp, { estimateUsd: number; max: number; windowSeconds: number }> = {
  plan: { estimateUsd: 0.3, max: 6, windowSeconds: 600 },
  import: { estimateUsd: 0.3, max: 6, windowSeconds: 600 },
  questions: { estimateUsd: 0.02, max: 20, windowSeconds: 600 },
  change: { estimateUsd: 0.1, max: 30, windowSeconds: 600 },
  chat: { estimateUsd: 0.25, max: 30, windowSeconds: 600 },
  agent: { estimateUsd: 0.25, max: 30, windowSeconds: 600 },
};

const usd = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

/** 24-hour budgets in USD. Set them in the environment; these defaults are deliberately small. */
export function modelBudgets() {
  return {
    guest: usd("LLM_DAILY_USD_GUEST", 0),
    member: usd("LLM_DAILY_USD_MEMBER", 1),
    site: usd("LLM_DAILY_USD_SITE", 10),
  };
}

export type ModelHold = { ok: true; release: () => Promise<void> } | { ok: false; reason: "rate" | "budget" };

/** About 3.5 characters a token for English and JSON. */
const CHARS_PER_TOKEN = 3.5;

/**
 * The worst case for a call whose prompt is this long: every step reads the whole prompt and writes its full
 * output cap. Owners can make a plan large, so a fixed estimate per call could let the daily caps be overshot.
 */
export function promptHoldUsd(promptChars: number, maxOutputTokens: number, maxSteps = 1): number {
  const m = getModel();
  if (!m) return 0;
  return costOf(m.id, Math.ceil(promptChars / CHARS_PER_TOKEN), maxOutputTokens).costUsd * maxSteps;
}

/** Past this size (characters of JSON) a plan never goes to the model: the feature takes its scripted path. */
export const MAX_PLAN_CHARS_FOR_MODEL = 150_000;

/**
 * Whether a saved plan may go into a model prompt: it passes the schema (its length limits included) and it
 * isn't huge. Owners can write their own plan row directly, so the model never trusts it unchecked.
 */
export function planFitsModel(bp: unknown): boolean {
  try {
    if (JSON.stringify(bp).length > MAX_PLAN_CHARS_FOR_MODEL) return false;
  } catch {
    return false;
  }
  return BlueprintSchema.safeParse(bp).success;
}

const NO_HOLD: ModelHold = { ok: false, reason: "budget" };

export async function holdModelBudget(user: SessionUser, op: ModelOp, estimateUsd?: number): Promise<ModelHold> {
  return holdModelBudgetAs({ payerId: user.id, payerIsGuest: user.isAnonymous, rateKey: `user:${user.id}`, op, estimateUsd });
}

/**
 * The same hold when the person asking isn't the one who pays: a published app's AI helper is paid
 * for by the app's owner, while the rate limit follows whoever is typing (a team member or a visitor's network).
 */
export async function holdModelBudgetAs(p: { payerId: string; payerIsGuest: boolean; rateKey: string; op: ModelOp; estimateUsd?: number }): Promise<ModelHold> {
  // Without the admin connection nothing can be metered, so nothing is spent.
  if (!hasAdmin()) return NO_HOLD;
  const spec = OPS[p.op];
  if (!(await withinLimit(`${p.rateKey}:${p.op}`, spec.max, spec.windowSeconds))) return { ok: false, reason: "rate" };
  const budgets = modelBudgets();
  const cap = p.payerIsGuest ? budgets.guest : budgets.member;
  if (cap <= 0 || budgets.site <= 0) return NO_HOLD;
  const admin = adminClient();
  const { data, error } = await admin.rpc("model_budget_hold", {
    p_user: p.payerId,
    // Rounded up to the cent; never below the op's floor.
    p_estimate_usd: Math.ceil(Math.max(spec.estimateUsd, p.estimateUsd ?? 0) * 100) / 100,
    p_user_cap_usd: cap,
    p_site_cap_usd: budgets.site,
  });
  if (error) {
    console.error("model budget hold failed", error.message);
    return NO_HOLD;
  }
  if (!data) return NO_HOLD;
  const holdId = data as string;
  let released = false;
  return {
    ok: true,
    release: async () => {
      if (released) return;
      released = true;
      const { error: e } = await admin.rpc("model_budget_release", { p_hold: holdId });
      if (e) console.error("model budget release failed", e.message);
    },
  };
}
