import { estimate } from "./estimate";
import {
  BlueprintSchema,
  type Agent,
  type Block,
  type Blueprint,
  type BlueprintInput,
  type Connection,
  type Entity,
  type ObjectRef,
  type Screen,
} from "./schema";

/** Parse (apply defaults) and recompute the estimate. Throws on invalid input. */
export function hydrate(input: BlueprintInput | Blueprint): Blueprint {
  const bp = BlueprintSchema.parse(input);
  bp.estimate = estimate(bp);
  return bp;
}

export function cloneBlueprint(bp: Blueprint): Blueprint {
  return structuredClone(bp);
}

export function allBlocks(screen: Screen): Block[] {
  return [...screen.regions.main, ...(screen.regions.side ?? [])];
}

export function findBlock(bp: Blueprint, blockId: string): { screen: Screen; block: Block } | null {
  for (const screen of bp.screens) {
    const block = allBlocks(screen).find((b) => b.id === blockId);
    if (block) return { screen, block };
  }
  return null;
}

export type ResolvedObject =
  | { type: "screen"; value: Screen }
  | { type: "block"; value: Block; screen: Screen }
  | { type: "agent"; value: Agent }
  | { type: "entity"; value: Entity }
  | { type: "connection"; value: Connection }
  | { type: "brief"; value: Blueprint["meta"] };

export function resolveRef(bp: Blueprint, ref: ObjectRef | null): ResolvedObject | null {
  if (!ref) return null;
  switch (ref.type) {
    case "screen": {
      const v = bp.screens.find((s) => s.id === ref.id);
      return v ? { type: "screen", value: v } : null;
    }
    case "block": {
      const f = findBlock(bp, ref.id);
      return f ? { type: "block", value: f.block, screen: f.screen } : null;
    }
    case "agent": {
      const v = bp.agents.find((a) => a.id === ref.id);
      return v ? { type: "agent", value: v } : null;
    }
    case "entity": {
      const v = bp.entities.find((e) => e.id === ref.id);
      return v ? { type: "entity", value: v } : null;
    }
    case "connection": {
      const v = bp.connections.find((c) => c.id === ref.id);
      return v ? { type: "connection", value: v } : null;
    }
    case "brief":
      return { type: "brief", value: bp.meta };
    default:
      return null;
  }
}

export const BLOCK_LABELS: Record<Block["type"], string> = {
  kpis: "Key numbers",
  table: "Table",
  list: "List",
  detail: "Record view",
  form: "Form",
  chat: "Agent chat",
  timeline: "Timeline",
  text: "Note",
  actions: "Buttons",
};

export function blockTitle(b: Block): string {
  if ("title" in b && b.title) return b.title;
  return BLOCK_LABELS[b.type];
}

export function objectLabel(bp: Blueprint, ref: ObjectRef | null): string {
  const r = resolveRef(bp, ref);
  if (!r) return ref ? ref.id : "Project";
  switch (r.type) {
    case "screen":
      return r.value.title;
    case "block":
      return `${r.screen.title} › ${blockTitle(r.value)}`;
    case "agent":
      return r.value.name;
    case "entity":
      return r.value.plural;
    case "connection":
      return r.value.name;
    case "brief":
      return r.value.name;
  }
}

/** Screens / agents / entities / connections each object touches: used for canvas connectors and blast radius. */
export function relations(bp: Blueprint) {
  const screenAgents = new Map<string, Set<string>>();
  const screenEntities = new Map<string, Set<string>>();
  for (const s of bp.screens) {
    const agents = new Set<string>();
    const ents = new Set<string>();
    for (const b of allBlocks(s)) {
      if (b.type === "chat") agents.add(b.agentId);
      if ("entityId" in b && b.entityId) ents.add(b.entityId);
      const actions =
        b.type === "detail" ? b.actions.map((x) => x.action) : b.type === "actions" ? b.buttons.map((x) => x.action) : [];
      for (const a of actions) if (a.kind === "agent") agents.add(a.agentId);
    }
    screenAgents.set(s.id, agents);
    screenEntities.set(s.id, ents);
  }
  const agentConnections = new Map<string, Set<string>>();
  const agentEntities = new Map<string, Set<string>>();
  const dbConnections = new Set(bp.connections.filter((c) => c.kind === "database").map((c) => c.id));
  for (const a of bp.agents) {
    agentConnections.set(a.id, new Set(a.tools.map((t) => t.connectionId)));
    const ents = new Set<string>(a.knowledge.filter((k) => k.source === "entity").map((k) => k.ref));
    // agents that use the project database touch the entities their screens show
    if (a.tools.some((t) => dbConnections.has(t.connectionId))) {
      for (const s of bp.screens) {
        if (screenAgents.get(s.id)?.has(a.id)) screenEntities.get(s.id)?.forEach((e) => ents.add(e));
      }
    }
    agentEntities.set(a.id, ents);
  }
  return { screenAgents, screenEntities, agentConnections, agentEntities };
}

export { estimate };
