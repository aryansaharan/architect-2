import type { Agent, AgentTool, Blueprint, Connection, Entity, Screen, ToolAccess, ToolPermission } from "./schema";
import { allBlocks, BLOCK_LABELS } from "./index";

/** Plain-English sentences for the "Plain" face. Deterministic, no model needed. */

export const ACCESS_LABEL: Record<AgentTool["access"], string> = {
  read: "Can read",
  write: "Can change",
  irreversible: "Can't be undone",
};

/**
 * One vocabulary everywhere. Tool level: Just do it / Tell me / Ask first.
 * Agent level (supervision): On its own / Spot-check / Approve everything,
 * which is a preset that writes every tool's permission (see SUPERVISION_PRESET).
 */
export const PERMISSION_LABEL: Record<ToolPermission, string> = {
  auto: "Just do it",
  log: "Tell me",
  ask: "Ask first",
};

export const PERMISSION_PLAIN: Record<ToolPermission, string> = {
  auto: "Runs straight away.",
  log: "Runs straight away and tells you what it did.",
  ask: "Waits for a person to approve it every time.",
};

type Supervision = Agent["supervision"];

/**
 * Supervision is a preset, not a second permission system: choosing one sets
 * every tool's permission. Tools that can't be undone always ask first.
 * On its own and Spot-check set the same permissions; Spot-check also has a
 * person review a sample of finished runs.
 */
export const SUPERVISION_PRESET: Record<Supervision, Record<ToolAccess, ToolPermission>> = {
  autonomous: { read: "auto", write: "log", irreversible: "ask" },
  spot_check: { read: "auto", write: "log", irreversible: "ask" },
  approve_all: { read: "ask", write: "ask", irreversible: "ask" },
};

export const SUPERVISION_LABEL: Record<Supervision, { label: string; plain: string }> = {
  autonomous: { label: "On its own", plain: "Looks things up and makes changes without waiting, and tells you what it changed. Anything that can't be undone still asks first." },
  spot_check: { label: "Spot-check", plain: "Works like On its own, and a person reviews a sample of its finished runs." },
  approve_all: { label: "Approve everything", plain: "Every tool asks first. It prepares the work, then waits for a person to approve each action." },
};

export function presetPermission(level: Supervision, access: ToolAccess): ToolPermission {
  return SUPERVISION_PRESET[level][access];
}

/** Choose a preset: sets the agent's supervision and rewrites every tool's permission to match (in place). */
export function applySupervision(agent: Agent, level: Supervision): Agent {
  agent.supervision = level;
  for (const t of agent.tools) t.permission = presetPermission(level, t.access);
  return agent;
}

/** Tools whose permission no longer matches the agent's supervision preset. */
export function toolsOffPreset(agent: Pick<Agent, "supervision" | "tools">): AgentTool[] {
  return agent.tools.filter((t) => t.permission !== presetPermission(agent.supervision, t.access));
}

export type SupervisionView = { mode: Supervision | "custom"; label: string; plain: string; offPreset: AgentTool[] };

/**
 * The honest supervision label. When someone changes a single tool so it no
 * longer matches the preset, the agent reads "Custom" instead of claiming a
 * preset its tools contradict.
 */
export function supervisionView(agent: Pick<Agent, "supervision" | "tools">): SupervisionView {
  const offPreset = toolsOffPreset(agent);
  if (!offPreset.length) return { mode: agent.supervision, ...SUPERVISION_LABEL[agent.supervision], offPreset };
  const preset = SUPERVISION_LABEL[agent.supervision].label;
  return {
    mode: "custom",
    label: "Custom",
    plain: `Set tool by tool. ${list(offPreset.map((t) => `${t.name} is on “${PERMISSION_LABEL[t.permission]}”`))}, unlike ${preset}. Pick a preset to reset every tool.`,
    offPreset,
  };
}

export const MEMORY_LABEL: Record<Agent["memory"]["scope"], string> = {
  none: "Remembers nothing between conversations",
  session: "Remembers only the current conversation",
  project: "Remembers across this project",
  org: "Shares memory across your organisation",
};

