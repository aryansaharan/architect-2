import type { Agent, AgentTool, Block, Blueprint, Connection, Framework, ToolAccess } from "@/lib/blueprint/schema";
import { presetPermission } from "@/lib/blueprint/describe";
import { PRICE } from "@/lib/prices";
import { estimate } from "@/lib/blueprint/estimate";
import { integrityErrors } from "@/lib/blueprint/validate";
import { hash } from "@/lib/sim/hash";
import { FRAMEWORK_LABEL, MAX_AGENTS, describeAgents, pickAgents, type DetectedAgent, type DetectedTool } from "./agents";

export { FRAMEWORK_LABEL, pickAgents, projectOf } from "./agents";

/**
 * Maps the agents read from an imported repository (lib/import/agents.ts) into
 * the plan, deterministically: every agent keeps its real name, instructions
 * and tools, and the plan gets no agent the repository doesn't define. Pure:
 * shared by the import route and tests.
 */

/** Frameworks the Blueprint can hold. Others (AutoGen, Pydantic AI, AI SDK) keep their name in the agent's description. */
const FW: Record<string, Framework> = { langgraph: "langgraph", crewai: "crewai", openai_agents: "openai_agents", google_adk: "google_adk", lyzr: "lyzr", mastra: "mastra" };

const MAX_TOOLS = 6;
const MAX_CONNECTIONS = 8;

const kebab = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "item";
const snake = (s: string) => kebab(s.replace(/([a-z0-9])([A-Z])/g, "$1_$2")).replace(/-/g, "_");
function uniq(base: string, used: Set<string>): string {
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}
const words = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const nameTokens = (s: string) => new Set(words(s).filter((w) => !/^(agent|agents|the|and|of|a|an|bot|assistant|specialist)$/.test(w)));

const IRREVERSIBLE = /^(send|email|mail|post|publish|pay|payout|refund|charge|transfer|wire|cancel|delete|remove|destroy|book|purchase|buy|issue|submit|terminate|deploy|tweet|sms|text|notify|invite)$/;
const WRITE = /^(update|set|assign|create|add|edit|write|save|change|draft|upload|move|mark|record|log|insert|put|patch|store|rename|tag|schedule)$/;

/** How risky a tool is, from the verbs in its name (and its description when the name has none). */
export function guessAccess(tool: Pick<DetectedTool, "name" | "description">): ToolAccess {
  const fromName = words(tool.name);
  if (fromName.some((w) => IRREVERSIBLE.test(w))) return "irreversible";
  if (fromName.some((w) => WRITE.test(w))) return "write";
  const verb = words(tool.description ?? "")[0] ?? "";
  if (IRREVERSIBLE.test(verb)) return "irreversible";
  if (WRITE.test(verb)) return "write";
  return "read";
}

