import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

export type ModelHandle = { model: LanguageModel; provider: "anthropic"; id: string };

/**
 * Returns null when no model is configured: every caller then takes its
 * scripted path, so the product never shows an error because of a missing key.
 */
export function getModel(): ModelHandle | null {
  const provider = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();
  if (provider === "none") return null;
  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    const id = process.env.LLM_MODEL || "claude-opus-5";
    return { model: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(id), provider: "anthropic", id };
  }
  return null;
}

export const llmMode = () => (getModel() ? "live" : "offline");

/**
 * The model for small, latency-bound calls (the three quick questions): a
 * cheaper, faster model when one is configured (LLM_FAST_MODEL, e.g.
 * claude-haiku-4-5), otherwise the default model. `fast` tells the caller
 * which one it got, so it can lower effort on the default.
 */
export function getFastModel(): (ModelHandle & { fast: boolean }) | null {
  const base = getModel();
  if (!base) return null;
  const id = process.env.LLM_FAST_MODEL?.trim();
  if (!id || id === base.id) return { ...base, fast: false };
  return { model: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(id), provider: "anthropic", id, fast: true };
}

/** Haiku 4.5 and older models reject the effort setting; Opus 4.5+, Sonnet 4.6+ and the Opus 5 / Fable families take it. */
export function supportsEffort(id: string): boolean {
  return !/haiku|sonnet-4-5|sonnet-4-0|claude-3/i.test(id);
}
