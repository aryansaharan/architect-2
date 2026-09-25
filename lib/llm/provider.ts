import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

export type ModelHandle = { model: LanguageModel; provider: "anthropic"; id: string };

/**
 * Returns null when no model is configured — every caller then takes its
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
