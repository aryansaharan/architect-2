import type { Agent, Blueprint, ObjectRef } from "@/lib/blueprint/schema";
import type { ChangeOperation } from "@/lib/db/types";
import { PERMISSION_LABEL, presetPermission } from "@/lib/blueprint/describe";

export type RepairOption = {
  id: "a" | "b";
  label: string;
  narration: string;
  credits: number;
  /** What the fix touches. Shown in plain words ("Changes 1 screen · 1 agent · 2 files"). */
  blastRadius: { screens: number; agents: number; files: number };
  recommended?: boolean;
  ops: ChangeOperation[];
  changelog: string;
};

export type RepairPlan = {
  id: string;
  title: string;
  tried: string;
  whyFailed: string;
  objectRef: ObjectRef;
  agentName: string;
  options: [RepairOption, RepairOption];
};

/** The history (ledger) title for a repair, shared by real builds and the seeded demo so both read the same. */
export function repairLedgerTitle(plan: Pick<RepairPlan, "title">): string {
  return `Caught: ${plan.title.replace(/^Rehearsal caught /, "")}`;
}

/**
 * Supervision is a preset: switching it also rewrites every tool's permission
 * (lib/blueprint/describe.ts), so a fix that changes supervision says so in its ops.
 */
function supervisionOps(ai: number, agent: Agent, level: Agent["supervision"]): ChangeOperation[] {
  return [
    { op: "set", path: `/agents/${ai}/supervision`, value: level },
    ...agent.tools.flatMap((t, ti): ChangeOperation[] => {
      const want = presetPermission(level, t.access);
      return t.permission === want ? [] : [{ op: "set", path: `/agents/${ai}/tools/${ti}/permission`, value: want }];
    }),
  ];
}

/**
 * The "turn 3" moment. Every first build runs rehearsals; the rehearsal
 * always finds one real weakness in the blueprint and proposes two fixes.
 * For an ungated action that can't be undone, the recommended fix gates that
 * one tool and leaves the rest alone: asking before every look-up as well
 * would teach people to click Allow without reading.
 */
export function planRepair(bp: Blueprint): RepairPlan {
  // Case A: an action that can't be undone is not gated.
  for (let ai = 0; ai < bp.agents.length; ai++) {
    const agent = bp.agents[ai];
    const ti = agent.tools.findIndex((t) => t.access === "irreversible" && t.permission !== "ask");
    if (ti === -1) continue;
    const tool = agent.tools[ti];
    const rehearsal = agent.rehearsals[0]?.name ?? "first run";
    const rules = agent.rules.length < 8 ? agent.rules : agent.rules.slice(0, 7);
    return {
      id: `gate-${agent.id}-${tool.id}`,
      title: `Rehearsal caught ${agent.name} trying to ${tool.name.toLowerCase()} without asking`,
      tried: `In the “${rehearsal}” rehearsal, ${agent.name} called ${tool.name.toLowerCase()} straight away.`,
      whyFailed: `${tool.name} can't be undone, but it was set to “${PERMISSION_LABEL[tool.permission]}”. A mistake here would reach the real world before anyone could stop it.`,
      objectRef: { type: "agent", id: agent.id },
      agentName: agent.name,
      options: [
        {
          id: "a",
          label: `Ask a person before “${tool.name}”`,
          narration: `Added an approval gate to “${tool.name}”: ${agent.name} now pauses and asks a person before it can ${tool.name.toLowerCase()}. Its other tools keep working without asking.`,
          credits: 0,
          blastRadius: { screens: 0, agents: 1, files: 2 },
          recommended: true,
          ops: [{ op: "set", path: `/agents/${ai}/tools/${ti}/permission`, value: "ask" }],
          changelog: `${agent.name} now asks before it can ${tool.name.toLowerCase()}.`,
        },
        {
          id: "b",
          label: `Hand every “${tool.name}” to a person`,
          narration: `${agent.name} now approves everything: every tool asks first, even looking things up, and it prepares “${tool.name}” for a person to carry out. Nothing leaves without a human, but someone has to approve every step.`,
          credits: 0,
          blastRadius: { screens: 1, agents: 1, files: 3 },
          ops: [
            ...supervisionOps(ai, agent, "approve_all"),
            { op: "set", path: `/agents/${ai}/rules`, value: [...rules, `Never ${tool.name.toLowerCase()} yourself. Prepare it for a person to carry out.`] },
          ],
          changelog: `${agent.name} now prepares “${tool.name}” for a person instead of doing it itself.`,
        },
      ],
    };
  }

  // Case B: an agent improvises commitments its rules don't forbid.
  const ai = Math.max(0, bp.agents.findIndex((a) => a.rehearsals.length > 0));
  const agent = bp.agents[ai];
  const rehearsal = agent.rehearsals[agent.rehearsals.length - 1]?.name ?? "edge-case";
  const rules = agent.rules.length < 8 ? agent.rules : agent.rules.slice(0, 7);
  return {
    id: `promise-${agent.id}`,
    title: `Rehearsal caught ${agent.name} promising something it can't guarantee`,
    tried: `In the “${rehearsal}” rehearsal, ${agent.name} told the person their request would definitely be resolved today.`,
    whyFailed: `None of ${agent.name}'s rules stop it from making commitments, so under pressure it improvised one.`,
    objectRef: { type: "agent", id: agent.id },
    agentName: agent.name,
    options: [
      {
        id: "a",
        label: "Add a rule: never promise outcomes",
        narration: `Added a rule to ${agent.name}: never promise an outcome, refund or deadline it can't verify.`,
        credits: 0,
        blastRadius: { screens: 0, agents: 1, files: 2 },
        recommended: true,
        ops: [{ op: "set", path: `/agents/${ai}/rules`, value: [...rules, "Never promise an outcome, refund or deadline you can't verify."] }],
        changelog: `${agent.name} will no longer promise outcomes it can't verify.`,
      },
      {
        id: "b",
        label: "Have a person approve everything it does",
        narration: `${agent.name} now approves everything: every tool asks first, so its replies and actions wait for a person.`,
        credits: 0,
        blastRadius: { screens: 0, agents: 1, files: 2 },
        ops: supervisionOps(ai, agent, "approve_all"),
        changelog: `A person now approves everything ${agent.name} does before it happens.`,
      },
    ],
  };
}
