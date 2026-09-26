import type { Agent, Blueprint } from "@/lib/blueprint/schema";
import type { FrameworkModule } from "../types";
import {
  claudeModel,
  escalationNote,
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

const LABEL = "LangGraph";

function memoryNamespace(agent: Agent, bp: Blueprint): string | null {
  if (agent.memory.scope === "project") return `("project", ${pyStr(slug(bp.meta.name, "project"))})`;
  if (agent.memory.scope === "org") return `("org", "shared")`;
  return null;
}

function toolDef(p: ToolPlan): string[] {
  return [
    "@tool",
    `def ${p.name}(query: str) -> str:`,
    `    ${pyDoc(p.tool.description, `Run ${p.tool.id}.`)}`,
    pyToolReturn(p, true),
  ];
}

function render(agent: Agent, bp: Blueprint): string {
  const plans = planTools(agent, "py");
  const gated = plans.some((p) => p.gated);
  const audited = plans.some((p) => p.audited);
  const hasTools = plans.length > 0;
  const ns = memoryNamespace(agent, bp);
  const scope = agent.memory.scope;

  const memoryComment =
    scope === "none"
      ? `# Memory "none": every run starts on a fresh thread.`
      : ns
        ? `# Memory "${scope}": threads live in the checkpointer; long-term notes in the store under MEMORY_NAMESPACE.`
        : `# Memory "session": the checkpointer keeps one thread per conversation.`;

  const callModel = ns
    ? [
        "def call_model(state: MessagesState, runtime: Runtime) -> dict:",
        '    notes = "\\n".join(str(item.value) for item in runtime.store.search(MEMORY_NAMESPACE, limit=5))',
        '    system = f"{INSTRUCTIONS}\\nWhat you remember:\\n{notes}" if notes else INSTRUCTIONS',
        '    return {"messages": [model.invoke([SystemMessage(content=system), *state["messages"]])]}',
      ]
    : [
        "def call_model(state: MessagesState) -> dict:",
        '    return {"messages": [model.invoke([SystemMessage(content=INSTRUCTIONS), *state["messages"]])]}',
      ];

  const chat = `ChatAnthropic(model=${pyStr(claudeModel(agent))})`;
  const modelBlock = hasTools
    ? [
        `TOOLS = [${plans.map((p) => p.name).join(", ")}]`,
        `model = ${chat}.bind_tools(TOOLS${gated ? ", parallel_tool_calls=False" : ""})`,
      ]
    : [`model = ${chat}`];

  const graphBlock = [
    "builder = StateGraph(MessagesState)",
    'builder.add_node("agent", call_model)',
    hasTools && 'builder.add_node("tools", ToolNode(TOOLS))',
    'builder.add_edge(START, "agent")',
    hasTools ? 'builder.add_conditional_edges("agent", tools_condition)' : 'builder.add_edge("agent", END)',
    hasTools && 'builder.add_edge("tools", "agent")',
    `# ${supervisionLine(agent, plans, "interrupt() in approved_call")}`,
    memoryComment,
    `graph = builder.compile(checkpointer=InMemorySaver()${ns ? ", store=InMemoryStore()" : ""})`,
  ].filter((l): l is string => typeof l === "string");

  const threadId = scope === "none" ? "str(uuid4())" : pyStr(`${slug(agent.id)}-demo`);
  const main = [
    'if __name__ == "__main__":',
    "    logging.basicConfig(level=logging.INFO)",
    `    config = {"configurable": {"thread_id": ${threadId}}}`,
    '    result = graph.invoke({"messages": [{"role": "user", "content": SAMPLE_INPUT}]}, config)',
    ...(gated
      ? [
          '    while result.get("__interrupt__"):',
          "        decisions = {}",
          '        for pending in result["__interrupt__"]:',
          "            answer = input(f\"Approve {pending.value['tool']}({pending.value['input']!r})? [y/N] \")",
          '            decisions[pending.id] = answer.strip().lower() in {"y", "yes"}',
          "        result = graph.invoke(Command(resume=decisions), config)",
        ]
      : []),
    '    print(result["messages"][-1].text)',
  ];

  const blocks: string[][] = [pyConnectionStub(agent, bp)];
  if (audited) blocks.push(pyAuditedCall());
  if (gated)
    blocks.push([
      "def approved_call(connection_id: str, tool_id: str, query: str) -> str:",
      '    """interrupt() pauses the run; resuming replays the tools node, hence parallel_tool_calls=False."""',
      '    if interrupt({"tool": tool_id, "input": query}) is not True:',
      '        return f"A reviewer declined {tool_id}, so it did not run."',
      "    return audited_call(connection_id, tool_id, query)",
    ]);
  blocks.push(...plans.map(toolDef), modelBlock, callModel, graphBlock, main);

  return lines(
    header(agent, bp, LABEL, "#"),
    "import logging",
    scope === "none" && "from uuid import uuid4",
    "",
    "from langchain_anthropic import ChatAnthropic",
    "from langchain_core.messages import SystemMessage",
    hasTools && "from langchain_core.tools import tool",
    "from langgraph.checkpoint.memory import InMemorySaver",
    `from langgraph.graph import ${hasTools ? "START" : "END, START"}, MessagesState, StateGraph`,
    hasTools && "from langgraph.prebuilt import ToolNode, tools_condition",
    ns && "from langgraph.runtime import Runtime",
    ns && "from langgraph.store.memory import InMemoryStore",
    gated && "from langgraph.types import Command, interrupt",
    "",
    audited && 'audit = logging.getLogger("wonderwork.audit")',
    audited && "",
    pyPromptConst("INSTRUCTIONS", systemPrompt(agent)),
    "",
    `SAMPLE_INPUT = ${pyStr(sampleInput(agent))}`,
    ns && `MEMORY_NAMESPACE = ${ns}`,
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
        `${namesOf(gated)} pause${gated.length > 1 ? "" : "s"} with interrupt() inside the tool. Resuming replays the tools node, so parallel tool calls are disabled and the side effect runs only after approval.`,
      logged.length > 0 &&
        `LangGraph has no per-tool 'log' level, so ${namesOf(logged)} ${logged.length > 1 ? "go" : "goes"} through an audited_call wrapper.`,
      (scope === "project" || scope === "org") &&
        `LangGraph has no '${scope}' memory scope; Wonderwork maps it to a store namespace the model reads each turn. Writing memories is left to your nodes.`,
      scope === "none" &&
        "Interrupts need a checkpointer, so memory 'none' still compiles one but starts a fresh thread per run.",
    ],
    [
      "InMemorySaver keeps threads (and paused runs) only for the life of the process; use a persistent checkpointer such as PostgresSaver in production.",
      "create_react_agent is deprecated in LangGraph 1.x, so the graph is built explicitly with StateGraph and ToolNode.",
    ],
  );
}

export const langgraph: FrameworkModule = {
  id: "langgraph",
  label: LABEL,
  language: "python",
  fileName: () => "graph.langgraph.py",
  install: "pip install langgraph langchain-anthropic",
  render,
  notes,
};
