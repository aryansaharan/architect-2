import "server-only";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { PRICE, resetWords, type CreditMeter, type Credits, type Priced } from "@/lib/prices";

/**
 * What Prod AI charges, in credits, and each person's monthly allowance. Only work that calls the
 * model costs credits; making an app real, publishing it and anything that runs without the model
 * (starter plans, rule-based changes, scripted answers) is free. A call that fails is never charged.
 * Guests have no allowance: they use the free starter plans. Allowances reset on the 1st (UTC).
 * The prices themselves are in lib/prices.ts (browser-safe), so pages show the same numbers.
 * The real cost of every call is still metered separately for the daily model budget (lib/llm/guard.ts).
 */
export { PRICE, resetWords };
export type { Credits, Priced };

export function monthlyAllowance(isGuest: boolean): number {
  if (isGuest) return 0;
  const n = Number(process.env.FREE_CREDITS_PER_MONTH);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 300;
}

const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** This month's credits for one person: what they've used, their allowance, and what's left. */
export async function creditsThisMonth(userId: string, isGuest: boolean): Promise<Credits> {
  const allowance = monthlyAllowance(isGuest);
  const start = monthStart();
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const resetsOn = next.toISOString().slice(0, 10);
  if (!hasAdmin()) return { used: 0, allowance, left: 0, resetsOn };
  const { data, error } = await adminClient().rpc("credits_used_since", { p_user: userId, p_since: start.toISOString() });
  if (error) console.error("[pricing] meter read failed", error.message);
  const used = Math.max(0, Math.round((Number(data) || 0) * 100) / 100);
  return { used, allowance, left: error ? 0 : Math.max(0, allowance - used), resetsOn };
}

/** The meter for the top bar, Home and Settings: this month's credits, and for a guest what signing in gives. */
export async function creditMeter(user: { id: string; isAnonymous: boolean }): Promise<CreditMeter> {
  const credits = await creditsThisMonth(user.id, user.isAnonymous);
  return { ...credits, guest: user.isAnonymous, memberAllowance: monthlyAllowance(false) };
}

/** Whether this person can pay for one of these right now. */
export async function canAfford(userId: string, isGuest: boolean, what: Priced): Promise<{ ok: boolean; credits: Credits }> {
  const credits = await creditsThisMonth(userId, isGuest);
  return { ok: credits.left >= PRICE[what], credits };
}

/** Said when a person's credits don't cover what they asked for and the free path is taken instead: "..., so <then>." */
export function outOfCreditsNote(c: Credits, then: string): string {
  const left = Math.floor(c.left);
  const where = left > 0 ? `You have ${left} of this month's ${c.allowance} free credits left, not enough for this,` : `You've used this month's ${c.allowance} free credits,`;
  return `${where} so ${then}. ${resetWords(c.resetsOn)}`;
}
