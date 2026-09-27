import type { Agent, Blueprint } from "@/lib/blueprint/schema";
import type { FrameworkModule } from "../types";
import {
  claudeModel,
  escalationNote,
  header,
  lines,
  namesOf,
  oneLine,
  pickNotes,
  planTools,
  pyAuditedCall,
  pyBlocks,
  pyConnectionStub,
  pyDoc,
  pyPromptConst,
  pyStr,
  pyToolReturn,
  sampleInput,
  slug,
  supervisionLine,
  systemPrompt,
  type ToolPlan,
} from "./util";

const LABEL = "Lyzr ADK";

/** Claude models lyzr-adk 0.1.x validates against (ModelResolver). Others raise at create_agent. */
const LYZR_KNOWN_CLAUDE = new Set([
  "claude-3-7-sonnet-latest",
  "claude-3-5-haiku-latest",
  "claude-sonnet-4-0",
  "claude-opus-4-0",
  "claude-opus-4-1",
  "claude-sonnet-4-5",
  "claude-opus-4-5",
]);

function memoryUser(agent: Agent, bp: Blueprint): string | null {
  if (agent.memory.scope === "project") return `project:${slug(bp.meta.name, "project")}`;
  if (agent.memory.scope === "org") return "org:shared";
  return null;
}

function memoryKwarg(agent: Agent): string {
  switch (agent.memory.scope) {
    case "none":
      return `        # Memory "none": no memory feature, so every run starts clean.`;
    case "session":
      return `        memory=30,  # Memory "session": the last 30 messages of each session_id`;
    case "project":
    case "org":
      return `        memory=CognisConfig(cross_session=True),  # Memory "${agent.memory.scope}": recall across MEMORY_USER's sessions`;
  }
}

function toolDef(p: ToolPlan): string[] {
  return [
    `def ${p.name}(query: str) -> str:`,
    `    ${pyDoc(p.tool.description, `Run ${p.tool.id}.`)}`,
    pyToolReturn(p, true),
  ];
}

function render(agent: Agent, bp: Blueprint): string {
  const plans = planTools(agent, "py");
  const gated = plans.some((p) => p.gated);
  const audited = plans.some((p) => p.audited);
  const user = memoryUser(agent, bp);

  const build = [
    `# ${supervisionLine(agent, plans, "approved_call blocks on input()")}`,
    "def build_agent(studio: Studio):",
    '    """Create the agent in Lyzr Studio and register its local tools."""',
    "    agent = studio.create_agent(",
    `        name=${pyStr(agent.name)},`,
    `        provider=${pyStr(`anthropic/${claudeModel(agent)}`)},`,
    `        role=${pyStr(oneLine(agent.role))},`,
    `        goal=${pyStr(oneLine(agent.plain) || oneLine(agent.role))},`,
    "        instructions=INSTRUCTIONS,",
    memoryKwarg(agent),
    "    )",
    ...(plans.length
      ? [
          `    for fn in (${plans.map((p) => p.name).join(", ")}${plans.length === 1 ? "," : ""}):`,
          "        agent.add_tool(fn)",
        ]
      : []),
    "    return agent",
  ];

  const blocks: string[][] = [pyConnectionStub(agent, bp)];
  if (audited) blocks.push(pyAuditedCall());
  if (gated)
    blocks.push([
      "def approved_call(connection_id: str, tool_id: str, query: str) -> str:",
      '    """Lyzr runs local tools in this process, so the approval blocks right here."""',
      '    answer = input(f"Approve {tool_id}({query!r})? [y/N] ")',
      '    if answer.strip().lower() not in {"y", "yes"}:',
      '        return f"A reviewer declined {tool_id}, so it did not run."',
      "    return audited_call(connection_id, tool_id, query)",
    ]);
  blocks.push(...plans.map(toolDef));
  blocks.push(build);
  blocks.push([
    'if __name__ == "__main__":',
    "    logging.basicConfig(level=logging.INFO)",
    "    agent = build_agent(Studio())  # reads LYZR_API_KEY",
    `    response = agent.run(SAMPLE_INPUT, session_id=${pyStr(`${slug(agent.id)}-demo`)}${user ? ", user_id=MEMORY_USER" : ""})`,
    "    print(response.response)",
  ]);

  return lines(
    header(agent, bp, LABEL, "#"),
    "import logging",
    "",
    `from lyzr import ${user ? "CognisConfig, " : ""}Studio`,
    "",
    audited && 'audit = logging.getLogger("prodai.audit")',
    audited && "",
    pyPromptConst("INSTRUCTIONS", systemPrompt(agent)),
    "",
    `SAMPLE_INPUT = ${pyStr(sampleInput(agent))}`,
    user && `MEMORY_USER = ${pyStr(user)}`,
    "",
    "",
    pyBlocks(blocks),
  );
}

function notes(agent: Agent): string[] {
  const plans = planTools(agent, "py");
  const gated = plans.filter((p) => p.gated);
  const logged = plans.filter((p) => p.audited && !p.gated);
  const scope = agent.memory.scope;
  const model = claudeModel(agent);
  return pickNotes(
    [
      escalationNote(plans),
      gated.length > 0 &&
        `Lyzr ADK has no tool-approval primitive, so ${namesOf(gated)} go${gated.length > 1 ? "" : "es"} through a blocking approved_call wrapper. Swap input() for your approval inbox in production.`,
      !LYZR_KNOWN_CLAUDE.has(model) &&
        `lyzr-adk checks provider strings against its built-in model list; if anthropic/${model} isn't listed in your installed version, create_agent raises.`,
      logged.length > 0 &&
        `Lyzr has no audit hook for local tools; ${namesOf(logged)} ${logged.length > 1 ? "log" : "logs"} to prodai.audit around the call.`,
      (scope === "project" || scope === "org") &&
        `Lyzr memory is keyed by user_id, so '${scope}' maps to one shared MEMORY_USER with cross-session recall (CognisConfig).`,
      agent.supervision === "spot_check" &&
        "Lyzr has no spot-check setting; Prod AI samples finished runs for review outside the SDK.",
    ],
    [
      "create_agent registers a new agent in Lyzr Studio on every run; keep the returned agent id and reuse it after the first sync.",
      "No Responsible AI policy is generated; pass rai_policy= to create_agent for PII, toxicity or prompt-injection guardrails.",
    ],
  );
}

export const lyzr: FrameworkModule = {
  id: "lyzr",
  label: LABEL,
  language: "python",
  fileName: () => "agent.lyzr.py",
  install: "pip install lyzr-adk",
  render,
  notes,
};
