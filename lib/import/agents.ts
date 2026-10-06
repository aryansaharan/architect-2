/**
 * Reads the agents a repository really defines, from its source files:
 * OpenAI Agents SDK `Agent(name=..., instructions=..., tools=[...])`, CrewAI
 * `Agent(role=...)` and config/agents.yaml, LangGraph `create_react_agent(...)`
 * and StateGraph nodes, Google ADK, AutoGen, Pydantic AI, and TypeScript
 * `new Agent({ name, ... })` (OpenAI Agents JS, Mastra, AI SDK).
 *
 * Pure and dependency-free: regexes over a scanner that blanks out strings and
 * comments, so an "Agent(" inside a prompt is never mistaken for a definition.
 * It never invents an agent: anything it can't read is left out, and callers
 * say so.
 */

export type DetectedTool = {
  /** The tool as the code names it ("update_seat", "TavilySearchResults", "getWeather"). */
  name: string;
  description?: string;
  /** A library tool (a class instantiated in the list), not a function in the repo. */
  external?: boolean;
  /** Where the tool's own definition was read, when it was. */
  file?: string;
};

export type DetectedAgent = {
  /** The agent's own name as written: name="Triage Agent", a CrewAI role, or the graph's name. */
  name: string;
  /** The code symbol that holds it (variable, method or YAML key), when there is one. */
  symbol?: string;
  /** Framework id, as in the stack report ("openai_agents", "crewai", "langgraph"…). */
  framework: string;
  /** The file it is defined in. */
  file: string;
  /** "guardrail" for checker agents used as guardrails; "graph" for a LangGraph graph read as one agent. */
  kind: "agent" | "guardrail" | "graph";
  /** CrewAI role, or what the agent is for in a few words. */
  role?: string;
  /** One or two sentences: handoff description, CrewAI goal, ADK description, or the start of its instructions. */
  summary?: string;
  /** Its instructions or system prompt, as written (whitespace tidied, capped). */
  instructions?: string;
  tools: DetectedTool[];
  /** Names of the agents it hands off to. */
  handoffs: string[];
  /** Guardrails attached to it, readable ("Relevance Guardrail: checks the input is about airline travel"). */
  guardrails: string[];
  /** LangGraph: the graph's nodes, in the order they are added. */
  steps?: string[];
};

export type AgentScan = {
  /** Source files read for agent definitions (at most MAX_AGENT_FILES). */
  filesRead: string[];
  /** How many files looked like they could define agents. */
  candidates: number;
  agents: DetectedAgent[];
  /** Tools defined in the files read, including ones no agent was seen using. */
  toolCount: number;
};

/** Extra raw fetches spent on reading agent definitions, on top of manifests and the README. */
export const MAX_AGENT_FILES = 10;

// ── Which files to read ──────────────────────────────────────────────────────

const SKIP = /(^|\/)(node_modules|dist|build|\.next|\.git|\.venv|venv|env|__pycache__|coverage|vendor|site-packages|migrations|\.github|docs?|public|static|assets)(\/|$)|(^|\/)(tests?|__tests__|spec|specs)\/|(^|\/)test_[\w-]*\.py$|\.(test|spec)\.[jt]s$|\.d\.ts$/i;
const SOURCE = /\.(py|ts|js|mjs|ya?ml)$/;

function baseScore(path: string): number {
  const base = path.split("/").pop() ?? "";
  const dir = path.split("/").slice(0, -1);
  if (/^agents?\.ya?ml$/i.test(base)) return 90;
  if (!/\.(py|ts|js|mjs)$/.test(base)) return 0;
  if (/^agents?\.(py|ts|js|mjs)$/i.test(base)) return 85;
  if (/(^|\/)mastra\/index\.(ts|js)$/.test(path)) return 80;
  if (/[_-]agents?\.(py|ts|js|mjs)$|[a-z]Agents?\.(ts|js)$|\.agent\.(ts|js)$/.test(base)) return 80;
  if (/^(crew|[\w-]+_crew)\.py$/.test(base)) return 80;
  if (/^(graph|workflow|supervisor|swarm|orchestrator)\.(py|ts|js)$/.test(base)) return 75;
  if (dir.some((d) => /^agents?$/i.test(d))) return 70;
  if (/^nodes\.(py|ts)$/.test(base)) return 60;
  if (/^tools\.(py|ts|js)$/.test(base) || dir.some((d) => d === "tools")) return 50;
  if (/^guardrails?\.(py|ts)$/.test(base)) return 45;
  if (/^(main|app|server|index)\.(py|ts)$/.test(base)) return 20;
  return 0;
}

/** Files langgraph.json points at ("./my_agent/agent.py:graph" → "my_agent/agent.py"), with the graph names. */
export function langgraphTargets(manifests: Record<string, string>): { file: string; graph: string; symbol?: string }[] {
  const out: { file: string; graph: string; symbol?: string }[] = [];
  for (const [path, text] of Object.entries(manifests)) {
    if (!/(^|\/)langgraph\.json$/.test(path)) continue;
    try {
      const graphs = (JSON.parse(text) as { graphs?: Record<string, unknown> }).graphs ?? {};
      const dir = path.split("/").slice(0, -1);
      for (const [graph, target] of Object.entries(graphs)) {
        if (typeof target !== "string") continue;
        const [rel, symbol] = target.split(":");
        const parts = [...dir];
        for (const seg of rel.split("/")) {
          if (seg === "." || !seg) continue;
          if (seg === "..") parts.pop();
          else parts.push(seg);
        }
        out.push({ file: parts.join("/"), graph, ...(symbol ? { symbol } : {}) });
      }
    } catch {
      /* not JSON: ignore */
    }
  }
  return out;
}

/**
 * The files most likely to define agents, best first, at most MAX_AGENT_FILES:
 * what langgraph.json points at, agents.yaml / agents.py / crew.py / graph.py,
 * agents/ folders, then tools and guardrails. Folders the stack report cites as
 * framework evidence rank first.
 */
