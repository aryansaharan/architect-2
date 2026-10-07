import type { Agent, Blueprint } from "@/lib/blueprint/schema";
import type { ChangeOperation } from "@/lib/db/types";
import { presetPermission } from "@/lib/blueprint/describe";
import type { Failure, FixOption, FixPlan, TestRun } from "./report";

/**
 * The fix note for real failures. Each failed test run comes with the judge's suggestion (a rule for the
 * helper, or a tool that should ask first); the recommended fix applies exactly those, and the other
 * hands everything the failing helpers do to a person. Both are free: Prod AI caught it.
 */

const MAX_RULES = 8;

function supervisionOps(ai: number, agent: Agent): ChangeOperation[] {
  return [
    { op: "set", path: `/agents/${ai}/supervision`, value: "approve_all" },
    ...agent.tools.flatMap((t, ti): ChangeOperation[] => {
      const want = presetPermission("approve_all", t.access);
      return t.permission === want ? [] : [{ op: "set", path: `/agents/${ai}/tools/${ti}/permission`, value: want }];
    }),
  ];
}

const names = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function failuresOf(bp: Blueprint, runs: TestRun[]): Failure[] {
  return runs.flatMap((run) => {
    const agent = bp.agents.find((a) => a.id === run.agentId);
    const r = agent?.rehearsals.find((x) => x.id === run.rehearsalId);
    if (!agent || !r || run.outcome !== "fail") return [];
    return [{ agentId: agent.id, agentName: agent.name, rehearsalId: r.id, rehearsalName: r.name, input: r.input, expect: r.expect, reply: run.reply, calls: run.calls, reason: run.reason }];
  });
}

export function buildFixPlan(bp: Blueprint, runs: TestRun[]): FixPlan | null {
  const failed = runs.filter((r) => r.outcome === "fail");
  const failures = failuresOf(bp, failed);
  if (!failures.length) return null;

  // Option a: the judge's own suggestions, per helper.
  const ops: ChangeOperation[] = [];
  const said: string[] = [];
  const short: string[] = [];
  const changelog: string[] = [];
  const agentIds = [...new Set(failed.map((r) => r.agentId))].filter((id) => bp.agents.some((a) => a.id === id));
  for (const id of agentIds) {
    const ai = bp.agents.findIndex((a) => a.id === id);
    const agent = bp.agents[ai];
    const rules = [...agent.rules];
    const gated = new Set<string>();
    for (const run of failed.filter((r) => r.agentId === id && r.fix)) {
      const fix = run.fix!;
      if (fix.kind === "ask_first") {
        const ti = agent.tools.findIndex((t) => t.id === fix.toolId);
        if (ti === -1 || gated.has(fix.toolId) || agent.tools[ti].permission === "ask") continue;
        gated.add(fix.toolId);
        ops.push({ op: "set", path: `/agents/${ai}/tools/${ti}/permission`, value: "ask" });
        said.push(`${agent.name} will ask a person before “${agent.tools[ti].name}”.`);
        short.push(`Ask a person before “${agent.tools[ti].name}”`);
        changelog.push(`${agent.name} asks before ${agent.tools[ti].name.toLowerCase()}.`);
      } else if (!rules.some((x) => x.toLowerCase() === fix.rule.toLowerCase())) {
        if (rules.length >= MAX_RULES) rules.splice(MAX_RULES - 1);
        rules.push(fix.rule);
        said.push(`A new rule for ${agent.name}: “${fix.rule}”`);
        short.push(`Give ${agent.name} a new rule`);
        changelog.push(`${agent.name}: ${fix.rule}`);
      }
    }
    if (rules.length !== agent.rules.length || rules.some((x, i) => x !== agent.rules[i])) ops.push({ op: "set", path: `/agents/${ai}/rules`, value: rules });
  }

  // Option b: a person approves everything the failing helpers do.
  const helpers = agentIds.map((id) => bp.agents.find((a) => a.id === id)!.name);
  const opsB = agentIds.flatMap((id) => {
    const ai = bp.agents.findIndex((a) => a.id === id);
    return supervisionOps(ai, bp.agents[ai]);
  });

  const options: FixOption[] = [];
  if (ops.length)
    options.push({
      id: "a",
      label: short.length === 1 ? short[0] : `Apply the ${short.length} fixes Claude suggests`,
      narration: said.join(" "),
      ops,
      changelog: changelog.join(" "),
      recommended: true,
    });
  if (opsB.length)
    options.push({
      id: "b",
      label: `Have a person approve everything ${names(helpers)} ${helpers.length === 1 ? "does" : "do"}`,
      narration: `${names(helpers)} will ask a person before every tool, so nothing happens without someone's OK.`,
      ops: opsB,
      changelog: `A person approves everything ${names(helpers)} ${helpers.length === 1 ? "does" : "do"}.`,
      recommended: !ops.length,
    });

  const first = failures[0];
  return {
    id: `fix-${failed.map((r) => `${r.agentId}.${r.rehearsalId}`).join("+")}`.slice(0, 200),
    title: failures.length === 1 ? `A test run caught ${first.agentName} getting “${first.rehearsalName}” wrong` : `${failures.length} test runs caught problems`,
    failures,
    objectRef: { type: "agent", id: first.agentId },
    options,
  };
}