/** A library tool's service, readable: "TavilySearchResults" → "Tavily Search", "GmailGetThread" → "Gmail Get Thread". */
const serviceName = (cls: string) =>
  cls
    .replace(/(Results?|Tool|Tools|Run|Wrapper|API)$/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim() || cls;

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/, "")}…` : s);

export type AgentMapping = {
  blueprint: Blueprint;
  /** The agents now on the plan, as read from the repository. */
  mapped: DetectedAgent[];
  /** Agents read but not on the plan (another project in the repository, or past six). */
  left: DetectedAgent[];
  /** One sentence for the activity log and the stack report. */
  note: string;
};

/** The sentence that says what was read and what was mapped. Never claims more than the scan found. */
export function mappingNote(detected: DetectedAgent[], mapped: DetectedAgent[], left: DetectedAgent[], project: string, projects: number, filesRead: number): string {
  if (!detected.length) return `No agent definitions found in the ${filesRead} file${filesRead === 1 ? "" : "s"} read, so the agents on this plan are proposals, not code from your repository.`;
  if (!mapped.length) return `Read ${describeAgents(detected)}, all guardrail checks. The agents on this plan are proposals; the checks became their rules.`;
  const names = mapped.map((a) => a.name).join(", ");
  if (!left.length) return `Mapped ${mapped.length === 1 ? "the one agent" : `all ${mapped.length} agents`} read from your code: ${names}.`;
  if (projects > 1) return `This repository holds ${projects} separate projects. Mapped the ${mapped.length} agents of ${project || "the root project"}/ (${names}); the other ${left.length} are listed in the stack report.`;
  return `Mapped the first ${mapped.length} of ${mapped.length + left.length} agents read (a project holds ${MAX_AGENTS}): ${names}. The rest are listed in the stack report.`;
}

/**
 * Replaces the plan's agents with the ones the repository defines. The model
 * (or starter) plan still supplies screens and data; an agent it drafted is
 * reused only for its layout slot, never for its identity. Tools map to
 * connections that say where the code is ("tools.py in your repo") or which
 * library service it calls ("Tavily Search"), all not connected yet.
 * With nothing detected, the plan's agents stay but are marked as proposals.
 */
export function applyDetectedAgents(bp: Blueprint, detected: DetectedAgent[], opts: { tree?: string[]; filesRead?: number; modelId?: string } = {}): AgentMapping {
  const { mapped, left, project, projects } = pickAgents(detected, opts.tree);
  const note = mappingNote(detected, mapped, left, project, projects, opts.filesRead ?? 0);
  if (!mapped.length) {
    const next = structuredClone(bp);
    for (const a of next.agents) a.origin = "generated";
    return { blueprint: next, mapped, left, note };
  }

  const next = structuredClone(bp);
  const db = next.connections.find((c) => c.kind === "database");
  const connections: Connection[] = db ? [db] : [];
  const connIds = new Set(connections.map((c) => c.id));
  const byKey = new Map<string, Connection>();
  const connectionFor = (t: DetectedTool, agentFile: string): string => {
    const external = t.external === true;
    const key = external ? `ext:${serviceName(t.name)}` : `code:${t.file ?? "repo"}`;
    const have = byKey.get(key);
    if (have) return have.id;
    // Past the cap, repository tools share one connection and library tools share another.
    if (connections.length >= MAX_CONNECTIONS) {
      const shared = [...byKey.values()].find((c) => (external ? c.auth === "api_key" : c.auth === "none")) ?? connections[connections.length - 1];
      byKey.set(key, shared);
      return shared.id;
    }
    const base = t.file ? t.file.split("/").pop()! : "";
    const c: Connection = external
      ? { id: uniq(kebab(serviceName(t.name)), connIds), name: serviceName(t.name), kind: "http", auth: "api_key", status: "missing", plain: `${serviceName(t.name)}, a library tool your agents call (${t.name}). Needs its API key; runs on test data until then.` }
      : { id: uniq(kebab(`repo-${base || "code"}`), connIds), name: base ? `${base} (your repo)` : "Your repo's code", kind: "http", auth: "none", status: "missing", plain: t.file ? `The tool functions in ${t.file}, called where they are through a thin wrapper. Not connected yet: they run on test data in the sandbox.` : `Tool functions defined elsewhere in your repository (near ${agentFile}). Not connected yet: they run on test data in the sandbox.` };
    connections.push(c);
    byKey.set(key, c);
    return c.id;
  };

  // A drafted agent whose name is close hands over its screen slot (chats, buttons). Only one drafted under exactly
  // this name (the planner was told the real agents) also lends what it planned around it: role, supervision,
  // memory, rehearsals. A starter's "Ticket Triage" never lends its ticket rehearsals to a repo's "Triage Agent".
  const drafted = [...next.agents];
  const claimed = new Set<string>();
  const slotOf = new Map<string, string>();
  const agentIds = new Set<string>();
  const guardrailAgents = detected.filter((a) => a.kind === "guardrail");
  const agents: Agent[] = mapped.map((d) => {
    const mine = nameTokens(`${d.name} ${d.symbol ?? ""}`);
    let match: Agent | undefined;
    let best = 0;
    for (const a of drafted) {
      if (claimed.has(a.id)) continue;
      const theirs = nameTokens(a.name);
      const overlap = [...theirs].filter((w) => mine.has(w)).length;
      const score = overlap / Math.max(1, Math.min(theirs.size, mine.size));
      if (overlap && score > best) {
        best = score;
        match = a;
      }
    }
    if (match && best < 0.5) match = undefined;
    if (match) claimed.add(match.id);
    const id = uniq(kebab(d.name), agentIds);
    if (match) slotOf.set(match.id, id);
    const same = match && match.name.trim().toLowerCase() === d.name.trim().toLowerCase() ? match : undefined;
    const supervision = same?.supervision ?? "spot_check";
    const toolIds = new Set<string>();
    const tools: AgentTool[] = d.tools.slice(0, MAX_TOOLS).map((t) => {
      const drafted = same?.tools.find((x) => snake(x.name) === snake(t.name));
      const access = drafted?.access ?? guessAccess(t);
      return {
        id: uniq(snake(t.name) || "tool", toolIds),
        name: t.name,
        description: clip(t.description ?? (t.external ? `${t.name}, a library tool.` : `Defined in ${t.file ?? "your repository"}.`), 240),
        connectionId: connectionFor(t, d.file),
        access,
        permission: presetPermission(supervision, access),
      };
    });
    const rules = [
      ...d.guardrails.map((g) => clip(/guardrail/i.test(g) ? g : `Guardrail: ${g}`, 160)),
      ...(d.handoffs.length ? [clip(`Hands off to ${d.handoffs.join(", ")}.`, 160)] : []),
      ...(d.steps?.length ? [clip(`Runs the graph ${d.steps.join(" → ")}.`, 160)] : []),
      ...(d.tools.length > MAX_TOOLS ? [`Also uses ${d.tools.slice(MAX_TOOLS).map((t) => t.name).join(", ")} (not shown).`] : []),
    ].slice(0, 7);
    if (!rules.length) rules.push(`Runs as written in ${d.file}. Prod AI wraps it and never rewrites it.`);
    const label = FRAMEWORK_LABEL[d.framework] ?? d.framework;
    const jobDescription = d.instructions ?? `Defined in ${d.file}${d.symbol ? ` as ${d.symbol}` : ""}. Its instructions are built in code at runtime, so they aren't copied here.`;
    const model = same?.cost.model ?? opts.modelId ?? "claude-opus-5";
    // A short role from the summary's first clause ("Provides flight status, …" → "Provides flight status").
    const clause = (d.summary ?? "").split(/[,.;:(]/)[0].trim().split(/\s+/).filter(Boolean);
    return {
      id,
      name: d.name,
      role: d.role ?? same?.role ?? (clause.length && clause.length <= 7 ? clause.join(" ") : `${label} agent`),
      avatarHue: hash(id) % 360,
      plain: clip(`${d.summary ?? `A ${label} agent.`} Defined in ${d.file}${FW[d.framework] ? "" : ` (${label})`}.`, 400),
      jobDescription,
      rules,
      tools,
      supervision,
      knowledge: same?.knowledge ?? [],
      memory: same?.memory ?? { scope: "session", retentionDays: 30 },
      cost: { model, creditsPerRun: PRICE.helperMessage },
      triggers: same?.triggers ?? ["chat"],
      rehearsals: same?.rehearsals ?? [],
      framework: FW[d.framework] ?? "lyzr",
      origin: "imported" as const,
    };
  });
  // Guardrail checker agents without an agent that uses them become a rule on every mapped agent.
  if (guardrailAgents.length && !mapped.some((d) => d.guardrails.length)) {
    for (const a of agents) for (const g of guardrailAgents) if (a.rules.length < 8) a.rules.push(clip(`${/guardrail/i.test(g.name) ? g.name : `Guardrail: ${g.name}`}${g.summary ? `: ${g.summary}` : ""}`, 160));
  }

  // Screens pointed at drafted agents that are gone now point at a real one.
  const ids = new Set(agents.map((a) => a.id));
  const fallback = agents[0];
  const nameOf = new Map(agents.map((a) => [a.id, a.name]));
  const remap = (agentId: string) => slotOf.get(agentId) ?? (ids.has(agentId) ? agentId : fallback.id);
  const fixBlock = (b: Block) => {
    if (b.type === "chat") {
      b.agentId = remap(b.agentId);
      b.title = `Ask ${nameOf.get(b.agentId)}`;
      b.placeholder = `Ask ${nameOf.get(b.agentId)}…`;
      const agent = agents.find((a) => a.id === b.agentId);
      b.starters = (agent?.rehearsals ?? []).slice(0, 2).map((r) => r.input.slice(0, 80));
    }
    const fixAction = (act: { kind: string; agentId?: string } | undefined) => {
      if (act?.kind === "agent" && act.agentId) act.agentId = remap(act.agentId);
    };
    if (b.type === "detail") {
      for (const btn of b.actions) {
        fixAction(btn.action);
        if (btn.action.kind === "agent" && /^Ask /.test(btn.label)) btn.label = `Ask ${nameOf.get(btn.action.agentId)}`;
      }
      // Two buttons for the same agent read as a mistake; keep the first.
      b.actions = b.actions.filter((btn, i, all) => btn.action.kind !== "agent" || all.findIndex((x) => x.action.kind === "agent" && x.action.agentId === (btn.action as { agentId: string }).agentId) === i);
    }
    if (b.type === "actions") for (const btn of b.buttons) fixAction(btn.action);
    if (b.type === "form") fixAction(b.onSubmit);
    if (b.type === "table") fixAction(b.rowAction);
    if (b.type === "list") fixAction(b.onSelect);
  };
  for (const s of next.screens) for (const b of [...s.regions.main, ...s.regions.side]) fixBlock(b);
  // Form toasts that named a drafted agent.
  for (const s of next.screens)
    for (const b of s.regions.main)
      if (b.type === "form" && b.onSubmit.kind === "toast") for (const a of drafted) if (!ids.has(a.id) && b.onSubmit.message.includes(a.name)) b.onSubmit.message = b.onSubmit.message.split(a.name).join(fallback.name);

  next.agents = agents;
  next.connections = connections;
  const errs = integrityErrors(next);
  if (errs.length) throw new Error(`mapped blueprint failed integrity: ${errs.slice(0, 3).join("; ")}`);
  next.estimate = estimate(next);
  return { blueprint: next, mapped, left, note };
}

/** What the planner is told about the repository's agents, so screens and data are built around the real ones. */
export function detectedAgentsPrompt(detected: DetectedAgent[] | undefined, tree?: string[], filesRead = 0): string {
  if (!detected) return "";
  const { mapped } = pickAgents(detected, tree);
  if (!mapped.length) return `\nNo agent definitions were found in the ${filesRead} source files read. Propose the agents this app needs; they will be shown as proposals, not as code from the repository.`;
  const lines = mapped.map((a, i) => {
    const tools = a.tools.length ? ` Tools: ${a.tools.map((t) => t.name).join(", ")}.` : "";
    const hand = a.handoffs.length ? ` Hands off to: ${a.handoffs.join(", ")}.` : "";
    return `${i + 1}. ${a.name} (${FRAMEWORK_LABEL[a.framework] ?? a.framework}, ${a.file}): ${clip(a.summary ?? a.instructions ?? "no description", 220)}${tools}${hand}`;
  });
  return `\nAgents defined in the repository's code (read from source). Plan exactly these agents, with exactly these names, and no others. Use the same tool names:\n${lines.join("\n")}`;
}
