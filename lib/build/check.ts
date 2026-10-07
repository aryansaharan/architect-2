import { BlueprintSchema, type Blueprint, type Block, type Entity, type ObjectRef } from "@/lib/blueprint/schema";
import { allBlocks } from "@/lib/blueprint";
import { approvalFor } from "@/lib/agents/tools";
import { publicAccess } from "@/lib/apps/view";

/**
 * The checks making an app real runs on the plan itself, before any code: does it hold together (every
 * list, form and button points at something that exists), do the sample records fit their fields, and
 * who can see what once it's published. Pure functions over the plan; lib/build/run.ts streams them.
 */

export type Problem = { message: string; objectRef?: ObjectRef };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Does the plan hold together? Schema first, then every reference between its parts. */
export function checkPlan(bp: Blueprint): Problem[] {
  const problems: Problem[] = [];
  const parsed = BlueprintSchema.safeParse(bp);
  if (!parsed.success)
    for (const issue of parsed.error.issues.slice(0, 5)) problems.push({ message: `${issue.path.join(".") || "plan"}: ${issue.message}` });

  const entities = new Map(bp.entities.map((e) => [e.id, e]));
  const screens = new Set(bp.screens.map((s) => s.id));
  const agents = new Set(bp.agents.map((a) => a.id));
  const connections = new Set(bp.connections.map((c) => c.id));
  const fieldsOf = (id: string) => new Set(entities.get(id)?.fields.map((f) => f.name) ?? []);

  const dupes = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push({ message: `Two ${kind} share the id “${id}”.` });
      seen.add(id);
    }
  };
  dupes("screens", bp.screens.map((s) => s.id));
  dupes("screens", bp.screens.map((s) => s.slug));
  dupes("data types", bp.entities.map((e) => e.id));
  dupes("AI helpers", bp.agents.map((a) => a.id));

  const checkAction = (where: string, ref: ObjectRef, a: { kind: string; screenId?: string; agentId?: string; entityId?: string } | undefined) => {
    if (!a) return;
    if (a.kind === "navigate" && a.screenId && !screens.has(a.screenId)) problems.push({ message: `${where} opens a screen that isn't in the plan.`, objectRef: ref });
    if (a.kind === "agent" && a.agentId && !agents.has(a.agentId)) problems.push({ message: `${where} asks an AI helper that isn't in the plan.`, objectRef: ref });
    if (a.kind === "openDetail" && a.entityId && !entities.has(a.entityId)) problems.push({ message: `${where} opens a kind of record that isn't in the plan.`, objectRef: ref });
  };

  for (const s of bp.screens) {
    const ref: ObjectRef = { type: "screen", id: s.id };
    for (const b of allBlocks(s)) {
      const where = `${s.title}: ${blockName(b)}`;
      const missingFields = (entityId: string, names: (string | undefined)[]) => {
        const have = fieldsOf(entityId);
        const gone = names.filter((n): n is string => Boolean(n) && !have.has(n!));
        if (gone.length) problems.push({ message: `${where} shows ${gone.map((g) => `“${g}”`).join(", ")}, which ${gone.length === 1 ? "isn't a detail" : "aren't details"} of ${entities.get(entityId)?.plural ?? "its records"}.`, objectRef: ref });
      };
      if ((b.type === "table" || b.type === "list" || b.type === "detail") && !entities.has(b.entityId)) {
        problems.push({ message: `${where} lists a kind of record that isn't in the plan.`, objectRef: ref });
        continue;
      }
      if (b.type === "table") missingFields(b.entityId, b.columns);
      if (b.type === "list") missingFields(b.entityId, [b.titleField, b.subtitleField, b.badgeField]);
      if (b.type === "detail") {
        missingFields(b.entityId, b.fields);
        for (const a of b.actions) checkAction(where, ref, a.action);
      }
      if (b.type === "form" && b.entityId && !entities.has(b.entityId)) problems.push({ message: `${where} saves into a kind of record that isn't in the plan.`, objectRef: ref });
      if (b.type === "chat" && !agents.has(b.agentId)) problems.push({ message: `${where} talks to an AI helper that isn't in the plan.`, objectRef: ref });
      if (b.type === "actions") for (const x of b.buttons) checkAction(where, ref, x.action);
      if (b.type === "table") checkAction(where, ref, b.rowAction);
    }
  }
  for (const a of bp.agents)
    for (const t of a.tools)
      if (!connections.has(t.connectionId)) problems.push({ message: `${a.name}'s “${t.name}” uses a connection that isn't in the plan.`, objectRef: { type: "agent", id: a.id } });
  for (const e of bp.entities)
    for (const f of e.fields)
      if (f.type === "ref" && f.ref && !entities.has(f.ref)) problems.push({ message: `${e.plural}' “${f.name}” points at a kind of record that isn't in the plan.`, objectRef: { type: "entity", id: e.id } });
  return problems;
}

