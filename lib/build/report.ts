import type { ObjectRef } from "@/lib/blueprint/schema";
import type { ChangeOperation } from "@/lib/db/types";

/**
 * What making a business app real records, safe to use in the browser. Every step is real work done on
 * the server (lib/build): the plan is checked, its code generated and compiled, each AI helper's test
 * runs played by Claude and judged. The report is saved on the project (projects.build_report), so a
 * reload picks the build up where it is and a replay shows exactly what happened.
 */

export type StepState = "running" | "done" | "warn" | "failed" | "skipped";

export type BuildStep = {
  id: string;
  label: string;
  state: StepState;
  detail?: string;
  objectRef?: ObjectRef;
  /** How long the real work took. */
  ms?: number;
};

/** A tool call the helper made in a test run. Gated tools aren't run: the helper stops and asks a person. */
export type ToolCallSeen = { toolId: string; name: string; access: "read" | "write" | "irreversible"; asked: boolean; input: string };

/** What the judge suggests when a test run fails: a rule for the helper, or a tool that should ask first. */
export type SuggestedFix = { kind: "rule"; rule: string } | { kind: "ask_first"; toolId: string };

export type TestRun = {
  agentId: string;
  rehearsalId: string;
  name: string;
  /** "pass" and "fail" are Claude's verdicts; "error" means the run couldn't be played (never charged). */
  outcome: "pass" | "fail" | "error";
  /** The judge's reason, one plain sentence. */
  reason: string;
  /** What the helper said (trimmed). */
  reply: string;
  calls: ToolCallSeen[];
  fix: SuggestedFix | null;
  credits: number;
  at: string;
  /** Played again after a fix. */
  again?: boolean;
  /** Set when it wasn't played because the daily AI budget or the rate limit said no (so a caller can wait and retry). */
  held?: "rate" | "budget";
};

export type FixOption = {
  id: "a" | "b";
  label: string;
  narration: string;
  ops: ChangeOperation[];
  changelog: string;
  recommended?: boolean;
};

/** A failed test run, as the fix note tells it. */
export type Failure = { agentId: string; agentName: string; rehearsalId: string; rehearsalName: string; input: string; expect: string; reply: string; calls: ToolCallSeen[]; reason: string };

export type FixPlan = {
  id: string;
  title: string;
  failures: Failure[];
  objectRef: ObjectRef;
  options: FixOption[];
  /** The person's choice once made: a fix, or finishing without one. */
  chosen?: "a" | "b" | "none";
};

/** Why the test runs did or didn't use Claude in this build. */
export type TestsMode = "claude" | "guest" | "credits" | "cap" | "skipped" | "none" | "offline";

export type BuildReport = {
  /** The plan the build started from. */
  hash: string;
  startedAt: string;
  finishedAt?: string;
  phase: "running" | "fix" | "done" | "stopped";
  tests: TestsMode;
  steps: BuildStep[];
  runs: TestRun[];
  fix?: FixPlan;
  /** Credits this build has taken for test runs. */
  credits: number;
  /** Which server request is doing the work, until when (server-only; stripped before it reaches a browser). */
  lease?: { token: string; until: string };
};

/** One line of the build's stream (NDJSON). */
export type BuildEvent =
  | { t: "report"; report: BuildReport }
  | { t: "step"; step: BuildStep }
  | { t: "run"; run: TestRun }
  | { t: "fix"; fix: FixPlan }
  | { t: "done"; summary: string }
  | { t: "error"; message: string };

/** Test runs one build plays at most: the cost stays predictable (each costs PRICE.testRun). */
export const MAX_TEST_RUNS = 12;

/** The test runs a build will play, in order: each helper's first, then their second, and so on, up to the cap. */
export function plannedRuns<A extends { id: string; rehearsals: { id: string }[] }>(agents: A[]): { agentId: string; rehearsalId: string }[] {
  const out: { agentId: string; rehearsalId: string }[] = [];
  const most = Math.max(0, ...agents.map((a) => a.rehearsals.length));
  for (let i = 0; i < most && out.length < MAX_TEST_RUNS; i++)
    for (const a of agents) {
      if (out.length >= MAX_TEST_RUNS) break;
      const r = a.rehearsals[i];
      if (r) out.push({ agentId: a.id, rehearsalId: r.id });
    }
  return out;
}

export const runKey = (r: { agentId: string; rehearsalId: string }) => `${r.agentId}/${r.rehearsalId}`;

/** What a browser may see of the report: everything but the lease. */
export function publicReport(r: BuildReport): BuildReport {
  const rest = { ...r };
  delete rest.lease;
  return rest;
}

/** The steps a build will take, in order, before it starts (a fix adds two more): for progress and the pencil cards. */
export function plannedSteps(bp: { entities: { id: string }[]; screens: { id: string }[]; agents: { id: string }[]; connections: { id: string }[] }): { id: string; objectRef?: ObjectRef }[] {
  return [
    { id: "read" },
    ...bp.entities.map((e) => ({ id: `data-${e.id}`, objectRef: { type: "entity" as const, id: e.id } })),
    { id: "code" },
    ...bp.screens.map((s) => ({ id: `screen-${s.id}`, objectRef: { type: "screen" as const, id: s.id } })),
    ...bp.agents.map((a) => ({ id: `agent-${a.id}`, objectRef: { type: "agent" as const, id: a.id } })),
    ...bp.connections.map((c) => ({ id: `conn-${c.id}`, objectRef: { type: "connection" as const, id: c.id } })),
    { id: "tests" },
    { id: "checks" },
  ];
}
