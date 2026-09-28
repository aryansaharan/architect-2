import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { STYLE_RULE, cleanDeep } from "@/lib/text";
import { questionsFromModel, type Question } from "@/lib/blueprint/questions";
import { getFastModel, supportsEffort } from "./provider";
import { costOf, failedSpend } from "./pricing";

/**
 * The three quick questions, written for the brief by one small, fast
 * structured call. Kept free of min/max so it maps onto strict structured
 * outputs; lengths and counts are enforced by questionsFromModel afterwards.
 */
const QuestionsSchema = z.object({
  users: z
    .object({
      label: z.string().describe("Who uses it day to day or approves its work, asked in this brief's words. Under 10 words, ends with '?'"),
      options: z.array(z.string()).describe("3 or 4 real roles in this kind of business, 1 to 4 words each"),
      defaultOption: z.string().describe("The likeliest option, copied exactly"),
    })
    .describe("Question 1: people"),
  systems: z
    .object({
      label: z.string().describe("What it must connect to, under 10 words, ends with '?'"),
      options: z
        .array(z.string())
        .describe("3 to 5 real products. First every product or system the brief names, exactly as named; then the likeliest others for this job. Never 'Nothing yet' (it is added for you)"),
    })
    .describe("Question 2: systems, several can be picked"),
  risk: z
    .object({
      label: z.string().describe("One approval or risk question specific to this domain: the decision where a mistake would hurt most (money, client data, legal, compliance). Under 14 words, ends with '?'"),
      options: z.array(z.string()).describe("3 or 4 concrete policies from most careful to most autonomous, each under 9 words"),
      defaultOption: z.string().describe("The careful option, copied exactly"),
    })
    .describe("Question 3: the domain's riskiest decision"),
});

const INSTRUCTIONS = `You write the three quick questions Prod AI asks before it plans an agentic business app from a short brief.
They must read as written for this exact brief: use its nouns (the people, documents, clients and systems it names). Never ask about anything the brief doesn't imply, and never fall back to generic HR, IT or support options unless the brief is about that.
1. users: who uses the app day to day, or approves what its agents do.
2. systems: what it must connect to. Include every product the brief names, spelled as a person would write it (e.g. "Google Drive", "QuickBooks").
3. risk: the one approval or risk decision that matters most in this domain, with policies from careful to autonomous.
Options are short, concrete and distinct. Products in their usual capitalisation, everything else in sentence case, no trailing punctuation.`;

export type QuestionsUsage = { model: string; inputTokens: number; outputTokens: number; costUsd: number; credits: number };
export type QuestionsResult = { mode: "live"; questions: Question[]; usage: QuestionsUsage; ms: number } | { mode: "offline"; reason: string; usage?: QuestionsUsage };

/**
 * Brief → three tailored questions. Uses the fast model when one is configured
 * (LLM_FAST_MODEL), otherwise the default model at low effort, with a tight
 * timeout: the page already shows the template questions, so a slow answer is
 * simply dropped. Never throws.
 */
export async function questionsWithModel(brief: string, opts: { userId?: string; timeoutMs?: number } = {}): Promise<QuestionsResult> {
  const m = getFastModel();
  if (!m) return { mode: "offline", reason: "no-model" };
  const started = Date.now();
  try {
    const result = await generateText({
      model: m.model,
      instructions: `${INSTRUCTIONS}\n\n${STYLE_RULE}`,
      prompt: `Brief: ${brief}`,
      output: Output.object({ schema: QuestionsSchema, name: "quick_questions" }),
      maxOutputTokens: 1500,
      // Warm calls take 2-3 s on Haiku and about 4-5 s on Opus 5 at low effort. The first call per model and schema each day also compiles the schema, so it may miss this and fall back.
      timeout: opts.timeoutMs ?? (m.fast ? 7_000 : 8_000),
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
    const usage = { model: m.id, inputTokens, outputTokens, ...costOf(m.id, inputTokens, outputTokens) };
    const questions = questionsFromModel(cleanDeep(result.output), brief);
    if (!questions) return { mode: "offline", reason: "unusable", usage };
    return { mode: "live", questions, usage, ms: Date.now() - started };
  } catch (e) {
    const reason = e instanceof Error ? e.message.slice(0, 200) : "unknown";
    console.error("[questions] using the template questions:", reason);
    // A timed-out call is still billed: meter the most its output cap allows.
    return { mode: "offline", reason, usage: await failedSpend(m.id, undefined, { inputTokens: 1500, outputTokens: 1500 }) };
  }
}
