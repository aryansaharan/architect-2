import type { Action, Block, Blueprint } from "./schema";

/**
 * Referential-integrity checks the zod schema can't express:
 * every id a block, tool or action points to must exist, and every
 * field a block displays must exist on its entity.
 */
export function integrityErrors(bp: Blueprint): string[] {
  const errors: string[] = [];
  const screenIds = new Set(bp.screens.map((s) => s.id));
  const agentIds = new Set(bp.agents.map((a) => a.id));
  const connectionIds = new Set(bp.connections.map((c) => c.id));
  const entities = new Map(bp.entities.map((e) => [e.id, e]));

  const dup = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`duplicate ${label} id "${id}"`);
      seen.add(id);
    }
  };
  dup("screen", bp.screens.map((s) => s.id));
  dup("agent", bp.agents.map((a) => a.id));
  dup("entity", bp.entities.map((e) => e.id));
  dup("connection", bp.connections.map((c) => c.id));
  dup(
    "block",
    bp.screens.flatMap((s) => [...s.regions.main, ...s.regions.side].map((b) => b.id)),
  );

  const checkAction = (where: string, a: Action | undefined) => {
    if (!a) return;
    if (a.kind === "navigate" && !screenIds.has(a.screenId)) errors.push(`${where}: unknown screen "${a.screenId}"`);
    if (a.kind === "agent" && !agentIds.has(a.agentId)) errors.push(`${where}: unknown agent "${a.agentId}"`);
    if (a.kind === "openDetail" && !entities.has(a.entityId)) errors.push(`${where}: unknown entity "${a.entityId}"`);
  };
  const fieldsOf = (entityId: string) => new Set(entities.get(entityId)?.fields.map((f) => f.name) ?? []);
  const checkFields = (where: string, entityId: string, names: (string | undefined)[]) => {
    if (!entities.has(entityId)) {
      errors.push(`${where}: unknown entity "${entityId}"`);
      return;
    }
    const f = fieldsOf(entityId);
    for (const n of names) if (n && !f.has(n)) errors.push(`${where}: entity "${entityId}" has no field "${n}"`);
  };

  const checkBlock = (screenId: string, b: Block) => {
    const where = `screen "${screenId}" block "${b.id}"`;
    switch (b.type) {
      case "table":
        checkFields(where, b.entityId, [...b.columns, ...b.filters]);
        checkAction(where, b.rowAction);
        break;
      case "list":
        checkFields(where, b.entityId, [b.titleField, b.subtitleField, b.badgeField]);
        checkAction(where, b.onSelect);
        break;
      case "detail":
        checkFields(where, b.entityId, b.fields);
        b.actions.forEach((btn) => checkAction(where, btn.action));
        break;
      case "form":
        if (b.entityId && !entities.has(b.entityId)) errors.push(`${where}: unknown entity "${b.entityId}"`);
        checkAction(where, b.onSubmit);
        break;
      case "chat":
        if (!agentIds.has(b.agentId)) errors.push(`${where}: unknown agent "${b.agentId}"`);
        break;
      case "actions":
        b.buttons.forEach((btn) => checkAction(where, btn.action));
        break;
    }
  };
  for (const s of bp.screens) for (const b of [...s.regions.main, ...s.regions.side]) checkBlock(s.id, b);

  for (const a of bp.agents) {
    const toolIds = new Set<string>();
    for (const t of a.tools) {
      if (toolIds.has(t.id)) errors.push(`agent "${a.id}": duplicate tool "${t.id}"`);
      toolIds.add(t.id);
      if (!connectionIds.has(t.connectionId)) errors.push(`agent "${a.id}" tool "${t.id}": unknown connection "${t.connectionId}"`);
    }
    for (const k of a.knowledge) if (k.source === "entity" && !entities.has(k.ref)) errors.push(`agent "${a.id}": knowledge refers to unknown entity "${k.ref}"`);
  }

  for (const e of bp.entities) {
    const f = fieldsOf(e.id);
    e.sample.forEach((row, i) => {
      for (const key of Object.keys(row)) if (!f.has(key)) errors.push(`entity "${e.id}" sample[${i}]: unknown field "${key}"`);
    });
    for (const fld of e.fields) if (fld.type === "ref" && fld.ref && !entities.has(fld.ref)) errors.push(`entity "${e.id}" field "${fld.name}": unknown ref "${fld.ref}"`);
  }
  return errors;
}
