import "server-only";
import type { SessionUser } from "@/lib/auth";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { withinLimit } from "@/lib/security/rate-limit";

/**
 * Protects the model bill. Every model call first passes a rate limit for what the person is
 * doing, then holds its worst-case cost against two 24-hour budgets: the person's and the whole
 * site's (public.model_budget_hold, decided one request at a time). Past either, the feature takes
 * its scripted path: the product keeps working, it just stops calling the model. Guests have no
 * model budget by default, so a new browser never costs anything. The real cost is metered by
 * logUsage the moment the call returns; the hold is released after that.
 */
export type ModelOp = "plan" | "questions" | "change" | "chat" | "agent" | "import";

/** Worst-case USD per call, with its output cap (see the call sites), and how often a person may make it. */
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

const NO_HOLD: ModelHold = { ok: false, reason: "budget" };

export async function holdModelBudget(user: SessionUser, op: ModelOp): Promise<ModelHold> {
  // Without the admin connection nothing can be metered, so nothing is spent.
  if (!hasAdmin()) return NO_HOLD;
  const spec = OPS[op];
  if (!(await withinLimit(`user:${user.id}:${op}`, spec.max, spec.windowSeconds))) return { ok: false, reason: "rate" };
  const budgets = modelBudgets();
  const cap = user.isAnonymous ? budgets.guest : budgets.member;
  if (cap <= 0 || budgets.site <= 0) return NO_HOLD;
  const admin = adminClient();
  const { data, error } = await admin.rpc("model_budget_hold", {
    p_user: user.id,
    p_estimate_usd: spec.estimateUsd,
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
