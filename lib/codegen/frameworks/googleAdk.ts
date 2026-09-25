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
  pyBlocks,
  pyConnectionStub,
  pyDoc,
  pyIdent,
  pyPromptConst,
  pyStr,
  sampleInput,
  supervisionLine,
  systemPrompt,
  TEMPLATE_VAR,
  type ToolPlan,
} from "./util";

const LABEL = "Google ADK";

/** ADK agent names must be Python identifiers and can't be "user". */
function adkName(agent: Agent): string {
  const n = pyIdent(agent.name, "agent");
  return n === "user" ? "user_agent" : n;
}

function usesPlaceholders(agent: Agent): boolean {
  return [agent.jobDescription, ...agent.rules].some((s) => TEMPLATE_VAR.test(s));
}

function toolDef(p: ToolPlan): string[] {
  return [
    `def ${p.name}(query: str) -> str:`,
    `    ${pyDoc(p.tool.description, `Run ${p.tool.id}.`)}`,
    `    return call_connection(${pyStr(p.tool.connectionId)}, ${pyStr(p.tool.id)}, query)`,
  ];
}

function render(agent: Agent, bp: Blueprint): string {
  const plans = planTools(agent, "py");
  const gated = plans.some((p) => p.gated);
  const audited = plans.filter((p) => p.audited);
  const scope = agent.memory.scope;
  const longTerm = scope === "project" || scope === "org";
  const appName = pyIdent(bp.meta.name, "app");
  const userId = scope === "org" ? "org" : scope === "project" ? "project" : "demo-user";

  const toolEntries = [
    ...plans.map((p) =>
      p.gated
        ? `        FunctionTool(${p.name}, require_confirmation=True),  ${gateComment(p, "#")}`
        : `        ${p.name},`,
    ),
    ...(longTerm ? ["        load_memory,"] : []),
  ];

  const memoryComment = {
    none: `# Memory "none": every run opens a fresh session and nothing is filed to memory.`,
    session: `# Memory "session": the SessionService keeps this conversation; nothing is filed to long-term memory.`,
    project: `# Memory "project": load_memory searches the MemoryService, shared by every session under USER_ID.`,
    org: `# Memory "org": load_memory searches the MemoryService; share one MemoryService across projects for org scope.`,
  }[scope];

  const agentBlock = [
    "root_agent = Agent(",
    `    name=${pyStr(adkName(agent))},`,
    `    model=LiteLlm(model=${pyStr(`anthropic/${claudeModel(agent)}`)}),`,
    `    description=${pyStr(agent.role)},`,
    usesPlaceholders(agent)
      ? "    instruction=lambda _ctx: INSTRUCTIONS,  # a callable skips ADK's {state} templating"
      : "    instruction=INSTRUCTIONS,",
    toolEntries.length ? ["    tools=[", ...toolEntries, "    ],"] : "    tools=[],",
    audited.length > 0 && "    after_tool_callback=audit_tool_call,",
    ")",
    `# ${supervisionLine(agent, plans, "FunctionTool(require_confirmation=True)")}`,
    memoryComment,
  ];

  const main = [
    "async def main(prompt: str = SAMPLE_INPUT) -> None:",
    "    runner = InMemoryRunner(agent=root_agent, app_name=APP_NAME)",
    "    session = await runner.session_service.create_session(app_name=APP_NAME, user_id=USER_ID)",
    '    message = types.Content(role="user", parts=[types.Part(text=prompt)])',
    "    while message:",
    "        replies = []",
    "        async for event in runner.run_async(user_id=USER_ID, session_id=session.id, new_message=message):",
    gated && [
      "            for call in event.get_function_calls():",
      '                if call.name == "adk_request_confirmation":',
      '                    original = call.args["originalFunctionCall"]',
      "                    answer = input(f\"Approve {original['name']}({original['args']})? [y/N] \")",
      '                    confirmed = answer.strip().lower() in {"y", "yes"}',
      '                    response = types.FunctionResponse(id=call.id, name=call.name, response={"confirmed": confirmed})',
      "                    replies.append(types.Part(function_response=response))",
    ],
    "            if event.is_final_response() and event.content and event.content.parts:",
    '                text = "".join(part.text or "" for part in event.content.parts)',
    "                if text:",
    "                    print(text)",
    gated
      ? '        message = types.Content(role="user", parts=replies) if replies else None'
      : "        message = None",
    longTerm && [
      "    finished = await runner.session_service.get_session(app_name=APP_NAME, user_id=USER_ID, session_id=session.id)",
      "    await runner.memory_service.add_session_to_memory(finished)",
    ],
  ];

  const blocks: string[][] = [pyConnectionStub(agent, bp), ...plans.map(toolDef)];
  if (audited.length)
    blocks.push([
      "def audit_tool_call(",
      "    tool: BaseTool, args: dict[str, Any], tool_context: ToolContext, tool_response: Any",
      ") -> Optional[dict]:",
      '    """after_tool_callback: audit trail for \'log\' tools and every confirmation outcome."""',
      "    if tool.name in AUDITED:",
      '        audit.info("%s args=%s -> %s", tool.name, args, tool_response)',
      "    return None",
    ]);
  const flat = (xs: unknown[]): string[] => xs.flat(2).filter((l): l is string => typeof l === "string");
  blocks.push(flat(agentBlock), flat(main), [
    'if __name__ == "__main__":',
    "    logging.basicConfig(level=logging.INFO)",
    "    asyncio.run(main())",
  ]);

  const toolImports = [
    ...(audited.length ? ["BaseTool"] : []),
    ...(gated ? ["FunctionTool"] : []),
    ...(audited.length ? ["ToolContext"] : []),
    ...(longTerm ? ["load_memory"] : []),
  ];

  return lines(
    header(agent, bp, LABEL, "#"),
    "import asyncio",
    "import logging",
    audited.length > 0 && "from typing import Any, Optional",
    "",
    "from google.adk.agents import Agent",
    "from google.adk.models.lite_llm import LiteLlm",
    "from google.adk.runners import InMemoryRunner",
    toolImports.length > 0 && `from google.adk.tools import ${toolImports.join(", ")}`,
    "from google.genai import types",
    "",
    audited.length > 0 && 'audit = logging.getLogger("architect.audit")',
    audited.length > 0 && "",
    pyPromptConst("INSTRUCTIONS", systemPrompt(agent)),
    "",
    `SAMPLE_INPUT = ${pyStr(sampleInput(agent))}`,
    `APP_NAME = ${pyStr(appName)}`,
    `USER_ID = ${pyStr(userId)}`,
    audited.length > 0 && `AUDITED = {${audited.map((p) => pyStr(p.name)).join(", ")}}`,
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
        `${namesOf(gated)} use${gated.length > 1 ? "" : "s"} ADK tool confirmation, which is experimental and not supported with DatabaseSessionService or VertexAiSessionService.`,
      logged.length > 0 &&
        `ADK has no per-tool 'log' level; after_tool_callback audits ${namesOf(logged)}${gated.length ? " plus every confirmation outcome" : ""}.`,
      scope === "org" &&
        "Google ADK has no org-wide memory scope. Architect maps 'org' to a MemoryService keyed by one shared user id; share that service across projects' runners.",
      scope === "project" &&
        "ADK memory is keyed by app and user, so 'project' uses one shared USER_ID; every session in the project can load_memory the others.",
      usesPlaceholders(agent) &&
        "ADK would treat {name} in the instruction as session state, so the instruction is passed as a callable to keep the text verbatim.",
    ],
    [
      "Claude runs through LiteLlm with ANTHROPIC_API_KEY; ADK's built-in Claude class targets Vertex AI.",
      "root_agent lives in a single file here; move it to <package>/agent.py to use adk web or adk run.",
    ],
  );
}

export const googleAdk: FrameworkModule = {
  id: "google_adk",
  label: LABEL,
  language: "python",
  fileName: () => "agent.adk.py",
  install: "pip install google-adk litellm",
  render,
  notes,
};
