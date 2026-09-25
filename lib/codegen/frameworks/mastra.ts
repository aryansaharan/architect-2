import type { Agent, Blueprint } from "@/lib/blueprint/schema";
import type { FrameworkModule } from "../types";
import {
  camel,
  claudeModel,
  connectionsComment,
  escalationNote,
  gateComment,
  header,
  lines,
  namesOf,
  pickNotes,
  planTools,
  sampleInput,
  slug,
  supervisionLine,
  systemPrompt,
  tsStr,
  tsTemplateBody,
  type ToolPlan,
} from "./util";

const LABEL = "Mastra";

function memoryConfig(agent: Agent, bp: Blueprint): { memory: string[]; resource: string } | null {
  const scope = agent.memory.scope;
  if (scope === "none") return null;
  if (scope === "session")
    return {
      memory: [
        `  // Memory "session": thread-scoped history, one thread per conversation.`,
        "  memory: new Memory({ options: { lastMessages: 20 } }),",
      ],
      resource: "demo-user",
    };
  return {
    memory: [
      `  // Memory "${scope}": working memory is resource-scoped, and every run shares one resource id.`,
      '  memory: new Memory({ options: { lastMessages: 20, workingMemory: { enabled: true, scope: "resource" } } }),',
    ],
    resource: scope === "org" ? "org:shared" : `project:${slug(bp.meta.name, "project")}`,
  };
}

function toolDef(p: ToolPlan): string[] {
  const args = `${tsStr(p.tool.connectionId)}, ${tsStr(p.tool.id)}, query`;
  return [
    `const ${p.name} = createTool({`,
    `  id: ${tsStr(p.tool.id)},`,
    `  description: ${tsStr(p.tool.description.trim() || `Run ${p.tool.id}.`)},`,
    "  inputSchema: queryInput,",
    p.gated && `  requireApproval: true, ${gateComment(p, "//")}`,
    `  execute: async ({ query }) => ${p.audited ? "auditedCall" : "callConnection"}(${args}),`,
    "});",
  ].filter((l): l is string => typeof l === "string");
}

