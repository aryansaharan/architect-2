import "server-only";
import { generateText, Output } from "ai";
import type { Blueprint } from "@/lib/blueprint/schema";
import { getModel } from "./provider";
import { costOf } from "./pricing";
import { DraftSchema, PLANNER_INSTRUCTIONS } from "./draft";
import { expandDraft } from "./expand";

export type PlanResult =
  | { mode: "live"; blueprint: Blueprint; usage: { model: string; inputTokens: number; outputTokens: number; costUsd: number; credits: number }; ms: number }
  | { mode: "offline"; reason: string };

/** Brief → Blueprint with a model. Never throws: callers fall back to a starter blueprint. */
export async function planWithModel(prompt: string, opts: { timeoutMs?: number; userId?: string } = {}): Promise<PlanResult> {
  const m = getModel();
  if (!m) return { mode: "offline", reason: "no-model" };
  const started = Date.now();
  try {
    const result = await generateText({
      model: m.model,
      instructions: PLANNER_INSTRUCTIONS,
      prompt,
      output: Output.object({ schema: DraftSchema, name: "blueprint_draft" }),
      maxOutputTokens: 12000,
      timeout: opts.timeoutMs ?? 75_000,
      maxRetries: 1,
      providerOptions: { anthropic: { effort: "low", structuredOutputMode: "outputFormat", ...(opts.userId ? { metadata: { userId: opts.userId } } : {}) } },
    });
    const blueprint = expandDraft(result.output, { modelId: m.id });
    const inputTokens = result.usage.inputTokens ?? 0;
    const outputTokens = result.usage.outputTokens ?? 0;
    const { costUsd, credits } = costOf(m.id, inputTokens, outputTokens);
    return { mode: "live", blueprint, usage: { model: m.id, inputTokens, outputTokens, costUsd, credits }, ms: Date.now() - started };
  } catch (e) {
    const reason = e instanceof Error ? e.message.slice(0, 200) : "unknown";
    console.error("[planner] falling back:", reason);
    return { mode: "offline", reason };
  }
}
