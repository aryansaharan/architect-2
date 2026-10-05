import type { Vertical } from "./schema";

/** Keyword table used when no model is available (or it fails): brief → closest starter. */
const KEYWORDS: Record<Exclude<Vertical, "custom">, string[]> = {
  claims: ["claim", "insur", "adjuster", "fraud", "policyholder", "underwrit", "payout", "loss", "settlement"],
  support: ["support", "ticket", "helpdesk", "help desk", "customer service", "inbox", "zendesk", "faq", "reply", "complaint", "sla"],
  sales: ["sales", "lead", "prospect", "account research", "outreach", "crm", "pipeline", "deal", "hubspot", "salesforce", "sdr", "cold email"],
  hr: ["hr", "onboard", "new hire", "employee", "recruit", "hiring", "payroll", "people team", "offboard", "workday", "okta", "laptop"],
};

/**
 * Whether a keyword is in the brief. Short words must start a word, so "hr" isn't found in "three",
 * "deal" in "ideal" or "lead" in "misleading". Acronyms (three letters or fewer) must be the whole word.
 */
function has(text: string, w: string): boolean {
  if (w.length > 4) return text.includes(w);
  return new RegExp(w.length <= 3 ? `\\b${w}s?\\b` : `\\b${w}`).test(text);
}

/** A keyword's weight: long words and whole-word acronyms say more than a short word. */
const weight = (w: string) => (w.length > 4 || w.length <= 3 ? 2 : 1);

/** Below this score no starter plan is close to the brief: the one picked is only a general place to start. */
const CLOSE_ENOUGH = 2;

export type StarterMatch = {
  vertical: Exclude<Vertical, "custom">;
  /** 0 to 1: how sure the match is (used to pick the template questions). */
  confidence: number;
  /** How many of the starter's keywords the brief contains. */
  hits: number;
  /** True when no starter plan is close: the brief shares (almost) no words with any of them. */
  weak: boolean;
};

export function matchVertical(brief: string): StarterMatch {
  const text = ` ${brief.toLowerCase()} `;
  let best: Exclude<Vertical, "custom"> = "support";
  let bestScore = 0;
  let bestHits = 0;
  for (const [v, words] of Object.entries(KEYWORDS) as [Exclude<Vertical, "custom">, string[]][]) {
    const found = words.filter((w) => has(text, w));
    const score = found.reduce((s, w) => s + weight(w), 0);
    if (score > bestScore) {
      best = v;
      bestScore = score;
      bestHits = found.length;
    }
  }
  return { vertical: best, confidence: Math.min(1, bestScore / 4), hits: bestHits, weak: bestScore < CLOSE_ENOUGH };
}

/** The starter plans by what they are, for saying plainly which one a plan started from. */
const STARTER_NAME: Record<Exclude<Vertical, "custom">, string> = {
  claims: "a claims desk",
  support: "a support inbox",
  sales: "a sales research desk",
  hr: "a new-hire checklist",
};

/** Said to a guest before and while a plan starts from a starter: the closest one, or, when none is close, which one it is. */
export function guestStarterNote(brief: string): string {
  const m = matchVertical(brief);
  return m.weak
    ? `None of the starter plans is close to this, so it starts from the nearest one (${STARTER_NAME[m.vertical]}) for you to reshape with notes. Sign in and Claude plans it from your own words.`
    : "Guests start from the closest starter plan. Sign in and Claude plans it from your own words.";
}
