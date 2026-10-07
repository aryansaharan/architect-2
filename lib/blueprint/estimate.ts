import type { Blueprint, Estimate } from "./schema";

/** 1 credit = $0.01. Estimates are always computed, never trusted from a model. */
export const USD_PER_CREDIT = 0.01;

export function estimate(bp: Blueprint, fileCount?: number): Estimate {
  const askTools = bp.agents.flatMap((a) => a.tools).filter((t) => t.permission === "ask" || t.access === "irreversible").length;
  const breakdown = [
    { label: `${bp.screens.length} screens`, credits: 6 * bp.screens.length },
    { label: `${bp.agents.length} agents`, credits: 12 * bp.agents.length },
    { label: `${bp.entities.length} data types`, credits: 3 * bp.entities.length },
    { label: `${bp.connections.length} connections`, credits: 2 * bp.connections.length },
    { label: `${askTools} approval gates`, credits: 4 * askTools },
  ].filter((b) => b.credits > 0);
  const credits = breakdown.reduce((s, b) => s + b.credits, 0);
  const files =
    fileCount ??
    // mirrors codegen/files.ts: 9 base files + 1 per screen + 5 per agent + 1 per entity
    9 + bp.screens.length + 5 * bp.agents.length + bp.entities.length;
  const complexity = bp.screens.length + bp.agents.length * 2 + bp.connections.length;
  return {
    // A rough size, in minutes of work. How long making it real takes is buildTimeLabel (seconds plus its test runs).
    minutes: Math.max(2, Math.ceil(credits / 4)),
    credits,
    files,
    agentsTouched: bp.agents.length,
    confidence: complexity <= 14 ? "high" : complexity <= 20 ? "medium" : "low",
    breakdown,
  };
}

/** Estimate for a scoped change (Work Order) given its blast radius. `minutes` is for a real change; show it with changeTimeLabel. */
export function estimateChange(r: { screens: number; agents: number; files: number }): { credits: number; minutes: number } {
  const credits = Math.max(1, 3 * r.screens + 5 * r.agents + Math.ceil(r.files / 2));
  return { credits, minutes: Math.max(1, Math.ceil(credits / 5)) };
}

/** A duration in words: "8 s", "45 s", "1 min 20 s". */
export function durationWords(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s < 15 ? s : Math.round(s / 5) * 5} s`;
  const m = Math.floor(s / 60);
  const rest = Math.round((s % 60) / 10) * 10;
  return rest && rest < 60 ? `${m} min ${rest} s` : `${rest === 60 ? m + 1 : m} min`;
}

export type TimeLabel = { real: string; here: string; label: string };

/**
 * How long making it real takes, honestly: a few seconds to check the plan and compile the code, plus the
 * test runs Claude plays (three at a time, about 20 s a round). `runs` is 0 when they're skipped.
 */
export function buildTimeLabel(runs: number): TimeLabel {
  const ms = 5000 + Math.ceil(runs / 3) * 20_000;
  const real = runs ? `about ${durationWords(ms)}` : "a few seconds";
  const here = runs ? `${runs} test run${runs === 1 ? "" : "s"} played by Claude` : "no test runs";
  return { real, here, label: `${real} · ${here}` };
}

/** A change (Work Order): the production estimate; here it applies as soon as it's approved. */
export function changeTimeLabel(minutes: number): TimeLabel {
  const real = `about ${Math.max(1, minutes)} min for a real change`;
  const here = "instant here (simulated)";
  return { real, here, label: `${real} · ${here}` };
}
