/**
 * What Prod AI charges, in credits, safe to use in the browser. The server's rules (the monthly allowance,
 * who can afford what) are in lib/pricing.ts, which takes its prices from here: one source of truth.
 * Only work that calls Claude costs credits. Making an app real, publishing and anything scripted are free.
 */
export const PRICE = {
  plan: 40,
  import: 40,
  change: 15,
  newHelper: 10,
  helperMessage: 5,
} as const;

export type Priced = keyof typeof PRICE;

/** One person's credits this month: what they've used, their allowance, what's left, and the day it resets (YYYY-MM-DD, UTC). */
export type Credits = { used: number; allowance: number; left: number; resetsOn: string };

/** The meter pages show: this month's credits, whether it's a guest, and the monthly allowance signing in gives. */
export type CreditMeter = Credits & { guest: boolean; memberAllowance: number };

/** What costs credits, in plain words, in the order people meet them. */
export const PRICE_LIST: { what: string; credits: number }[] = [
  { what: "Planning an app with Claude", credits: PRICE.plan },
  { what: "Importing a repo with Claude", credits: PRICE.import },
  { what: "Applying a change Claude wrote", credits: PRICE.change },
  { what: "A new AI helper Claude writes", credits: PRICE.newHelper },
  { what: "Each AI helper message Claude answers", credits: PRICE.helperMessage },
];

/** "1 Oct": the day credits come back. */
export function resetDay(resetsOn: string): string {
  return new Date(`${resetsOn}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "They come back on 1 Oct." */
export function resetWords(resetsOn: string): string {
  return `They come back on ${resetDay(resetsOn)}.`;
}

/** The start of this month in UTC, when allowances reset and each project's spending cap starts again. */
export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
