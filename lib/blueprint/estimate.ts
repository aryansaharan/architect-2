import type { Blueprint, Estimate } from "./schema";

/** 1 credit = $0.01. Estimates are always computed, never trusted from a model. */
export const USD_PER_CREDIT = 0.01;

export function creditsToUsd(credits: number): string {
  const usd = credits * USD_PER_CREDIT;
  return usd < 1 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(usd < 10 ? 2 : 0)}`;
}

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
    // A real build in production. Never shown bare: buildTimeLabel pairs it with the simulated playback's length.
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

/**
 * Honest time labels. `minutes` is what a real build or change of this size takes in production. This demo
 * doesn't run one: the build is a simulated playback and a change applies at once. Every place a time shows
 * says both, each for what it is, e.g. "about 27 min for a real build · about 30 s here (simulated)".
 */
export function simulatedDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s < 15 ? s : Math.round(s / 5) * 5} s`;
  const m = Math.floor(s / 60);
  const rest = Math.round((s % 60) / 10) * 10;
  return rest && rest < 60 ? `${m} min ${rest} s` : `${rest === 60 ? m + 1 : m} min`;
}

export type TimeLabel = { real: string; here: string; label: string };

/** A full build: the production estimate plus the length of this demo's simulated playback at normal speed. */
export function buildTimeLabel(minutes: number, simulatedMs: number): TimeLabel {
  const real = `about ${minutes} min for a real build`;
  const here = `about ${simulatedDuration(simulatedMs)} here (simulated)`;
  return { real, here, label: `${real} · ${here}` };
}

/** A change (Work Order): the production estimate; here it applies as soon as it's approved. */
export function changeTimeLabel(minutes: number): TimeLabel {
  const real = `about ${Math.max(1, minutes)} min for a real change`;
  const here = "instant here (simulated)";
  return { real, here, label: `${real} · ${here}` };
}
