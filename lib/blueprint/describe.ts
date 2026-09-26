import type { Agent, AgentTool, Blueprint, Connection, Entity, Screen } from "./schema";
import { allBlocks, BLOCK_LABELS } from "./index";

/** Plain-English sentences for the "Plain" face. Deterministic, no model needed. */

export const ACCESS_LABEL: Record<AgentTool["access"], string> = {
  read: "Can read",
  write: "Can change",
  irreversible: "Can't be undone",
};

export const PERMISSION_LABEL: Record<AgentTool["permission"], string> = {
  auto: "Just do it",
  log: "Do it and tell me",
  ask: "Ask me first",
};

export const SUPERVISION_LABEL: Record<Agent["supervision"], { label: string; plain: string }> = {
  autonomous: { label: "Works on its own", plain: "Acts without waiting, and every action is logged." },
  spot_check: { label: "Spot-checked", plain: "Acts on its own; a person reviews a sample of its work each day." },
  approve_all: { label: "Approves everything", plain: "Prepares work, then waits for a person to approve each action." },
};

export const MEMORY_LABEL: Record<Agent["memory"]["scope"], string> = {
  none: "Remembers nothing between conversations",
  session: "Remembers only the current conversation",
  project: "Remembers across this project",
  org: "Shares memory across your organisation",
};

export const FRAMEWORK_LABEL: Record<Agent["framework"], string> = {
  lyzr: "Lyzr ADK",
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
      writes.length ? `Changes ${list(writes.map((t) => lowerFirst(t.name)))}, and each change is logged.` : null,
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
  return `${c.plain} It ${auth}. ${users.length ? `Used by ${list(users.map((a) => a.name))}.` : "No agent uses it yet."} ${c.status === "missing" ? "Not connected yet. Add it before going live." : "Connected."}`;
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