function blockName(b: Block): string {
  return "title" in b && b.title ? `“${b.title}”` : `its ${b.type}`;
}

/** Do the sample records fit their fields? Each value is checked against its field's type and options. */
export function checkSamples(e: Entity): { records: number; problems: string[] } {
  const fields = new Map(e.fields.map((f) => [f.name, f]));
  const problems: string[] = [];
  e.sample.forEach((row, i) => {
    for (const [key, value] of Object.entries(row)) {
      const f = fields.get(key);
      if (!f) {
        if (key !== "id") problems.push(`record ${i + 1} has “${key}”, which isn't one of its details`);
        continue;
      }
      const bad =
        ((f.type === "number" || f.type === "money") && typeof value !== "number" && !Number.isFinite(Number(String(value).replace(/[$,\s]/g, "")))) ||
        (f.type === "boolean" && typeof value !== "boolean" && !["true", "false"].includes(String(value))) ||
        (f.type === "date" && Number.isNaN(Date.parse(String(value)))) ||
        (f.type === "enum" && f.options?.length && !f.options.some((o) => o.toLowerCase() === String(value).toLowerCase()));
      if (bad) problems.push(`record ${i + 1}'s ${f.label ?? f.name} is “${String(value).slice(0, 40)}”, which doesn't fit a ${f.type === "enum" ? "choice" : f.type} field`);
    }
  });
  return { records: e.sample.length, problems };
}

/** What each helper is allowed to do on its own, and what waits for a person, as the runtime enforces it. */
export function helperDuty(a: Blueprint["agents"][number]): string {
  const asks = a.tools.filter((t) => approvalFor(t) === "user-approval").length;
  const irreversible = a.tools.filter((t) => t.access === "irreversible").length;
  const parts = [plural(a.tools.length, "tool"), asks ? `${asks} ${asks === 1 ? "asks" : "ask"} a person first` : "none need a person's OK", plural(a.rules.length, "rule")];
  if (irreversible) parts.push(`${irreversible === 1 ? "the one" : `all ${irreversible}`} that can't be undone always wait${irreversible === 1 ? "s" : ""} for a person`);
  return parts.join(" · ");
}

/** Who can see what once it's published: team screens need sign-in, public pages show only what they display. */
export function accessSummary(bp: Blueprint, hidden: string[] = []): string {
  const pub = publicAccess(bp, hidden);
  const team = bp.screens.filter((s) => !pub.screens.includes(s.id)).length;
  const fields = Object.values(pub.read).reduce((n, f) => n + f.length, 0);
  const forms = Object.keys(pub.create).length;
  const parts = [`${plural(team, "team screen")} need${team === 1 ? "s" : ""} sign-in`];
  if (pub.screens.length) parts.push(`${plural(pub.screens.length, "public page")} ${pub.screens.length === 1 ? "shows" : "show"} ${plural(fields, "detail")}${forms ? ` and ${forms === 1 ? "takes" : "take"} new records through ${plural(forms, "form")}` : ""}`);
  else parts.push("no public pages");
  return parts.join(" · ");
}
