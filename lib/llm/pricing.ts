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