export const FRAMEWORK_LABEL: Record<Agent["framework"], string> = {
  langgraph: "LangGraph",
  crewai: "CrewAI",
  openai_agents: "OpenAI Agents SDK",
  google_adk: "Google ADK",
  mastra: "Mastra",
};

export function connectionName(bp: Blueprint, id: string): string {
  return bp.connections.find((c) => c.id === id)?.name ?? id;
}

export function toolSentence(bp: Blueprint, t: AgentTool): string {
  const where = connectionName(bp, t.connectionId);
  if (t.permission === "ask") return `Asks you before it can ${lowerFirst(t.name)} (${where}).`;
  if (t.permission === "log") return `Can ${lowerFirst(t.name)} in ${where}, and tells you when it does.`;
  return `Can ${lowerFirst(t.name)} in ${where}.`;
}

export function agentSummary(bp: Blueprint, a: Agent) {
  const reads = a.tools.filter((t) => t.access === "read");
  const writes = a.tools.filter((t) => t.access === "write");
  const risky = a.tools.filter((t) => t.access === "irreversible");
  const screens = bp.screens.filter((s) =>
    allBlocks(s).some(
      (b) =>
        (b.type === "chat" && b.agentId === a.id) ||
        (b.type === "detail" && b.actions.some((x) => x.action.kind === "agent" && x.action.agentId === a.id)),
    ),
  );
  return {
    reads,
    writes,
    risky,
    screens,
    ungated: risky.filter((t) => t.permission !== "ask"),
    sentence: [
      reads.length ? `Reads ${list(reads.map((t) => connectionName(bp, t.connectionId)))}.` : null,
      writes.length ? `Changes ${list(writes.map((t) => lowerFirst(t.name)))}${writes.every((t) => t.permission === "ask") ? " once a person approves" : ", and each change is logged"}.` : null,
      risky.length ? `${risky.length === 1 ? "One action" : `${risky.length} actions`} can't be undone (${list(risky.map((t) => lowerFirst(t.name)))}).` : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export function screenSummary(bp: Blueprint, s: Screen): string {
  const parts = allBlocks(s).map((b) => {
    if ("entityId" in b && b.entityId) {
      const e = bp.entities.find((x) => x.id === b.entityId);
      return `${BLOCK_LABELS[b.type].toLowerCase()} of ${e?.plural.toLowerCase() ?? b.entityId}`;
    }
    if (b.type === "chat") return `a chat with ${bp.agents.find((a) => a.id === b.agentId)?.name ?? b.agentId}`;
    return BLOCK_LABELS[b.type].toLowerCase();
  });
  return `Shows ${list(parts)}.`;
}

export function entitySummary(bp: Blueprint, e: Entity): string {
  const usedOn = bp.screens.filter((s) => allBlocks(s).some((b) => "entityId" in b && b.entityId === e.id));
  return `${e.plural} have ${e.fields.length} details (${list(e.fields.slice(0, 4).map((f) => (f.label ?? f.name).toLowerCase()))}${e.fields.length > 4 ? ", …" : ""}). Shown on ${usedOn.length ? list(usedOn.map((s) => s.title)) : "no screens yet"}.`;
}

export function connectionSummary(bp: Blueprint, c: Connection): string {
  const users = bp.agents.filter((a) => a.tools.some((t) => t.connectionId === c.id));
  const auth = c.auth === "oauth" ? "signs in with your account" : c.auth === "api_key" ? "uses a private key" : "needs no sign-in";
  return `${c.plain} It ${auth}. ${users.length ? `Used by ${list(users.map((a) => a.name))}.` : "No agent uses it yet."} ${c.status === "missing" ? "Not connected yet: it runs on test data until you add a key, and Preflight reminds you before going live." : "Connected."}`;
}

export function list(items: string[]): string {
  const u = [...new Set(items)];
  if (u.length <= 1) return u[0] ?? "";
  if (u.length === 2) return `${u[0]} and ${u[1]}`;
  return `${u.slice(0, -1).join(", ")} and ${u[u.length - 1]}`;
}

export function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

const PROVIDER_LABEL: Record<string, string> = { google: "Google", email: "email link", sso: "company SSO" };
/** "google, sso" → "Google or company SSO" */
export function signInMethods(providers: string[]): string {
  const names = providers.map((p) => PROVIDER_LABEL[p] ?? p);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}
