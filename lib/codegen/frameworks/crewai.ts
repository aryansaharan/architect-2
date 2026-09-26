import type { Agent, Blueprint } from "@/lib/blueprint/schema";
import type { FrameworkModule } from "../types";
import {
  claudeModel,
  commentText,
  escalationNote,
  header,
  lines,
  namesOf,
  pickNotes,
  planTools,
  pyBlocks,
  pyConnectionStub,
  pyDoc,
  pyPromptConst,
  pyStr,
  sampleInput,
  slug,
  supervisionLine,
  systemPrompt,
  TEMPLATE_VAR,
  type ToolPlan,
} from "./util";

const LABEL = "CrewAI";

/** CrewAI interpolates `{name}` in role/goal/backstory/task text; neutralise user-authored placeholders. */
const PLACEHOLDER = new RegExp(TEMPLATE_VAR.source, "g");
function crewSafe(s: string): string {
  return s.replace(PLACEHOLDER, (m) => `⟨${m.slice(1, -1)}⟩`);
}
function hasPlaceholders(agent: Agent): boolean {
  return [agent.name, agent.role, agent.jobDescription, ...agent.rules].some((s) => TEMPLATE_VAR.test(s));
}

function memoryScope(agent: Agent, bp: Blueprint): string | null {
  if (agent.memory.scope === "project") return `/project/${slug(bp.meta.name, "project")}`;
  if (agent.memory.scope === "org") return "/org";
  return null;
}

function toolDef(p: ToolPlan): string[] {
  return [
    `@tool(${pyStr(p.name)})`,
    `def ${p.name}(query: str) -> str:`,
    `    ${pyDoc(p.tool.description, `Run ${p.tool.id}.`)}`,
    `    return call_connection(${pyStr(p.tool.connectionId)}, ${pyStr(p.tool.id)}, query)`,
  ];
}

const pyList = (plans: ToolPlan[]) => `[${plans.map((p) => pyStr(p.name)).join(", ")}]`;

function render(agent: Agent, bp: Blueprint): string {
  const plans = planTools(agent, "py");
  const gated = plans.filter((p) => p.gated);
  const audited = plans.filter((p) => p.audited);
  const scope = memoryScope(agent, bp);

  const memoryComment =
    agent.memory.scope === "none"
      ? `# Memory "none": crew memory stays off.`
      : agent.memory.scope === "session"
        ? `# Memory "session": context lives for one kickoff(); nothing persists between runs.`
        : `# Memory "${agent.memory.scope}": the agent reads and writes the ${commentText(scope ?? "")} scope of the crew's Memory.`;

  const hooks: string[][] = [];
  if (gated.length)
    hooks.push([
      `# Needs approval: ${gated.map((p) => `${commentText(p.name)} (${commentText(p.why)})`).join(", ")}`,
      `@before_tool_call(tools=${pyList(gated)})`,
      "def require_approval(ctx: ToolCallHookContext) -> bool | None:",
      "    answer = ctx.request_human_input(",
      '        prompt=f"{ctx.tool_name} wants to run with {ctx.tool_input}",',
      "        default_message=\"Type 'yes' to approve:\",",
      "    )",
      '    if answer.strip().lower() in {"y", "yes"}:',
      "        return None",
      '    audit.warning("%s declined by reviewer", ctx.tool_name)',
      "    return False",
    ]);
  if (audited.length)
    hooks.push([
      `@after_tool_call(tools=${pyList(audited)})`,
      "def audit_trail(ctx: ToolCallHookContext) -> None:",
      '    audit.info("%s input=%s result=%s", ctx.tool_name, ctx.tool_input, ctx.tool_result)',
    ]);

  const agentBlock = [
    ...(scope ? ["memory = Memory()"] : []),
    `llm = LLM(model=${pyStr(`anthropic/${claudeModel(agent)}`)}, max_tokens=4096)`,
    "",
    "agent = Agent(",
    `    role=${pyStr(crewSafe(agent.name))},`,
    `    goal=${pyStr(crewSafe(agent.role))},`,
    "    backstory=BACKSTORY,",
    "    llm=llm,",
    `    tools=[${plans.map((p) => p.name).join(", ")}],`,
    ...(scope ? [`    memory=memory.scope(${pyStr(scope)}),`] : []),
    ")",
    "task = Task(",
    '    description="Handle this request: {request}",',
    '    expected_output="What you did, what is waiting for a person, and why.",',
    "    agent=agent,",
    ")",
    `# ${supervisionLine(agent, plans, "the before_tool_call hook above")}`,
    memoryComment,
    `crew = Crew(agents=[agent], tasks=[task], process=Process.sequential${scope ? ", memory=memory" : ""})`,
  ];

  const crewImports = ["LLM", "Agent", "Crew", ...(scope ? ["Memory"] : []), "Process", "Task"];
  const hookImports = [
    "ToolCallHookContext",
    ...(audited.length ? ["after_tool_call"] : []),
    ...(gated.length ? ["before_tool_call"] : []),
  ];

  return lines(
    header(agent, bp, LABEL, "#"),
    "import logging",
    "",
    `from crewai import ${crewImports.join(", ")}`,
    hookImports.length > 1 && `from crewai.hooks import ${hookImports.join(", ")}`,
    plans.length > 0 && "from crewai.tools import tool",
    "",
    audited.length > 0 && 'audit = logging.getLogger("wonderwork.audit")',
    audited.length > 0 && "",
    pyPromptConst("BACKSTORY", crewSafe(systemPrompt(agent))),
    "",
    `SAMPLE_INPUT = ${pyStr(sampleInput(agent))}`,
    "",
    "",
    pyBlocks([
      pyConnectionStub(agent, bp),
      ...plans.map(toolDef),
      ...hooks,
      agentBlock,
      [
        'if __name__ == "__main__":',
        "    logging.basicConfig(level=logging.INFO)",
        '    result = crew.kickoff(inputs={"request": SAMPLE_INPUT})',
        "    print(result.raw)",
      ],
    ]),
  );
}

function notes(agent: Agent): string[] {
  const plans = planTools(agent, "py");
  const gated = plans.filter((p) => p.gated);
  const logged = plans.filter((p) => p.audited && !p.gated);
  const scope = agent.memory.scope;
  return pickNotes(
    [
      escalationNote(plans),
      gated.length > 0 &&
        `CrewAI has no per-tool approval setting, so ${namesOf(gated)} ${gated.length > 1 ? "are" : "is"} gated by a before_tool_call hook (process-wide, hence the tools= filter). request_human_input reads stdin, so wire it to your approval inbox for unattended runs.`,
      logged.length > 0 && `'log' tools (${namesOf(logged)}) are audited in an after_tool_call hook.`,
      hasPlaceholders(agent) &&
        "CrewAI treats {name} in prompts as template variables, so braces in this agent's text were rewritten as ⟨name⟩.",
      (scope === "project" || scope === "org") &&
        `'${scope}' memory maps to a scoped view of CrewAI Memory, which embeds with OpenAI by default. Pass embedder= to Memory() if you only have an Anthropic key.`,
      scope === "session" &&
        "CrewAI has no conversation-scoped memory; context lasts for one kickoff() and nothing persists.",
    ],
    [
      "Each request is a single-Task crew; Wonderwork's chat turns map to separate kickoff() calls.",
      "CrewAI requires max_tokens for Anthropic models, so the LLM sets 4096; raise it for long outputs.",
    ],
  );
}

export const crewai: FrameworkModule = {
  id: "crewai",
  label: LABEL,
  language: "python",
  fileName: () => "crew.crewai.py",
  install: 'pip install "crewai[anthropic]"',
  render,
  notes,
};
