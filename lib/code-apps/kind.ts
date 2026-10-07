import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { STYLE_RULE, noEmDash } from "@/lib/text";
import { getFastModel, supportsEffort } from "@/lib/llm/provider";
import { costOf, failedSpend, type ModelSpend } from "@/lib/llm/pricing";

/**
 * Which kind of app an idea is. "business": a tool for a team's work (records, queues, approvals, AI
 * helpers), made from a Blueprint and shown by the renderer. "code": anything else (games, sites,
 * portfolios, quizzes, visual and creative tools), written by Claude as real source files.
 * Claude decides with the fast model; without one (or when it's slow) the idea's words decide.
 * The person can switch it on /new before planning: POST /api/plan takes `kind`.
 */
export type AppKind = "business" | "code";
export type KindDecision = { kind: AppKind; reason: string; by: "claude" | "words" };

/** A body's `kind`, trusted only as one of the two names. Anything else is a business app, as before. */
export const asKind = (v: unknown): AppKind => (v === "code" ? "code" : "business");

// Words that point one way or the other. Strong words count twice. Kept to whole words, case-insensitive.
const CODE_STRONG =
  /\b(games?|gaming|playable|puzzles?|quiz(?:zes)?|trivia|flash ?cards?|portfolio|landing pages?|websites?|homepage|personal (?:site|page)|blog|resume|cv|wedding|birthday|invitations?|rsvp|drawing|paint(?:ing)?|sketch ?pad|pixel art|synth(?:esizer)?|drum ?(?:machine|kit|pad)|piano|metronome|animations?|animated|3d|visuali[sz]er|generator|simulat(?:or|ion)|pomodoro|stopwatch|countdown|calculator|typing (?:test|game)|tetris|snake|chess|sudoku|wordle|crossword|memory game|breakout|pong|platformer|arcade|tic[- ]tac[- ]toe|minesweeper|solitaire|gallery|fan ?site|toy|playground|story ?book|interactive story|soundboard|music (?:app|player|maker)|art app|screensaver)\b/gi;
const CODE_WEAK = /\b(fun|kids|children|personal|my (?:own )?(?:site|page)|showcase|recipes?|journal|diary|habits?|mood|timer|clock|converter|learn(?:ing)?|lessons?|practice|creative|beautiful|visual|interactive|play)\b/gi;
const BUSINESS_STRONG =
  /\b(crm|invoic(?:e|es|ing)|claims?|approv(?:e|es|ed|als?)|tickets?|ticketing|help ?desk|leads|sales pipeline|onboarding|employees?|hr|recruit(?:ing|ment|ers?)?|candidates|applicants|vendors?|suppliers?|procurement|purchase orders?|contracts?|compliance|audits?|triage|case management|caseload|inventory|expenses?|reimburse(?:ments?)?|payroll|timesheets?|back[- ]office|intake|queues?|workflows?|sla|escalat(?:e|es|ion|ions)|underwrit(?:e|ing|ers?)|dispatch|work orders?|ai agents?|ai helpers?|my team|our team|the team|staff|records)\b/gi;
const BUSINESS_WEAK = /\b(customers?|clients?|orders?|requests?|dashboards?|reports?|tracking|tracker|manag(?:e|es|ing|er|ers|ement)|team|company|business|internal|accounts?)\b/gi;

const hits = (re: RegExp, s: string) => (s.match(re) ?? []).length;

/** The keyword fallback: the idea's own words decide, and a tie stays a business app (it works for everyone, free). */
export function kindFromWords(brief: string): KindDecision {
  const code = hits(CODE_STRONG, brief) * 2 + hits(CODE_WEAK, brief);
  const business = hits(BUSINESS_STRONG, brief) * 2 + hits(BUSINESS_WEAK, brief);
  if (code > business)
    return { kind: "code", reason: "It sounds like a game, a site or a creative app, so Claude would write it as real code.", by: "words" };
  if (business > 0)
    return { kind: "business", reason: "It sounds like a tool for a team's work: records, requests and approvals.", by: "words" };
  return { kind: "business", reason: "Nothing points to a game or a site, so it starts as a business app. You can switch.", by: "words" };
}

const KindSchema = z.object({
  kind: z.enum(["business", "code"]),
  reason: z.string().describe("One short plain sentence for the person, under 16 words, in their idea's words"),
});

const INSTRUCTIONS = `You sort app ideas for Prod AI, which makes two kinds of app:
- "business": a tool for a team's or an organisation's work: records and forms, queues, approvals, case or ticket handling, CRMs, inventories, internal dashboards over company data, AI helpers (agents) that act on business systems. Prod AI builds these from a typed plan of screens, data, AI helpers and approvals.
- "code": anything else: games, websites, portfolios and landing pages, quizzes and learning apps, personal tools, calculators and converters, simulations, visual, musical or creative apps, toys, anything that needs custom visuals or interaction. Claude writes these as real source code.
Choose "business" only when the idea is mainly about people at work handling records, requests or approvals. Custom visuals or play mean "code".
reason: why, in one short plain sentence that uses the idea's own words, like "A memory game needs custom visuals and play, so Claude writes real code." or "Tracking claims with approvals is a team's work, so it's a business app."`;

export type KindResult = KindDecision & { usage?: ModelSpend };

/** Claude decides with the fast model, on a tight timeout; without a model, or when it fails, the words decide. Never throws. */
export async function decideKind(brief: string, opts: { userId?: string; timeoutMs?: number; allowModel?: boolean } = {}): Promise<KindResult> {
  const fallback = kindFromWords(brief);
  const m = opts.allowModel === false ? null : getFastModel();
  if (!m) return fallback;
  try {
    const result = await generateText({
      model: m.model,
      instructions: `${INSTRUCTIONS}\n\n${STYLE_RULE}`,
      prompt: `Idea: ${brief}`,
      output: Output.object({ schema: KindSchema, name: "app_kind" }),
      maxOutputTokens: 400,
      timeout: opts.timeoutMs ?? (m.fast ? 6_000 : 8_000),
      maxRetries: 0,
      providerOptions: {
        anthropic: {
          ...(supportsEffort(m.id) ? { effort: "low" as const } : {}),
          structuredOutputMode: "outputFormat",
          ...(opts.userId ? { metadata: { userId: opts.userId } } : {}),
        },
      },
    });
    const inputTokens = result.usage.inputTokens ?? 0;
    const outputTokens = result.usage.outputTokens ?? 0;
    const usage: ModelSpend = { model: m.id, inputTokens, outputTokens, ...costOf(m.id, inputTokens, outputTokens) };
    const out = result.output;
    const reason = noEmDash(out.reason ?? "").trim().slice(0, 160);
    if (out.kind !== "business" && out.kind !== "code") return { ...fallback, usage };
    return { kind: out.kind, reason: reason || fallback.reason, by: "claude", usage };
  } catch (e) {
    console.error("[kind] using the words instead:", e instanceof Error ? e.message.slice(0, 200) : e);
    // A timed-out call is still billed: meter the most its output cap allows.
    return { ...fallback, usage: await failedSpend(m.id, undefined, { inputTokens: 800, outputTokens: 400 }) };
  }
}
