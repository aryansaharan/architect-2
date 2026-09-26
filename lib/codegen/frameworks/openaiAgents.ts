import type { Agent, Blueprint } from "@/lib/blueprint/schema";
import type { FrameworkModule } from "../types";
import {
  claudeModel,
  escalationNote,
  gateComment,
  header,
  lines,
  namesOf,
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

const LABEL = "OpenAI Agents SDK";

/** Maps memory.scope onto an Agents SDK session (conversation history). */
function sessionExpr(agent: Agent, bp: Blueprint): { expr: string | null; comment: string } {
  switch (agent.memory.scope) {
    case "none":
      return { expr: null, comment: `# Memory "none": no session, so every run starts clean.` };
    case "session":
      return {
        expr: `SQLiteSession(${pyStr(`${slug(agent.id)}-demo`)})`,
        comment: `# Memory "session": an in-memory SQLiteSession holds this conversation's history.`,
      };
    case "project":
      return {
        expr: `SQLiteSession(${pyStr(`project:${slug(bp.meta.name, "project")}`)}, "wonderwork_memory.db")`,
        comment: `# Memory "project": one persistent SQLiteSession shared by every run in the project.`,
      };
    case "org":
      return {
        expr: `SQLiteSession("org:shared", "wonderwork_memory.db")`,
        comment: `# Memory "org": one persistent SQLiteSession shared across the organisation.`,
      };
  }
}

function toolDef(p: ToolPlan): string[] {
  return [
    p.gated ? `@function_tool(needs_approval=True)  ${gateComment(p, "#")}` : "@function_tool",
    `def ${p.name}(query: str) -> str:`,
    `    ${pyDoc(p.tool.description, `Run ${p.tool.id}.`)}`,
    pyToolReturn(p, false),
  ];
}

function render(agent: Agent, bp: Blueprint): string {
  const plans = planTools(agent, "py");
  const gated = plans.some((p) => p.gated);
  const audited = plans.some((p) => p.audited);
  const session = sessionExpr(agent, bp);
  const withSession = session.expr ? ", session=session" : "";

  const agentBlock = [
    "agent = Agent(",
    `    name=${pyStr(agent.name)},`,
    "    instructions=INSTRUCTIONS,",
    `    model=LitellmModel(model=${pyStr(`anthropic/${claudeModel(agent)}`)}),`,
    `    tools=[${plans.map((p) => p.name).join(", ")}],`,
    ")",
    `# ${supervisionLine(agent, plans, "needs_approval=True pauses the run")}`,
    session.comment,
  ];

  const main = [
    "async def main(prompt: str = SAMPLE_INPUT) -> None:",
    session.expr && `    session = ${session.expr}`,
    `    result = await Runner.run(agent, prompt${withSession})`,
    ...(gated
      ? [
          "    while result.interruptions:",
          "        state = result.to_state()",
          "        for item in result.interruptions:",
          '            answer = input(f"Approve {item.tool_name}({item.arguments})? [y/N] ")',
          '            if answer.strip().lower() in {"y", "yes"}:',
          "                state.approve(item)",
          "            else:",
          "                state.reject(item)",
          `        result = await Runner.run(agent, state${withSession})`,
        ]
      : []),
    "    print(result.final_output)",
  ].filter((l): l is string => typeof l === "string");

  const blocks: string[][] = [pyConnectionStub(agent, bp)];
  if (audited) blocks.push(pyAuditedCall());
  for (const p of plans) blocks.push(toolDef(p));
  blocks.push(agentBlock, main, [
    'if __name__ == "__main__":',
    "    logging.basicConfig(level=logging.INFO)",
    "    asyncio.run(main())",
  ]);

  const agentImports = [
    "Agent",
    "Runner",
    ...(session.expr ? ["SQLiteSession"] : []),
    "function_tool",
    "set_tracing_disabled",
  ];
  if (!plans.length) agentImports.splice(agentImports.indexOf("function_tool"), 1);

  return lines(
    header(agent, bp, LABEL, "#"),
    "import asyncio",
    "import logging",
    "import os",
    "",
    `from agents import ${agentImports.join(", ")}`,
    "from agents.extensions.models.litellm_model import LitellmModel",
    "",
    audited && 'audit = logging.getLogger("wonderwork.audit")',
    "# This agent runs on Claude; traces are exported to OpenAI only if OPENAI_API_KEY is set.",
    'set_tracing_disabled(not os.environ.get("OPENAI_API_KEY"))',
    "",
    pyPromptConst("INSTRUCTIONS", systemPrompt(agent)),
    "",
    `SAMPLE_INPUT = ${pyStr(sampleInput(agent))}`,
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
  return pickNotes(
    [
      escalationNote(plans),
      gated.length > 0 &&
        `${namesOf(gated)} use${gated.length > 1 ? "" : "s"} needs_approval=True: the run stops with result.interruptions and resumes from RunState. Persist state.to_json() if the approval comes later.`,
      logged.length > 0 &&
        `The SDK has no per-tool 'log' level, so ${namesOf(logged)} ${logged.length > 1 ? "go" : "goes"} through an audited_call wrapper.`,
      (scope === "project" || scope === "org") &&
        `Agents SDK sessions store conversation history, not long-term memory. Wonderwork maps '${scope}' to one shared persistent SQLiteSession.`,
    ],
    [
      "Claude runs through LitellmModel, which the SDK supports on a best-effort (beta) basis; usage metrics may need ModelSettings(include_usage=True).",
      "Tracing is disabled unless OPENAI_API_KEY is set, because the SDK exports traces to OpenAI by default.",
    ],
  );
}

export const openaiAgents: FrameworkModule = {
  id: "openai_agents",
  label: LABEL,
  language: "python",
  fileName: () => "agent.openai.py",
  install: 'pip install "openai-agents[litellm]"',
  render,
  notes,
};