export function agentSourceCandidates(paths: string[], frameworks: { id: string; evidence: string }[], manifests: Record<string, string>): { picked: string[]; candidates: number } {
  const evidenceDirs = [...new Set(frameworks.flatMap((f) => [...f.evidence.matchAll(/(?:dependency in|file) ([^\s·]+)/g)].map((m) => m[1].split("/").slice(0, -1).join("/"))))].filter(Boolean);
  const targets = new Set(langgraphTargets(manifests).map((t) => t.file));
  const scored = paths
    .filter((p) => SOURCE.test(p) && !SKIP.test(p))
    .map((p) => {
      let score = targets.has(p) ? 100 : baseScore(p);
      if (!score) return { p, score };
      if (evidenceDirs.some((d) => p.startsWith(`${d}/`) || (d.split("/").length > 1 && p.startsWith(`${d.split("/").slice(0, 2).join("/")}/`)))) score += 25;
      score -= p.split("/").length * 2;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.localeCompare(b.p));
  return { picked: scored.slice(0, MAX_AGENT_FILES).map((x) => x.p), candidates: scored.length };
}

// ── Scanner ──────────────────────────────────────────────────────────────────

type Lang = "py" | "ts";
type Str = { start: number; end: number; value: string };
type Scan = { text: string; blank: string; strings: Str[] };

const langOf = (path: string): Lang | "yaml" | null => (/\.py$/.test(path) ? "py" : /\.(ts|js|mjs)$/.test(path) ? "ts" : /\.ya?ml$/.test(path) ? "yaml" : null);

function decodePy(raw: string, isRaw: boolean, isF: boolean): string {
  let s = raw;
  if (!isRaw) s = s.replace(/\\(n|t|r|"|'|\\|\n)/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "" : c === "\n" ? "" : c));
  if (isF) s = s.replace(/\{\{/g, "\u0001").replace(/\}\}/g, "\u0002").replace(/\{([^{}]*)\}/g, (_, e: string) => placeholder(e.replace(/!r|:[^}]*$/, ""))).replace(/\u0001/g, "{").replace(/\u0002/g, "}");
  return s;
}

/** An interpolated value in a prompt: shared prompt prefixes (RECOMMENDED_PROMPT_PREFIX) are dropped, anything else stays as {name}. */
const placeholder = (expr: string) => {
  const e = expr.trim();
  return /^[A-Z][A-Z0-9_]*$/.test(e) && /PROMPT|PREFIX|INSTRUCTION|PREAMBLE|HEADER/.test(e) ? "" : `{${e}}`;
};

function decodeTs(raw: string, template: boolean): string {
  let s = raw.replace(/\\(n|t|"|'|`|\\)/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
  if (template) s = s.replace(/\$\{([^}]*)\}/g, (_, e: string) => placeholder(e));
  return s;
}

/** Blanks strings and comments (same length, newlines kept) and collects every string literal's value. */
function scan(text: string, lang: Lang): Scan {
  const out = text.split("");
  const strings: Str[] = [];
  const blankRange = (a: number, b: number) => {
    for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (lang === "py" && c === "#") {
      const e = text.indexOf("\n", i);
      const end = e < 0 ? n : e;
      blankRange(i, end);
      i = end;
      continue;
    }
    if (lang === "ts" && c === "/" && text[i + 1] === "/") {
      const e = text.indexOf("\n", i);
      const end = e < 0 ? n : e;
      blankRange(i, end);
      i = end;
      continue;
    }
    if (lang === "ts" && c === "/" && text[i + 1] === "*") {
      const e = text.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      blankRange(i, end);
      i = end;
      continue;
    }
    if (lang === "ts" && c === "/") {
      // A regex literal, when a "/" starts an expression. Skipped so quotes inside it don't open strings.
      let k = i - 1;
      while (k >= 0 && /[ \t]/.test(text[k])) k--;
      if (k < 0 || /[(,=:[!&|?{};\n]/.test(text[k])) {
        let j = i + 1;
        let cls = false;
        while (j < n && text[j] !== "\n") {
          if (text[j] === "\\") {
            j += 2;
            continue;
          }
          if (text[j] === "/" && !cls) break;
          if (text[j] === "[") cls = true;
          else if (text[j] === "]") cls = false;
          j++;
        }
        if (j < n && text[j] === "/") {
          blankRange(i + 1, j);
          i = j + 1;
          continue;
        }
      }
    }
    const quote = c === '"' || c === "'" || (lang === "ts" && c === "`");
    if (!quote) {
      i++;
      continue;
    }
    let prefix = "";
    if (lang === "py") {
      let k = i - 1;
      while (k >= 0 && k >= i - 2 && /[rRbBuUfF]/.test(text[k])) k--;
      if (k < 0 || !/[\w]/.test(text[k])) prefix = text.slice(k + 1, i).toLowerCase();
    }
    const triple = lang === "py" && text.startsWith(c.repeat(3), i);
    const open = triple ? 3 : 1;
    const isRaw = prefix.includes("r");
    let j = i + open;
    while (j < n) {
      if (text[j] === "\\" && !(isRaw && lang === "py")) {
        j += 2;
        continue;
      }
      if (triple ? text.startsWith(c.repeat(3), j) : text[j] === c) break;
      if (!triple && c !== "`" && text[j] === "\n") break;
      if (lang === "ts" && c === "`" && text[j] === "$" && text[j + 1] === "{") {
        let depth = 1;
        j += 2;
        while (j < n && depth) {
          if (text[j] === "{") depth++;
          else if (text[j] === "}") depth--;
          j++;
        }
        continue;
      }
      j++;
    }
    const contentEnd = Math.min(j, n);
    const raw = text.slice(i + open, contentEnd);
    const value = lang === "py" ? decodePy(raw, isRaw, prefix.includes("f")) : decodeTs(raw, c === "`");
    strings.push({ start: i - prefix.length, end: Math.min(contentEnd + open, n), value });
    blankRange(i + open, contentEnd);
    i = Math.min(contentEnd + open, n);
  }
  return { text, blank: out.join(""), strings };
}

/** The index of the bracket closing the one at `open`, read on blanked text. */
function closing(blank: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: string[] = [];
  for (let k = open; k < blank.length; k++) {
    const ch = blank[k];
    if (pairs[ch]) stack.push(pairs[ch]);
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (stack.pop() !== ch) return -1;
      if (!stack.length) return k;
    }
  }
  return -1;
}

type Span = { start: number; end: number };
/** Top-level comma-separated parts of blank[a, b). */
function splitTop(blank: string, a: number, b: number): Span[] {
  const parts: Span[] = [];
  let depth = 0;
  let from = a;
  for (let k = a; k < b; k++) {
    const ch = blank[k];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) {
      parts.push({ start: from, end: k });
      from = k + 1;
    }
  }
  if (blank.slice(from, b).trim()) parts.push({ start: from, end: b });
  return parts.filter((p) => blank.slice(p.start, p.end).trim());
}

const tidy = (s: string, max = 1500) => {
  const t = s.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n").trim().replace(/\n/g, " ");
  return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, "")}…` : t;
};

/** Every string literal inside [a, b), joined: `("You are " "the triage agent.")` → "You are the triage agent." */
function stringsIn(s: Scan, a: number, b: number): string {
  return s.strings
    .filter((x) => x.start >= a && x.end <= b)
    .map((x) => x.value)
    .join("");
}

type Arg = { key: string | null; span: Span; valueStart: number };
/** Python keyword arguments, or TypeScript object properties, of the call or object at [a, b). */
function args(s: Scan, a: number, b: number, lang: Lang): Arg[] {
  return splitTop(s.blank, a, b).map((span) => {
    const seg = s.blank.slice(span.start, span.end);
    const m = lang === "py" ? seg.match(/^\s*([A-Za-z_]\w*)\s*=(?!=)\s*/) : seg.match(/^\s*(?:["']?)([A-Za-z_$][\w$]*)(?:["']?)\s*:\s*/);
    if (m) return { key: m[1], span, valueStart: span.start + m[0].length };
    return { key: null, span, valueStart: span.start + (seg.length - seg.trimStart().length) };
  });
}

const valueText = (s: Scan, arg: Arg) => s.text.slice(arg.valueStart, arg.span.end).trim();
const valueBlank = (s: Scan, arg: Arg) => s.blank.slice(arg.valueStart, arg.span.end).trim();

/** The items of a list literal value ("[a, b.c, Tool()]"), or of a TS object of tools ("{ getWeather, x: y }"). */
function listItems(s: Scan, arg: Arg): { text: string; blank: string; key?: string }[] {
  const vb = s.blank.slice(arg.valueStart, arg.span.end);
  const lead = vb.length - vb.trimStart().length;
  const open = arg.valueStart + lead;
  const ch = s.blank[open];
  if (ch !== "[" && ch !== "{") return [];
  const close = closing(s.blank, open);
  if (close < 0) return [];
  return splitTop(s.blank, open + 1, close).map((sp) => {
    const text = s.text.slice(sp.start, sp.end).trim();
    const blank = s.blank.slice(sp.start, sp.end).trim();
    if (ch === "{") {
      const m = blank.match(/^(?:\.\.\.)?([A-Za-z_$][\w$]*)\s*(?::|$|\()/);
      return { text, blank, key: m?.[1] };
    }
    return { text, blank };
  });
}

// ── Framework of a file ──────────────────────────────────────────────────────

const PY_IMPORTS: [RegExp, string][] = [
  [/^\s*(?:from\s+agents(?:\.[\w.]+)?\s+import|import\s+agents\b)/m, "openai_agents"],
  [/^\s*(?:from\s+crewai(?:\.[\w.]+)?\s+import|import\s+crewai\b)/m, "crewai"],
  [/^\s*from\s+google\.adk\b/m, "google_adk"],
  [/^\s*(?:from|import)\s+pydantic_ai\b/m, "pydantic_ai"],
  [/^\s*(?:from|import)\s+(?:autogen|autogen_agentchat)\b/m, "autogen"],
  [/^\s*(?:from|import)\s+langgraph\b/m, "langgraph"],
];
const TS_IMPORTS: [RegExp, string][] = [
  [/from\s+["']@openai\/agents[\w/-]*["']/, "openai_agents"],
  [/from\s+["']@mastra\/core[\w/-]*["']/, "mastra"],
  [/from\s+["']@google\/adk[\w/-]*["']/, "google_adk"],
  [/from\s+["']@langchain\/langgraph[\w/-]*["']/, "langgraph"],
  [/from\s+["']ai["']/, "ai_sdk"],
];

function frameworksOf(text: string, lang: Lang): string[] {
  return (lang === "py" ? PY_IMPORTS : TS_IMPORTS).filter(([re]) => re.test(text)).map(([, id]) => id);
}

// ── Reading one file ─────────────────────────────────────────────────────────

type RawAgent = DetectedAgent & { order: number; configKey?: string; toolRefs: string[]; handoffRefs: string[]; guardrailRefs: string[] };
type Docs = { tools: Map<string, DetectedTool>; guardrails: Map<string, string>; lists: Map<string, string[]>; strings: Map<string, string> };

const pretty = (sym: string) =>
  sym
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");

const firstSentence = (s: string | undefined, max = 220) => {
  if (!s) return undefined;
  const t = s.replace(/^\s*\{[^}]*\}\s*/, "").trim();
  const m = t.match(/^(.{20,}?[.!?])(\s|$)/);
  const out = (m ? m[1] : t).trim();
  return out.length > max ? `${out.slice(0, max).replace(/\s+\S*$/, "")}…` : out || undefined;
};

/** The name a list item refers to: `update_seat`, `SearchTools.search_internet`, `TavilySearchResults(max_results=1)`, `handoff(agent=x)`. */
function refName(item: { text: string; blank: string }): { name: string; external: boolean; handoffTarget?: string } | null {
  const b = item.blank.replace(/^\*+|^\.\.\./, "").trim();
  const handoff = b.match(/^handoff\s*\(/) ? item.text.match(/agent\s*[=:]\s*([A-Za-z_][\w.]*)/) : null;
  if (handoff) return { name: handoff[1].split(".").pop()!, external: false, handoffTarget: handoff[1].split(".").pop()! };
  const call = b.match(/^([A-Za-z_][\w.]*)\s*\(/);
  if (call) {
    const name = call[1].split(".").pop()!;
    return { name, external: /^[A-Z]/.test(name) };
  }
  const ref = b.match(/^([A-Za-z_$][\w.$]*)$/);
  if (ref) return { name: ref[1].split(".").pop()!, external: false };
  return null;
}

/** The code symbol an agent is assigned to or returned from: `triage_agent = Agent(`, `def local_expert(self): return Agent(`. */
function symbolAt(s: Scan, at: number, lang: Lang): string | undefined {
  const lineStart = s.blank.lastIndexOf("\n", at - 1) + 1;
  const before = s.blank.slice(lineStart, at);
  const assign = lang === "py" ? before.match(/([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*$/) : before.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:new\s*)?$|([A-Za-z_$][\w$]*)\s*:\s*(?:new\s*)?$/);
  if (assign) return assign[1] ?? assign[2];
  if (/\breturn\s*$/.test(before) || /\breturn\s+new\s*$/.test(before)) {
    const head = s.blank.slice(0, lineStart);
    const defs = [...head.matchAll(lang === "py" ? /^[ \t]*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm : /(?:function\s+([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{]*)?\{)/g)];
    const last = defs[defs.length - 1];
    return last ? (last[1] ?? last[2]) : undefined;
  }
  return undefined;
}

/** The strings in a Python function's body (for `instructions=some_function`). */
function functionStrings(s: Scan, name: string): string | undefined {
  const re = new RegExp(`^([ \\t]*)(?:async\\s+)?def\\s+${name}\\s*\\(`, "m");
  const m = re.exec(s.blank);
  if (!m) return undefined;
  const open = m.index + m[0].length - 1;
  const close = closing(s.blank, open);
  if (close < 0) return undefined;
  const indent = m[1].length;
  const bodyStart = s.blank.indexOf("\n", close) + 1;
  let end = s.blank.length;
  const lines = s.blank.slice(bodyStart).split("\n");
  let pos = bodyStart;
  for (const line of lines) {
    if (line.trim() && line.length - line.trimStart().length <= indent) {
      end = pos;
      break;
    }
    pos += line.length + 1;
  }
  // The prompt is what the function returns; strings before the return are defaults like "[unknown]".
  const ret = s.blank.slice(bodyStart, end).search(/\breturn\b/);
  const text = stringsIn(s, ret >= 0 ? bodyStart + ret : bodyStart, end) || stringsIn(s, bodyStart, end);
  return text.trim() ? text : undefined;
}

/** Collects tool definitions, guardrail labels, list and string constants from a file. */
function collectDocs(file: string, s: Scan, lang: Lang, docs: Docs) {
  const { blank, text } = s;
  if (lang === "py") {
    // @function_tool(...) / @tool / @tool("Label") / @input_guardrail(name="...") above a def.
    const deco = /^[ \t]*@([\w.]+)\s*(\()?/gm;
    let m: RegExpExecArray | null;
    while ((m = deco.exec(blank))) {
      const kind = m[1].split(".").pop()!;
      if (!/^(function_tool|tool|input_guardrail|output_guardrail)$/.test(kind)) continue;
      let after = m.index + m[0].length;
      let label: string | undefined;
      let override: string | undefined;
      let described: string | undefined;
      if (m[2]) {
        const close = closing(blank, after - 1);
        if (close < 0) continue;
        for (const a of args(s, after, close, "py")) {
          const v = stringsIn(s, a.valueStart, a.span.end);
          if (a.key === "name_override" || a.key === "name") override = v || override;
          else if (a.key === "description_override" || a.key === "description") described = v || described;
          else if (!a.key && v) label = v;
        }
        after = close + 1;
      }
      const def = /^[ \t]*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/m.exec(blank.slice(after));
      if (!def || blank.slice(after, after + def.index).replace(/^[ \t]*@[^\n]*$/gm, "").trim()) continue;
      const fn = def[1];
      const defAt = after + def.index;
      const open = defAt + def[0].length - 1;
      const close = closing(blank, open);
      const doc = close > 0 ? s.strings.find((x) => x.start > close && x.start < close + 200 && /^\s*:?[^\n]*\n?\s*$/.test(blank.slice(close + 1, x.start).replace(/->[^:]*:/, ":"))) : undefined;
      const docLine = doc ? tidy(doc.value, 240) : undefined;
      if (/guardrail/.test(kind)) {
        const name = override ?? label ?? pretty(fn);
        docs.guardrails.set(fn, docLine ? `${name}: ${docLine.replace(/\.$/, "")}.` : name);
      } else {
        const tool: DetectedTool = { name: override ?? fn, description: described ?? docLine ?? label, file };
        docs.tools.set(fn, tool);
        if (override) docs.tools.set(override, tool);
      }
    }
    // Module-level list and string constants: `tools = [TavilySearchResults(max_results=1)]`, `system_prompt = """..."""`.
    const assign = /^([A-Za-z_]\w*)\s*(?::[^=\n]+)?=\s*/gm;
    while ((m = assign.exec(blank))) {
      const at = m.index + m[0].length;
      const ch = blank[at];
      if (ch === "[") {
        const close = closing(blank, at);
        if (close < 0) continue;
        const items = splitTop(blank, at + 1, close).map((sp) => refName({ text: text.slice(sp.start, sp.end).trim(), blank: blank.slice(sp.start, sp.end).trim() })?.name).filter((x): x is string => Boolean(x));
        if (items.length) docs.lists.set(m[1], items);
      } else {
        const lineEnd = blank.indexOf("\n", at);
        const str = s.strings.find((x) => x.start >= at && x.start <= at + 12);
        if (str && (lineEnd < 0 || str.start < lineEnd)) {
          const joined = stringsIn(s, str.start, Math.max(str.end, lineEnd < 0 ? blank.length : lineEnd));
          if (joined.trim().length > 8 && !docs.strings.has(m[1])) docs.strings.set(m[1], joined);
        }
      }
    }
  } else {
    // export const getWeather = tool({ description: "..." }) / createTool({ id, description })
    // Also `const createDocument = ({ session }: Props) => tool({ ... })`: an arrow that returns the tool.
    const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:[^;=]{0,200}=>\s*(?:\{\s*return\s+)?)?(tool|createTool|dynamicTool)\s*(?:<[^>]*>)?\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(blank))) {
      const open = m.index + m[0].length - 1;
      const close = closing(blank, open);
      if (close < 0) continue;
      const objOpen = blank.indexOf("{", open);
      const objClose = objOpen > 0 && objOpen < close ? closing(blank, objOpen) : -1;
      let description: string | undefined;
      let id: string | undefined;
      if (objClose > 0) {
        for (const a of args(s, objOpen + 1, objClose, "ts")) {
          if (a.key === "description") description = stringsIn(s, a.valueStart, a.span.end) || description;
          if (a.key === "id" || a.key === "name") id = stringsIn(s, a.valueStart, a.span.end) || id;
        }
      }
      const tool: DetectedTool = { name: id ?? m[1], description: description ? tidy(description, 240) : undefined, file };
      docs.tools.set(m[1], tool);
    }
  }
}

const PY_CALL = /\b(Agent|LlmAgent|AssistantAgent|ConversableAgent|create_react_agent|create_agent)\s*(?:\[[^\]\n]*\])?\s*\(/g;
const TS_CALL = /\bnew\s+(Agent|ToolLoopAgent|Experimental_Agent|LlmAgent)\s*(?:<[^>\n]*>)?\s*\(|\b(Agent\.create|createReactAgent|createAgent)\s*(?:<[^>\n]*>)?\s*\(/g;

function readPyAgents(file: string, s: Scan, fws: string[], docs: Docs, order: { n: number }): RawAgent[] {
  const out: RawAgent[] = [];
  PY_CALL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PY_CALL.exec(s.blank))) {
    const callee = m[1];
    const framework = /create_(react_)?agent/.test(callee) ? "langgraph" : /^(AssistantAgent|ConversableAgent)$/.test(callee) ? "autogen" : fws.find((f) => f !== "langgraph") ?? null;
    if (!framework || (framework === "langgraph" && !fws.includes("langgraph") && !/create_react_agent/.test(callee))) continue;
    if (framework === "autogen" && !fws.includes("autogen")) continue;
    // A definition, not a type hint or a subclass: "class X(Agent)" and "def f() -> Agent(" don't count.
    const lineStart = s.blank.lastIndexOf("\n", m.index - 1) + 1;
    if (/^\s*class\s/.test(s.blank.slice(lineStart, m.index))) continue;
    const open = m.index + m[0].length - 1;
    const close = closing(s.blank, open);
    if (close < 0) continue;
    const kw = new Map<string, Arg>();
    const positional: Arg[] = [];
    for (const a of args(s, open + 1, close, "py")) {
      if (a.key) kw.set(a.key, a);
      else positional.push(a);
    }
    const str = (key: string) => {
      const a = kw.get(key);
      if (!a) return undefined;
      const lit = stringsIn(s, a.valueStart, a.span.end);
      if (lit.trim()) return lit;
      const ident = valueBlank(s, a).match(/^([A-Za-z_]\w*)$/)?.[1];
      if (!ident) return undefined;
      return functionStrings(s, ident) ?? docs.strings.get(ident);
    };
    const symbol = symbolAt(s, m.index, "py");
    const configKey = kw.get("config") ? valueText(s, kw.get("config")!).match(/\[\s*["']([\w-]+)["']\s*\]/)?.[1] : undefined;
    const role = str("role");
    const explicitName = str("name") ?? (framework === "autogen" && positional[0] ? stringsIn(s, positional[0].valueStart, positional[0].span.end) || undefined : undefined);
    const name = (explicitName ?? role ?? (configKey ? pretty(configKey) : symbol ? pretty(symbol) : "")).trim();
    if (!name) continue;
    const instructions = str("instructions") ?? str("instruction") ?? str("system_prompt") ?? str("system_message") ?? str("prompt") ?? str("state_modifier") ?? str("backstory");
    const toolsArg = kw.get("tools") ?? (framework === "langgraph" ? positional[1] : undefined);
    let toolRefs: string[] = [];
    if (toolsArg) {
      const items = listItems(s, toolsArg);
      toolRefs = items.length ? items.map((it) => refName(it)?.name).filter((x): x is string => Boolean(x)) : docs.lists.get(valueBlank(s, toolsArg).replace(/^\*+/, "")) ?? [];
      for (const it of items) {
        const r = refName(it);
        if (r?.external && !docs.tools.has(r.name)) docs.tools.set(r.name, { name: r.name, external: true });
      }
    }
    const handoffRefs = kw.get("handoffs") ? listItems(s, kw.get("handoffs")!).map((it) => refName(it)?.handoffTarget ?? refName(it)?.name).filter((x): x is string => Boolean(x)) : [];
    const guardrailRefs = [...(kw.get("input_guardrails") ? listItems(s, kw.get("input_guardrails")!) : []), ...(kw.get("output_guardrails") ? listItems(s, kw.get("output_guardrails")!) : [])].map((it) => refName(it)?.name).filter((x): x is string => Boolean(x));
    const summary = str("handoff_description") ?? str("goal") ?? str("description");
    const guardrail = /guardrail/i.test(`${name} ${symbol ?? ""}`);
    out.push({
      name: tidy(name, 80),
      symbol: symbol ?? configKey,
      framework,
      file,
      kind: guardrail ? "guardrail" : "agent",
      role: role ? tidy(role, 80) : undefined,
      summary: summary ? tidy(summary, 280) : undefined,
      instructions: instructions ? tidy(instructions) : undefined,
      tools: [],
      handoffs: [],
      guardrails: [],
      order: order.n++,
      configKey,
      toolRefs,
      handoffRefs,
      guardrailRefs,
    });
  }
  return out;
}

function readTsAgents(file: string, s: Scan, fws: string[], docs: Docs, order: { n: number }): RawAgent[] {
  const out: RawAgent[] = [];
  TS_CALL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TS_CALL.exec(s.blank))) {
    const callee = m[1] ?? m[2];
    const framework = /createReactAgent|createAgent/.test(callee) ? "langgraph" : callee === "ToolLoopAgent" || callee === "Experimental_Agent" ? "ai_sdk" : fws.find((f) => f !== "langgraph") ?? null;
    if (!framework || !fws.length) continue;
    const open = m.index + m[0].length - 1;
    const close = closing(s.blank, open);
    if (close < 0) continue;
    const objOpen = s.blank.indexOf("{", open);
    if (objOpen < 0 || objOpen > close || s.blank.slice(open + 1, objOpen).trim()) continue;
    const objClose = closing(s.blank, objOpen);
    if (objClose < 0) continue;
    const props = new Map(args(s, objOpen + 1, objClose, "ts").filter((a) => a.key).map((a) => [a.key!, a]));
    const str = (key: string) => {
      const a = props.get(key);
      if (!a) return undefined;
      const lit = stringsIn(s, a.valueStart, a.span.end);
      if (lit.trim()) return lit;
      const ident = valueBlank(s, a).match(/^([A-Za-z_$][\w$]*)$/)?.[1];
      return ident ? docs.strings.get(ident) : undefined;
    };
    const symbol = symbolAt(s, m.index, "ts");
    const name = (str("name") ?? str("id") ?? (symbol ? pretty(symbol) : "")).trim();
    if (!name) continue;
    const toolsArg = props.get("tools");
    const toolRefs = toolsArg ? listItems(s, toolsArg).map((it) => it.key ?? refName(it)?.name).filter((x): x is string => Boolean(x)) : [];
    const handoffRefs = props.get("handoffs") ? listItems(s, props.get("handoffs")!).map((it) => refName(it)?.handoffTarget ?? refName(it)?.name).filter((x): x is string => Boolean(x)) : [];
    const instructions = str("instructions") ?? str("prompt") ?? str("system");
    const summary = str("handoffDescription") ?? str("description");
    out.push({
      name: tidy(name, 80),
      symbol,
      framework,
      file,
      kind: /guardrail/i.test(`${name} ${symbol ?? ""}`) ? "guardrail" : "agent",
      summary: summary ? tidy(summary, 280) : undefined,
      instructions: instructions ? tidy(instructions) : undefined,
      tools: [],
      handoffs: [],
      guardrails: [],
      order: order.n++,
      toolRefs,
      handoffRefs,
      guardrailRefs: [],
    });
  }
  return out;
}

/** Handoffs wired after the agents are made: `triage.handoffs = [...]`, `.handoffs.extend([...])`, `.handoffs.append(x)`. */
function lateHandoffs(s: Scan): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /\b([A-Za-z_]\w*)\.handoffs\s*(?:=\s*|\.(?:extend|append|push)\s*\(\s*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s.blank))) {
    const at = m.index + m[0].length;
    const ch = s.blank[at];
    let items: string[] = [];
    if (ch === "[") {
      const close = closing(s.blank, at);
      if (close < 0) continue;
      items = splitTop(s.blank, at + 1, close)
        .map((sp) => refName({ text: s.text.slice(sp.start, sp.end).trim(), blank: s.blank.slice(sp.start, sp.end).trim() }))
        .map((r) => r?.handoffTarget ?? r?.name)
        .filter((x): x is string => Boolean(x));
    } else {
      const ident = s.blank.slice(at).match(/^([A-Za-z_]\w*)/)?.[1];
      if (ident) items = [ident];
    }
    out.set(m[1], [...(out.get(m[1]) ?? []), ...items]);
  }
  return out;
}

/** CrewAI config/agents.yaml: top-level keys with role, goal and backstory (plain or folded/literal block scalars). */
function readCrewYaml(file: string, text: string, order: { n: number }): RawAgent[] {
  const out: RawAgent[] = [];
  const lines = text.split(/\r?\n/);
  let cur: { key: string; fields: Record<string, string> } | null = null;
  let field: string | null = null;
  let fieldIndent = 0;
  const flush = () => {
    if (!cur) return;
    const f = cur.fields;
    const role = f.role?.trim();
    if (role || f.goal || f.backstory) {
      out.push({
        name: tidy(role || pretty(cur.key), 80),
        symbol: cur.key,
        framework: "crewai",
        file,
        kind: "agent",
        role: role ? tidy(role, 80) : undefined,
        summary: f.goal ? tidy(f.goal, 280) : undefined,
        instructions: f.backstory ? tidy(f.backstory) : undefined,
        tools: [],
        handoffs: [],
        guardrails: [],
        order: order.n++,
        configKey: cur.key,
        toolRefs: f.tools ? f.tools.replace(/[[\]]/g, "").split(/[,\s]+/).filter((t) => /^[A-Za-z_]\w*$/.test(t)) : [],
        handoffRefs: [],
        guardrailRefs: [],
      });
    }
  };
  for (const line of lines) {
    if (/^\s*#/.test(line) || !line.trim()) {
      if (field && cur) cur.fields[field] += "\n";
      continue;
    }
    const indent = line.length - line.trimStart().length;
    const top = line.match(/^([A-Za-z_][\w-]*):\s*$/);
    if (top && indent === 0) {
      flush();
      cur = { key: top[1], fields: {} };
      field = null;
      continue;
    }
    if (!cur) continue;
    const kv = line.match(/^(\s+)([A-Za-z_]\w*):\s*(.*)$/);
    if (kv && (!field || kv[1].length <= fieldIndent)) {
      field = kv[2];
      fieldIndent = kv[1].length;
      const v = kv[3].trim();
      cur.fields[field] = /^[>|][+-]?$/.test(v) ? "" : v.replace(/^["']|["']$/g, "");
      if (!/^[>|]/.test(v)) field = v ? null : field;
      continue;
    }
    if (field && indent > fieldIndent) cur.fields[field] += ` ${line.trim()}`;
  }
  flush();
  return out;
}

/** LangGraph StateGraph files: the graph's nodes, what binds its tools, and the system prompt nearby. */
function readGraph(file: string, s: Scan, graphNames: { file: string; graph: string; symbol?: string }[], order: { n: number }): RawAgent | null {
  if (!/\bStateGraph\b/.test(s.blank) || !/\.(add_node|addNode)\s*\(/.test(s.blank)) return null;
  const steps: string[] = [];
  const re = /\.(add_node|addNode)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s.blank))) {
    const open = m.index + m[0].length - 1;
    const close = closing(s.blank, open);
    if (close < 0) continue;
    const parts = splitTop(s.blank, open + 1, close);
    if (!parts.length) continue;
    const first = parts[0];
    const lit = stringsIn(s, first.start, first.end);
    const name = lit || s.blank.slice(first.start, first.end).trim().match(/^([A-Za-z_]\w*)$/)?.[1];
    if (name && !steps.includes(name)) steps.push(name);
  }
  if (!steps.length) return null;
  const compiled = s.blank.match(/^([A-Za-z_]\w*)\s*=\s*[A-Za-z_]\w*\.compile\s*\(/m)?.[1];
  const target = graphNames.find((g) => g.file === file);
  // The graph's own name (its key in langgraph.json, else the compiled variable), written as a name.
  const graph = target?.graph ?? compiled ?? file.split("/").pop()!.replace(/\.\w+$/, "");
  return {
    name: pretty(graph),
    symbol: target?.symbol ?? compiled,
    framework: "langgraph",
    file,
    kind: "graph",
    role: "LangGraph graph",
    tools: [],
    handoffs: [],
    guardrails: [],
    steps,
    order: order.n++,
    toolRefs: [],
    handoffRefs: [],
    guardrailRefs: [],
  };
}

/**
 * Every agent defined in these files (path → source), best candidates first.
 * `manifests` lets LangGraph graphs take their names from langgraph.json.
 */
export function detectAgents(files: Record<string, string>, manifests: Record<string, string> = {}): { agents: DetectedAgent[]; toolCount: number } {
  const docs: Docs = { tools: new Map(), guardrails: new Map(), lists: new Map(), strings: new Map() };
  const scans: { file: string; lang: Lang; s: Scan; fws: string[] }[] = [];
  const order = { n: 0 };
  const raw: RawAgent[] = [];
  const graphNames = langgraphTargets(manifests);

  for (const [file, text] of Object.entries(files)) {
    const lang = langOf(file);
    if (lang === "yaml") {
      if (/(^|\/)agents?\.ya?ml$/i.test(file)) raw.push(...readCrewYaml(file, text, order));
      continue;
    }
    if (!lang) continue;
    const s = scan(text, lang);
    scans.push({ file, lang, s, fws: frameworksOf(text, lang) });
    collectDocs(file, s, lang, docs);
  }
  const late = new Map<string, string[]>();
  for (const { file, lang, s, fws } of scans) {
    if (!fws.length) continue;
    raw.push(...(lang === "py" ? readPyAgents(file, s, fws, docs, order) : readTsAgents(file, s, fws, docs, order)));
    for (const [k, v] of lateHandoffs(s)) late.set(k, [...(late.get(k) ?? []), ...v]);
  }

  // LangGraph: a StateGraph is read as one agent only when no agent was defined on its own next to it
  // (then the graph is orchestration around those agents, not an agent itself).
  if (!raw.some((a) => a.framework === "langgraph")) {
    for (const { file, s, fws } of scans) {
      if (!fws.includes("langgraph")) continue;
      const dir = file.split("/").slice(0, -1).join("/");
      if (raw.some((a) => !dir || a.file.startsWith(`${dir}/`))) continue;
      const g = readGraph(file, s, graphNames, order);
      if (!g) continue;
      // Tools bound in the graph's package: ToolNode(tools) / bind_tools(tools), resolved through list constants.
      const pkg = file.split("/").slice(0, -1)[0] ?? "";
      const nearby = scans.filter((x) => !pkg || x.file.startsWith(`${pkg}/`));
      const refs = new Set<string>();
      let prompt: string | undefined;
      for (const x of nearby) {
        for (const tm of x.s.blank.matchAll(/\b(?:ToolNode|bind_tools|bindTools)\s*\(\s*([A-Za-z_]\w*)/g)) for (const t of docs.lists.get(tm[1]) ?? [tm[1]]) refs.add(t);
        for (const tm of x.s.blank.matchAll(/\b(?:ToolNode|bind_tools|bindTools)\s*\(\s*\[/g)) {
          const open = (tm.index ?? 0) + tm[0].length - 1;
          const close = closing(x.s.blank, open);
          if (close > 0) for (const sp of splitTop(x.s.blank, open + 1, close)) {
            const r = refName({ text: x.s.text.slice(sp.start, sp.end).trim(), blank: x.s.blank.slice(sp.start, sp.end).trim() });
            if (r) refs.add(r.name);
          }
        }
        if (!prompt) {
          for (const [k, v] of docs.strings) if (/system_?prompt|SYSTEM_PROMPT|^prompt$|instructions/i.test(k) && x.s.blank.includes(k)) prompt = v;
          const sys = x.s.blank.match(/SystemMessage\s*\(/);
          if (!prompt && sys?.index !== undefined) {
            const open = sys.index + sys[0].length - 1;
            const close = closing(x.s.blank, open);
            if (close > 0) prompt = stringsIn(x.s, open, close) || undefined;
          }
        }
      }
      g.toolRefs = [...refs].filter((r) => docs.tools.has(r) || /^[A-Z]/.test(r) || [...docs.lists.values()].some((l) => l.includes(r)));
      for (const r of g.toolRefs) if (!docs.tools.has(r) && /^[A-Z]/.test(r)) docs.tools.set(r, { name: r, external: true });
      if (prompt) g.instructions = tidy(prompt);
      g.summary = `A LangGraph graph with ${g.steps!.length} node${g.steps!.length === 1 ? "" : "s"}: ${g.steps!.join(" → ")}.`;
      raw.push(g);
    }
  }

  // Best candidate files first (the order `files` came in), then the order agents appear in each file.
  const rank = new Map(Object.keys(files).map((f, i) => [f, i]));
  raw.sort((a, b) => (rank.get(a.file) ?? 0) - (rank.get(b.file) ?? 0) || a.order - b.order);

  // CrewAI: an agent defined in config/agents.yaml and again in crew.py (Agent(config=...)) is one agent.
  const project = (file: string) => file.split("/").slice(0, -1).join("/").replace(/\/config$/, "");
  const merged: RawAgent[] = [];
  for (const a of raw) {
    const twin = a.configKey ? merged.find((b) => b.framework === a.framework && b.configKey === a.configKey && project(b.file) === project(a.file)) : undefined;
    if (twin) {
      const yaml = /\.ya?ml$/.test(twin.file) ? twin : a;
      const code = yaml === twin ? a : twin;
      Object.assign(twin, { ...yaml, toolRefs: [...new Set([...yaml.toolRefs, ...code.toolRefs])], order: twin.order });
      continue;
    }
    if (merged.some((b) => b.framework === a.framework && b.name.toLowerCase() === a.name.toLowerCase() && b.file === a.file)) continue;
    merged.push(a);
  }

  const bySymbol = new Map(merged.filter((a) => a.symbol).map((a) => [a.symbol!, a]));
  const agents: DetectedAgent[] = merged.map((a) => {
    const tools = [...new Set([...a.toolRefs])].map((ref) => docs.tools.get(ref) ?? { name: ref }).filter((t, i, all) => all.findIndex((x) => x.name === t.name) === i);
    const handoffs = [...new Set([...a.handoffRefs, ...(a.symbol ? late.get(a.symbol) ?? [] : [])])].map((ref) => bySymbol.get(ref)?.name ?? pretty(ref)).filter((n) => n !== a.name);
    const guardrails = a.guardrailRefs.map((ref) => docs.guardrails.get(ref) ?? pretty(ref));
    const summary = a.summary ?? firstSentence(a.instructions);
    return {
      name: a.name,
      ...(a.symbol ? { symbol: a.symbol } : {}),
      framework: a.framework,
      file: a.file,
      kind: a.kind,
      ...(a.role ? { role: a.role } : {}),
      ...(summary ? { summary } : {}),
      ...(a.instructions ? { instructions: a.instructions } : {}),
      tools,
      handoffs,
      guardrails,
      ...(a.steps ? { steps: a.steps } : {}),
    };
  });
  const toolNames = new Set([...[...docs.tools.values()].map((t) => t.name), ...agents.flatMap((a) => a.tools.map((t) => t.name))]);
  return { agents, toolCount: toolNames.size };
}

export const FRAMEWORK_LABEL: Record<string, string> = { langgraph: "LangGraph", crewai: "CrewAI", openai_agents: "OpenAI Agents SDK", google_adk: "Google ADK", mastra: "Mastra", ai_sdk: "Vercel AI SDK", autogen: "AutoGen", pydantic_ai: "Pydantic AI" };

/** The most agents one project holds (BlueprintSchema). */
export const MAX_AGENTS = 6;

/** The folder of the nearest manifest above a file: one project in a repository that holds several. */
export function projectOf(file: string, tree: string[] | undefined): string {
  if (!tree?.length) return "";
  const has = new Set(tree);
  const parts = file.split("/").slice(0, -1);
  for (let i = parts.length; i > 0; i--) {
    const dir = parts.slice(0, i).join("/");
    if (["pyproject.toml", "requirements.txt", "package.json", "setup.py", "langgraph.json"].some((m) => has.has(`${dir}/${m}`))) return dir;
  }
  return "";
}

/** Which detected agents go on the plan: the primary project's agents (not guardrail checkers), six at most. */
export function pickAgents(detected: DetectedAgent[], tree?: string[]): { mapped: DetectedAgent[]; left: DetectedAgent[]; project: string; projects: number } {
  const primary = detected.filter((a) => a.kind !== "guardrail");
  if (!primary.length) return { mapped: [], left: [], project: "", projects: 0 };
  const project = projectOf(primary[0].file, tree);
  const projects = new Set(primary.map((a) => projectOf(a.file, tree))).size;
  const same = primary.filter((a) => projectOf(a.file, tree) === project);
  const mapped = same.slice(0, MAX_AGENTS);
  return { mapped, left: primary.filter((a) => !mapped.includes(a)), project, projects };
}

/**
 * The stack report's frameworks, saying where each one's agents were read (not only which dependency names
 * it), plus any framework found only through its imports (its manifest may sit deeper than was read).
 */
export function withAgentEvidence<F extends { id: string; label: string; evidence: string }>(frameworks: F[], agents: DetectedAgent[]): { id: string; label: string; evidence: string }[] {
  const out: { id: string; label: string; evidence: string }[] = frameworks.map((f) => ({ id: f.id, label: f.label, evidence: f.evidence.replace(/( · )?[^·]* read from [^·]*$/, "") }));
  for (const fw of [...new Set(agents.map((a) => a.framework))]) {
    const mine = agents.filter((a) => a.framework === fw);
    const srcs = [...new Set(mine.map((a) => a.file))];
    const where = `${describeAgents(mine)} read from ${srcs[0]}${srcs.length > 1 ? ` and ${srcs.length - 1} more file${srcs.length > 2 ? "s" : ""}` : ""}`;
    const f = out.find((x) => x.id === fw);
    if (f) f.evidence = [f.evidence, where].filter(Boolean).join(" · ");
    else out.push({ id: fw, label: FRAMEWORK_LABEL[fw] ?? fw, evidence: where });
  }
  return out;
}

/** Counts for a sentence: "6 agents and 2 guardrail checks". */
export function describeAgents(agents: DetectedAgent[]): string {
  const main = agents.filter((a) => a.kind !== "guardrail").length;
  const guards = agents.length - main;
  const parts = [main ? `${main} agent${main === 1 ? "" : "s"}` : "", guards ? `${guards} guardrail check${guards === 1 ? "" : "s"}` : ""].filter(Boolean);
  return parts.join(" and ") || "no agents";
}

/** Cleans detected agents sent back by the client before they shape a project: shapes, lengths and counts. */
export function cleanAgents(v: unknown): DetectedAgent[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const str = (x: unknown, max: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : undefined);
  const out: DetectedAgent[] = [];
  for (const a of v.slice(0, 40)) {
    if (!a || typeof a !== "object") continue;
    const r = a as Record<string, unknown>;
    const name = str(r.name, 80);
    const file = str(r.file, 300);
    const framework = str(r.framework, 40);
    if (!name || !file || !framework) continue;
    const kind = r.kind === "guardrail" || r.kind === "graph" ? r.kind : "agent";
    const tools = (Array.isArray(r.tools) ? r.tools : [])
      .slice(0, 20)
      .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
      .flatMap((t): DetectedTool[] => {
        const name = str(t.name, 80);
        if (!name) return [];
        const description = str(t.description, 300);
        const file = str(t.file, 300);
        return [{ name, ...(description ? { description } : {}), ...(t.external === true ? { external: true } : {}), ...(file ? { file } : {}) }];
      });
    const list = (x: unknown, max: number, width: number) => (Array.isArray(x) ? x.map((y) => str(y, width)).filter((y): y is string => Boolean(y)).slice(0, max) : []);
    out.push({
      name,
      symbol: str(r.symbol, 80),
      framework,
      file,
      kind,
      role: str(r.role, 80),
      summary: str(r.summary, 300),
      instructions: str(r.instructions, 1600),
      tools,
      handoffs: list(r.handoffs, 12, 80),
      guardrails: list(r.guardrails, 6, 300),
      steps: r.steps ? list(r.steps, 20, 60) : undefined,
    });
  }
  return out;
}
