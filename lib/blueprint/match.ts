import type { Vertical } from "./schema";

/** Keyword table used when no model is available (or it fails): brief → closest starter. */
const KEYWORDS: Record<Exclude<Vertical, "custom">, string[]> = {
  claims: ["claim", "insur", "adjuster", "fraud", "policyholder", "underwrit", "payout", "loss", "settlement"],
  support: ["support", "ticket", "helpdesk", "help desk", "customer service", "inbox", "zendesk", "faq", "reply", "complaint", "sla"],
  sales: ["sales", "lead", "prospect", "account research", "outreach", "crm", "pipeline", "deal", "hubspot", "salesforce", "sdr", "cold email"],
  hr: ["hr", "onboard", "new hire", "employee", "recruit", "hiring", "payroll", "people team", "offboard", "workday", "okta", "laptop"],
};

export function matchVertical(brief: string): { vertical: Exclude<Vertical, "custom">; confidence: number } {
  const text = ` ${brief.toLowerCase()} `;
  let best: Exclude<Vertical, "custom"> = "support";
  let bestScore = 0;
  for (const [v, words] of Object.entries(KEYWORDS) as [Exclude<Vertical, "custom">, string[]][]) {
    const score = words.reduce((s, w) => s + (text.includes(w) ? (w.length > 4 ? 2 : 1) : 0), 0);
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return { vertical: best, confidence: Math.min(1, bestScore / 4) };
}

/** A short project name from a free-text brief ("A claims triage desk for…" → "Claims Triage Desk"). */
export function nameFromBrief(brief: string, fallback: string): string {
  const cleaned = brief
    .replace(/[\n\r]+/g, " ")
    .replace(/^(please\s+)?(build|create|make|i want|i need|we need|an?|the)\s+/gi, "")
    .replace(/^(an?|the)\s+/i, "");
  const head = cleaned.split(/[:.,;—–-]| for | that | which | to | with /i)[0]?.trim() ?? "";
  const words = head.split(/\s+/).filter(Boolean).slice(0, 5);
  if (words.length < 2 || head.length > 48) return fallback;
  return words.map((w) => (w.length <= 3 && /^(and|of|the|for|to|a|an|in)$/i.test(w) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1))).join(" ");
}
