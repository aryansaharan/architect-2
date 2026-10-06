import type { Agent, AgentTool, Blueprint } from "@/lib/blueprint/schema";
import { SUPERVISION_LABEL, supervisionView } from "@/lib/blueprint/describe";

/**
 * Shared helpers for the framework templates. Everything here is pure and
 * defensive: any blueprint text (quotes, backslashes, newlines, braces, emoji)
 * must come out as syntactically valid Python / TypeScript.
 */

// ── Line assembly ────────────────────────────────────────────────────────────

export type Chunk = string | false | null | undefined | Chunk[];

/** Join chunks with newlines, dropping `false | null | undefined` (use "" for a blank line). */
export function lines(...chunks: Chunk[]): string {
  const out: string[] = [];
  const walk = (c: Chunk) => {
    if (c === false || c === null || c === undefined) return;
    if (Array.isArray(c)) c.forEach(walk);
    else out.push(c);
  };
  chunks.forEach(walk);
  return out.join("\n") + "\n";
}

// ── Text & escaping ──────────────────────────────────────────────────────────

const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const hex2 = (c: string) => c.charCodeAt(0).toString(16).padStart(2, "0");

/** Collapse all line breaks / control characters into single spaces. */
export function oneLine(s: string): string {
  return s
    .replace(/[\r\n\u2028\u2029\u0085]+/g, " ")
    .replace(CONTROL, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Text that is safe inside a `#` or `//` line comment. */
export function commentText(s: string): string {
  return oneLine(s).replace(/\*\//g, "* /");
}

/** A double-quoted Python string literal (JSON escapes are valid Python escapes). */
export function pyStr(s: string): string {
  return JSON.stringify(s);
}

/** Body of a Python triple-double-quoted string; newlines are kept literally. */
export function pyTripleBody(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/"(?="|$)/g, '\\"')
    .replace(CONTROL, (c) => `\\x${hex2(c)}`);
}

/** A one-line Python docstring. */
export function pyDoc(s: string, fallback: string): string {
  const text = oneLine(s) || fallback;
  return `"""${pyTripleBody(text)}"""`;
}

/** A double-quoted TypeScript string literal. */
export function tsStr(s: string): string {
  return JSON.stringify(s)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Body of a TypeScript template literal; newlines are kept literally. */
export function tsTemplateBody(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${")
    .replace(CONTROL, (c) => `\\x${hex2(c)}`);
}

/** kebab-case slug for ids, thread names, memory namespaces. */
export function slug(s: string, fallback = "agent"): string {
  const out = s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return out || fallback;
}

/** Text whose `{name}` placeholders would be eaten by a framework's prompt templating. */
export const TEMPLATE_VAR = /\{[A-Za-z_][A-Za-z0-9_:.?-]*\}/;

// ── Identifiers ──────────────────────────────────────────────────────────────

/** Split a whitespace-separated word list (keeps the lists compact and diff-friendly). */
const words = (s: TemplateStringsArray) => s[0].trim().split(/\s+/);

const PY_KEYWORDS = words`
  False None True and as assert async await break class continue def del elif else except finally for from
  global if import in is lambda nonlocal not or pass raise return try while with yield
`;
const PY_BUILTINS = words`
  abs all any bool bytes callable dict dir enumerate eval exec filter float format getattr globals hasattr hash
  help id input int isinstance iter len list locals map max min next object open print property range repr
  reversed round set setattr slice sorted str sum super tuple type vars zip
`;
/** Names the Python templates define or import at module level. */
const PY_TEMPLATE_NAMES = words`
  agent root_agent build_agent graph builder model call_model crew task llm memory studio session main audit
  audited_call approved_call ask call_connection require_approval audit_trail audit_tool_call tool function_tool
  interrupt load_memory types logging asyncio os contextmanager iterator optional any set_tracing_disabled
  before_tool_call after_tool_call tools tools_condition config result decisions pending answer response uuid4
`;
export const PY_RESERVED = new Set([...PY_KEYWORDS, ...PY_BUILTINS, ...PY_TEMPLATE_NAMES]);

const TS_KEYWORDS = words`
  break case catch class const continue debugger default delete do else enum export extends false finally for
  function if import in instanceof new null return super switch this throw true try typeof var void while with
  as implements interface let package private protected public static yield await async any boolean number
  string symbol type of undefined arguments eval
`;
/** Names the Mastra template defines or imports at module level. */
const TS_TEMPLATE_NAMES = words`
  z anthropic Agent Mastra Memory LibSQLStore createTool createInterface pathToFileURL instructions queryInput
  callConnection auditedCall mastra MEMORY SAMPLE_INPUT main memory process console
`;
export const TS_RESERVED = new Set([...TS_KEYWORDS, ...TS_TEMPLATE_NAMES]);

function splitWords(s: string): string[] {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

/** snake_case Python identifier. Never a keyword, builtin or template name. */
export function pyIdent(s: string, fallback = "tool"): string {
  let id = splitWords(s).join("_") || fallback;
  if (/^[0-9]/.test(id)) id = `${fallback}_${id}`;
  if (PY_RESERVED.has(id)) id = `${id}_${fallback}`;
  return id;
}

/** camelCase TypeScript identifier. Never a keyword or template name. */
export function camel(s: string, fallback = "tool"): string {
  const w = splitWords(s);
  let id = w.length
    ? w[0] +
      w
        .slice(1)
        .map((x) => x[0].toUpperCase() + x.slice(1))
        .join("")
    : fallback;
  if (/^[0-9]/.test(id)) id = `${fallback}${id[0].toUpperCase()}${id.slice(1)}`;
  if (TS_RESERVED.has(id)) id = `${id}Tool`;
  return id;
}

/** Give each tool a unique identifier (two ids may normalise to the same name). */
function uniqueNames(tools: AgentTool[], make: (id: string) => string, sep: string): string[] {
  const seen = new Map<string, number>();
  return tools.map((t) => {
    const base = make(t.id);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}${sep}${n}`;
  });
}

// ── Agent-level helpers ──────────────────────────────────────────────────────

/** The Claude model id without any provider prefix (e.g. "claude-opus-5"). */
export function claudeModel(agent: Agent): string {
  const m = agent.cost.model.trim().replace(/^anthropic[/:]/i, "");
  return m || "claude-opus-5";
}

/** Job description followed by the rules as a bulleted "Rules:" section. */
export function rulesBlock(agent: Agent): string {
  const rules = agent.rules.map((r) => oneLine(r)).filter(Boolean);
  return rules.length ? `Rules:\n${rules.map((r) => `- ${r}`).join("\n")}` : "";
}

export function systemPrompt(agent: Agent): string {
  const job = agent.jobDescription.replace(/\r\n?/g, "\n").trim();
  return [job, rulesBlock(agent)].filter(Boolean).join("\n\n");
}

export function sampleInput(agent: Agent): string {
  return agent.rehearsals[0]?.input?.trim() || "Introduce yourself and list the tools you can use.";
}

export function connectionLabel(bp: Blueprint, id: string): string {
  const c = bp.connections.find((x) => x.id === id);
  return c ? `${id} (${c.name})` : id;
}

/** Comment text naming the connections this agent's stubs stand in for (ids only when names get long). */
export function connectionsComment(agent: Agent, bp: Blueprint, maxLen = 64): string {
  const ids = [...new Set(agent.tools.map((t) => t.connectionId))];
  const named = commentText(ids.map((id) => connectionLabel(bp, id)).join(", "));
  return named.length <= maxLen ? named : commentText(ids.join(", "));
}

export function header(agent: Agent, bp: Blueprint, label: string, mark: "#" | "//"): string[] {
  const mem = agent.memory.scope === "none" ? "none" : `${agent.memory.scope} (${agent.memory.retentionDays} days)`;
  return [
    `${mark} Generated by Prod AI from blueprint ${commentText(bp.meta.name)} · agent ${commentText(agent.name)}`,
    `${mark} Edit freely: Prod AI reads this file back on the next sync.`,
    `${mark} ${label} · ${commentText(claudeModel(agent))} · supervision: ${supervisionView(agent).mode === "custom" ? `custom (preset ${agent.supervision}, tools edited one by one)` : agent.supervision} · memory: ${mem}`,
  ];
}

// ── Permission policy ────────────────────────────────────────────────────────

export type ToolPlan = {
  tool: AgentTool;
  /** Identifier in the generated source (snake_case for Python, camelCase for TS). */
  name: string;
  /** Needs a human approval before it runs. */
  gated: boolean;
  /** Emits audit log lines around execution. */
  audited: boolean;
  /** Short reason for the gate, e.g. "irreversible" (used in comments). */
  why: string;
};

/**
 * The single permission policy all templates share (the same rule as the
 * playground, lib/agents/tools.ts approvalFor):
 * - permission "ask" or access "irreversible" → approval gate
 * - gated tools and permission "log" → audit trail
 * - everything else runs directly
 * Supervision is a preset that writes each tool's permission, so "approve_all"
 * arrives here as every tool on "ask": every tool is gated, no special case.
 */
export function planTools(agent: Agent, lang: "py" | "ts"): ToolPlan[] {
  const names = uniqueNames(agent.tools, (id) => (lang === "py" ? pyIdent(id) : camel(id)), lang === "py" ? "_" : "");
  return agent.tools.map((tool, i) => {
    const byPermission = tool.permission === "ask";
    const byAccess = tool.access === "irreversible";
    const gated = byPermission || byAccess;
    const why = byPermission ? "permission ask" : byAccess ? "irreversible" : "";
    return { tool, name: names[i], gated, audited: gated || tool.permission === "log", why };
  });
}

const list = (xs: string[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

export const namesOf = (plans: ToolPlan[]) => list(plans.map((p) => p.tool.id));

/**
 * Framework-agnostic note for gates that are stricter than the blueprint says
 * (irreversible tools not set to "ask" still ask a person first).
 */
export function escalationNote(plans: ToolPlan[]): string | null {
  const loose = plans.filter((p) => p.gated && p.tool.permission !== "ask");
  const perm = [...new Set(loose.map((p) => `'${p.tool.permission}'`))].join("/");
  if (loose.length)
    return `${namesOf(loose)} ${loose.length > 1 ? "are" : "is"} set to ${perm} but can't be undone, so the generated code asks a person first anyway; set ${loose.length > 1 ? "them" : "it"} to 'ask' to match.`;
  return null;
}

/** Pick 2–4 notes: conditional ones first, topped up to 3 with always-true fallbacks. */
export function pickNotes(conditional: (string | null | false | undefined)[], fallbacks: string[]): string[] {
  const out = conditional.filter((n): n is string => typeof n === "string" && n.length > 0).slice(0, 4);
  for (const f of fallbacks) {
    if (out.length >= 3) break;
    if (!out.includes(f)) out.push(f);
  }
  return out.slice(0, 4);
}

// ── Python snippets shared by the Python templates ──────────────────────────

/** `NAME = """\ ... """` holding the system prompt (job description + rules). */
export function pyPromptConst(name: string, text: string): string[] {
  return [`${name} = """\\`, pyTripleBody(text), `"""`];
}

/** The one connection stub every tool body ends up calling. */
export function pyConnectionStub(agent: Agent, bp: Blueprint): string[] {
  if (!agent.tools.length) return [];
  const bound = connectionsComment(agent, bp);
  return [
    bound
      ? `# Stub for Prod AI's connection runtime; bound on deploy to ${bound}.`
      : "# Stub for Prod AI's connection runtime.",
    "def call_connection(connection_id: str, tool_id: str, query: str) -> str:",
    '    return f"[stub] {tool_id} via {connection_id}: {query}"',
  ];
}

/** `audited_call(...)`: call_connection with an audit line before and after (needs `audit`). */
export function pyAuditedCall(): string[] {
  return [
    "def audited_call(connection_id: str, tool_id: str, query: str) -> str:",
    '    """Audit trail for permission \'log\' and every approved call."""',
    '    audit.info("%s start query=%r", tool_id, query)',
    "    result = call_connection(connection_id, tool_id, query)",
    '    audit.info("%s ok", tool_id)',
    "    return result",
  ];
}

/**
 * The single `return ...` line of a tool body: `approved_call` when the template gates
 * in-body (and the tool is gated), `audited_call` for audited tools, else `call_connection`.
 */
export function pyToolReturn(p: ToolPlan, gateInBody: boolean, auditInBody = true): string {
  const args = `${pyStr(p.tool.connectionId)}, ${pyStr(p.tool.id)}, query`;
  if (gateInBody && p.gated) return `    return approved_call(${args})  ${gateComment(p, "#")}`;
  if (auditInBody && p.audited) return `    return audited_call(${args})`;
  return `    return call_connection(${args})`;
}

/** Blank-line separated blocks (PEP 8: two blank lines between top-level definitions). */
export function pyBlocks(blocks: string[][]): string[] {
  const out: string[] = [];
  for (const b of blocks.filter((x) => x.length)) {
    if (out.length) out.push("", "");
    out.push(...b);
  }
  return out;
}

// ── Shared comment lines ─────────────────────────────────────────────────────

/**
 * How supervision maps onto the generated code (plain text, add your own comment mark).
 * Supervision is a preset over the tool permissions, so this only explains the gates
 * planTools already produced; it never adds or removes one.
 */
export function supervisionLine(agent: Agent, plans: ToolPlan[], how: string): string {
  return commentText(supervisionText(agent, plans, how));
}

function supervisionText(agent: Agent, plans: ToolPlan[], how: string): string {
  const view = supervisionView(agent);
  const gated = plans.filter((p) => p.gated);
  const gates = gated.length ? `${namesOf(gated)} wait${gated.length > 1 ? "" : "s"} for a person (${how})` : "nothing waits for a person";
  if (view.mode === "custom")
    return `Supervision: custom (preset "${agent.supervision}", then edited tool by tool). Each tool keeps its own permission: ${gates}.`;
  if (view.mode === "approve_all")
    return `Supervision "approve_all" (${SUPERVISION_LABEL.approve_all.label}): every tool is set to ask, so every call waits for a person (${how}).`;
  if (view.mode === "spot_check")
    return `Supervision "spot_check": ${gates}; everything else runs end to end and Prod AI samples finished runs for review.`;
  return gated.length
    ? `Supervision "autonomous": ${gates}; everything else runs on its own.`
    : `Supervision "autonomous": no human in the loop; Prod AI keeps the run log.`;
}

/** Inline comment explaining why a tool is gated, e.g. `# needs approval: irreversible`. */
export function gateComment(p: ToolPlan, mark: "#" | "//"): string {
  return `${mark} needs approval: ${commentText(p.why)}`;
}
