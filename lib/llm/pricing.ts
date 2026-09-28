import { USD_PER_CREDIT } from "@/lib/blueprint/estimate";

/** USD per 1M tokens (input, output): Anthropic first-party list prices. */
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-fable-5-1": { in: 10, out: 50 },
};

export function priceFor(model: string) {
  return PRICES[model] ?? { in: 5, out: 25 };
}

export function costOf(model: string, inputTokens: number, outputTokens: number) {
  const p = priceFor(model);
  const costUsd = (inputTokens / 1e6) * p.in + (outputTokens / 1e6) * p.out;
  const credits = Math.max(0.01, Math.round((costUsd / USD_PER_CREDIT) * 100) / 100);
  return { costUsd, credits };
}

export type ModelSpend = { model: string; inputTokens: number; outputTokens: number; costUsd: number; credits: number; failed?: boolean; estimated?: boolean };

/**
 * What a failed model call cost. The provider still bills the tokens it used, so a failure is metered
 * too: its reported usage if that arrives within a moment, otherwise the most its output cap allows.
 */
export async function failedSpend(model: string, usage: PromiseLike<{ inputTokens?: number; outputTokens?: number }> | undefined, worst: { inputTokens: number; outputTokens: number }): Promise<ModelSpend> {
  const reported = usage
    ? await Promise.race([Promise.resolve(usage).then((u) => u, () => null), new Promise<null>((r) => setTimeout(() => r(null), 2000))])
    : null;
  const inputTokens = reported?.inputTokens ?? worst.inputTokens;
  const outputTokens = reported?.outputTokens ?? worst.outputTokens;
  return { model, inputTokens, outputTokens, ...costOf(model, inputTokens, outputTokens), failed: true, estimated: !reported };
}
