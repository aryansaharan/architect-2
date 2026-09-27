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