function render(agent: Agent, bp: Blueprint): string {
  const agentConst = `${camel(agent.id, "agent")}Agent`;
  const plans = planTools(agent, "ts").map((p) => (p.name === agentConst ? { ...p, name: `${p.name}Tool` } : p));
  const gated = plans.some((p) => p.gated);
  const audited = plans.some((p) => p.audited);
  const mem = memoryConfig(agent, bp);
  const bound = connectionsComment(agent, bp);

  const helpers =
    plans.length === 0
      ? []
      : [
          "",
          bound
            ? `// Stub for Architect's connection runtime; bound on deploy to ${bound}.`
            : "// Stub for Architect's connection runtime.",
          "async function callConnection(connectionId: string, toolId: string, query: string): Promise<string> {",
          "  return `[stub] ${toolId} via ${connectionId}: ${query}`;",
          "}",
          audited && [
            "",
            `/** Audit trail for permission "log" and every approved call. */`,
            "async function auditedCall(connectionId: string, toolId: string, query: string): Promise<string> {",
            "  console.info(`[audit] ${toolId} start`, { query });",
            "  const result = await callConnection(connectionId, toolId, query);",
            "  console.info(`[audit] ${toolId} ok`);",
            "  return result;",
            "}",
          ],
        ];

  const agentBlock = [
    "",
    `export const ${agentConst} = new Agent({`,
    `  id: ${tsStr(slug(agent.id))},`,
    `  name: ${tsStr(agent.name)},`,
    "  instructions,",
    `  model: anthropic(${tsStr(claudeModel(agent))}),`,
    `  // ${supervisionLine(agent, plans, "requireApproval pauses the stream")}`,
    plans.length ? `  tools: { ${plans.map((p) => p.name).join(", ")} },` : "  tools: {},",
    mem ? mem.memory : `  // Memory "none": no Memory attached, so every call starts clean.`,
    "});",
    "",
    "export const mastra = new Mastra({",
    `  agents: { ${agentConst} },`,
    "  // Storage holds memory and the snapshots that paused approvals resume from.",
    '  storage: new LibSQLStore({ id: "architect-storage", url: "file:./mastra.db" }),',
    "});",
  ];

  const streamOpts = mem ? ", { memory: MEMORY }" : "";
  const main = [
    "",
    "export async function main(prompt = SAMPLE_INPUT): Promise<void> {",
    `  const agent = mastra.getAgentById(${tsStr(slug(agent.id))});`,
    ...(gated
      ? [
          "  const rl = createInterface({ input: process.stdin, output: process.stdout });",
          `  let stream = await agent.stream(prompt${streamOpts});`,
          "  for (;;) {",
          "    let pending: { toolCallId: string; toolName: string; args: unknown } | undefined;",
          "    for await (const chunk of stream.fullStream) {",
          '      if (chunk.type === "text-delta") process.stdout.write(chunk.payload.text);',
          '      if (chunk.type === "tool-call-approval") pending = chunk.payload;',
          "    }",
          "    if (!pending) break;",
          "    const answer = await rl.question(`\\nApprove ${pending.toolName}(${JSON.stringify(pending.args)})? [y/N] `);",
          "    const call = { runId: stream.runId, toolCallId: pending.toolCallId };",
          "    stream = /^y(es)?$/i.test(answer.trim())",
          "      ? await agent.approveToolCall(call)",
          '      : await agent.declineToolCall({ ...call, reason: "Declined by a reviewer." });',
          "  }",
          "  rl.close();",
        ]
      : [
          `  const stream = await agent.stream(prompt${streamOpts});`,
          "  for await (const text of stream.textStream) process.stdout.write(text);",
        ]),
    "}",
    "",
    'if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void main();',
  ];

  return lines(
    header(agent, bp, LABEL, "//"),
    'import { anthropic } from "@ai-sdk/anthropic";',
    'import { Mastra } from "@mastra/core";',
    'import { Agent } from "@mastra/core/agent";',
    plans.length > 0 && 'import { createTool } from "@mastra/core/tools";',
    'import { LibSQLStore } from "@mastra/libsql";',
    mem && 'import { Memory } from "@mastra/memory";',
    gated && 'import { createInterface } from "node:readline/promises";',
    'import { pathToFileURL } from "node:url";',
    plans.length > 0 && 'import { z } from "zod";',
    "",
    `const instructions = \`${tsTemplateBody(systemPrompt(agent))}\`;`,
    "",
    `const SAMPLE_INPUT = ${tsStr(sampleInput(agent))};`,
    mem && `const MEMORY = { resource: ${tsStr(mem.resource)}, thread: ${tsStr(`${slug(agent.id)}-demo`)} };`,
    plans.length > 0 && "",
    plans.length > 0 &&
      'const queryInput = z.object({ query: z.string().describe("What to do, in plain language.") });',
    helpers.flat().filter((l): l is string => typeof l === "string"),
    plans.flatMap((p) => ["", ...toolDef(p)]),
    agentBlock.flat().filter((l): l is string => typeof l === "string"),
    main.filter((l): l is string => typeof l === "string"),
  );
}

function notes(agent: Agent): string[] {
  const plans = planTools(agent, "ts");
  const gated = plans.filter((p) => p.gated);
  const logged = plans.filter((p) => p.audited && !p.gated);
  const scope = agent.memory.scope;
  return pickNotes(
    [
      escalationNote(plans),
      gated.length > 0 &&
        `${namesOf(gated)} use${gated.length > 1 ? "" : "s"} requireApproval, which suspends the run into a storage snapshot. That is why the Mastra instance configures LibSQLStore.`,
      logged.length > 0 &&
        `Mastra has no per-tool 'log' level, so ${namesOf(logged)} ${logged.length > 1 ? "call" : "calls"} an auditedCall wrapper from execute().`,
      scope === "org" &&
        "Mastra memory is scoped per resource (usually a user); 'org' maps to one shared resource id, so every run reads the same working memory.",
      scope === "project" &&
        "Mastra memory is scoped per resource (usually a user); 'project' maps to one shared resource id for the whole project.",
    ],
    [
      'The model comes from @ai-sdk/anthropic (reads ANTHROPIC_API_KEY); the model-router string "anthropic/' +
        claudeModel(agent) +
        '" works too.',
      "Register this agent on your app's existing Mastra instance instead of the one here if you already have one.",
    ],
  );
}

export const mastra: FrameworkModule = {
  id: "mastra",
  label: LABEL,
  language: "typescript",
  fileName: () => "agent.mastra.ts",
  install: "npm install @mastra/core @mastra/memory @mastra/libsql @ai-sdk/anthropic zod",
  render,
  notes,
};
