import { z } from "zod";
import type { Block, Blueprint, Screen } from "@/lib/blueprint/schema";
import type { ChangeOperation } from "@/lib/db/types";
import { applyOperation } from "@/lib/blueprint/pointer";

/**
 * The model decides, code does the rest: instead of hand-writing JSON Pointer
 * paths (easy to get an index wrong), the model returns typed edits. This file
 * resolves names to ids, fills sample data, respects schema limits, and emits
 * the pointer operations a Work Order stores.
 */

const NamedRef = z.string().describe("The id or the visible name. Use \"*\" for all.");

export const EditsSchema = z.object({
  feasible: z.boolean().describe("false only if the request needs custom code or an outside system the blueprint cannot express"),
  summary: z.string().describe("Imperative, under 12 words, e.g. 'Add a party size column to Reservations'"),
  rationale: z.string().describe("One plain-English sentence explaining the change and its effect"),
  addFields: z
    .array(
      z.object({
        entity: NamedRef,
        name: z.string().describe("Field name in words, e.g. 'party size'"),
        type: z.enum(["string", "number", "boolean", "date", "enum", "money", "text"]),
        options: z.array(z.string()).default([]).describe("For enum fields: 2 to 5 options. Otherwise empty."),
        sampleValues: z.array(z.coerce.string()).default([]).describe("Realistic values for the existing sample records, in order. May be empty."),
      }),
    )
    .default([]).describe("New details the app stores. Adding a column for a new detail needs an addFields entry too."),
  addColumns: z
    .array(z.object({ entity: NamedRef, field: z.string().describe("Field name (existing or just added)"), screen: z.string().default("").describe("Screen id or title, or empty for every table of that entity"), first: z.boolean().default(false).describe("true to show it first (e.g. 'sort by')") }))
    .default([]).describe("Show a detail as a table column"),
  removeColumns: z.array(z.object({ entity: NamedRef, field: z.string(), screen: z.string().default("") })).default([]),
  permissions: z
    .array(
      z.object({
        agent: NamedRef,
        tool: z.string().describe("Tool id or name, \"*\" for all its tools, or \"irreversible\" / \"write\" to select by risk"),
        permission: z.enum(["auto", "log", "ask"]).describe("auto = just do it, log = do it and tell me, ask = ask a person first"),
      }),
    )
    .default([]).describe("Who may do what without asking"),
  supervision: z.array(z.object({ agent: NamedRef, level: z.enum(["autonomous", "spot_check", "approve_all"]) })).default([]),
  rules: z.array(z.object({ agent: NamedRef, rule: z.string().describe("One sentence the agent must follow") })).default([]),
  rehearsals: z.array(z.object({ agent: NamedRef, name: z.string(), input: z.string(), expect: z.string() })).default([]).describe("New test conversations"),
  renames: z.array(z.object({ type: z.enum(["project", "screen", "agent", "entity", "connection"]), target: z.string().default("").describe("id or current name; empty for project"), name: z.string() })).default([]),
  theme: z
    .object({ primary: z.string().default("").describe("Hex colour like #0F766E, or empty to keep"), radius: z.enum(["keep", "sm", "md", "lg"]).default("keep"), density: z.enum(["keep", "compact", "comfortable"]).default("keep") })
    .default({ primary: "", radius: "keep", density: "keep" })
    .describe("Only include when changing the look"),
  newScreens: z
    .array(
      z.object({
        title: z.string().describe("2 to 3 words"),
        purpose: z.string().describe("One sentence"),
        description: z.string().describe("Two plain sentences for a non-technical reader"),
        kind: z.enum(["queue", "dashboard", "detail", "form", "assistant", "report"]),
        entity: z.string().describe("Main data type shown (entity id or name)"),
        agent: z.string().default("").describe("Agent available on this screen (id or name), or empty"),
        audience: z.enum(["team", "customer", "admin"]).default("team"),
        metrics: z.array(z.object({ label: z.string(), value: z.coerce.string() })).default([]).describe("2 to 4 headline numbers for queue/dashboard/report; otherwise empty"),
      }),
    )
    .default([]).describe("New screens. The app has at most 8."),
  patches: z
    .array(z.object({ op: z.enum(["set", "add", "remove"]), path: z.string(), valueJson: z.string().default("null") }))
    .default([]).describe("Escape hatch for anything the typed edits cannot express: RFC 6901 JSON Pointer operations. Prefer typed edits."),
});
export type Edits = z.output<typeof EditsSchema>;

const snake = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32);
const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const title = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function find<T extends { id: string }>(items: T[], ref: string, names: (t: T) => string[]): T | undefined {
  const r = norm(ref);
  if (!r) return undefined;
  return (
    items.find((x) => x.id === ref) ??
    items.find((x) => names(x).some((n) => norm(n) === r)) ??
    items.find((x) => names(x).some((n) => norm(n).includes(r) || r.includes(norm(n))))
  );
}
const many = <T extends { id: string }>(items: T[], ref: string, names: (t: T) => string[]): T[] => (ref.trim() === "*" ? items : [find(items, ref, names)].filter(Boolean) as T[]);

function sampleFor(type: string, i: number, options: string[], values: string[]): string | number | boolean {
  if (values.length) {
    const v = values[i % values.length];
    if (type === "number" || type === "money") return Number(v.replace(/[^0-9.-]/g, "")) || 0;
    if (type === "boolean") return /^(y|yes|true|1)/i.test(v);
    return v;
  }
  if (type === "enum") return options.length ? options[i % options.length] : ["Low", "Medium", "High"][i % 3];
  if (type === "number") return [2, 4, 6, 3, 8, 5][i % 6];
  if (type === "money") return [120, 480, 75, 1250, 300, 60][i % 6];
  if (type === "boolean") return i % 3 !== 0;
  if (type === "date") return `2026-09-${String(20 + (i % 9)).padStart(2, "0")}`;
  return ["Low", "Medium", "High"][i % 3];
}

const ICONS: Record<string, string> = { queue: "inbox", dashboard: "layout-dashboard", detail: "file-text", form: "file-plus", assistant: "message-square", report: "bar-chart-3" };

function buildScreen(bp: Blueprint, s: Edits["newScreens"][number]): Screen {
  const used = new Set(bp.screens.map((x) => x.id));
  let id = kebab(s.title) || "screen";
  while (used.has(id)) id += "-2";
  const blockIds = new Set(bp.screens.flatMap((x) => [...x.regions.main, ...x.regions.side].map((b) => b.id)));
  const bid = (k: string) => {
    let b = `${id}-${k}`;
    while (blockIds.has(b)) b += "-2";
    blockIds.add(b);
    return b;
  };
  const entity = find(bp.entities, s.entity, (e) => [e.name, e.plural]) ?? bp.entities[0];
  const agent = s.agent ? find(bp.agents, s.agent, (a) => [a.name, a.role]) : undefined;
  const titleField = entity.fields[0].name;
  const subtitleField = entity.fields.find((f, k) => k > 0 && (f.type === "string" || f.type === "enum"))?.name;
  const kpis: Block = {
    type: "kpis",
    id: bid("kpis"),
    items: (s.metrics.length ? s.metrics.slice(0, 4) : [{ label: entity.plural, value: String(entity.sample.length * 7 + 3) }]).map((m) => ({ label: m.label, value: m.value, tone: "neutral" as const })),
  };
  const table: Block = { type: "table", id: bid("table"), title: entity.plural, entityId: entity.id, columns: entity.fields.filter((f) => f.type !== "text").slice(0, 6).map((f) => f.name), filters: entity.fields.filter((f) => f.type === "enum").slice(0, 2).map((f) => f.name), pageSize: 8 };
  if (table.type === "table" && !table.columns.length) table.columns = [titleField];
  const chat: Block | null = agent ? { type: "chat", id: bid("chat"), agentId: agent.id, title: `Ask ${agent.name}`, placeholder: `Ask ${agent.name}…`, starters: agent.rehearsals.slice(0, 2).map((r) => r.input.slice(0, 80)) } : null;
  let main: Block[] = [];
  let side: Block[] = [];
  let layout: Screen["layout"] = "dashboard";
  if (s.kind === "queue" || s.kind === "report") {
    main = [kpis, table];
    side = chat ? [chat] : [];
  } else if (s.kind === "dashboard") {
    main = [kpis, { type: "list", id: bid("list"), title: entity.plural, entityId: entity.id, titleField, ...(subtitleField ? { subtitleField } : {}) }];
    side = chat ? [chat] : [{ type: "text", id: bid("note"), title: "About this screen", markdown: s.description }];
  } else if (s.kind === "detail") {
    main = [{ type: "detail", id: bid("detail"), title: entity.name, entityId: entity.id, fields: entity.fields.slice(0, 9).map((f) => f.name), actions: [] }];
    side = chat ? [chat] : [];
    layout = "split";
  } else if (s.kind === "form") {
    main = [
      {
        type: "form",
        id: bid("form"),
        title: s.purpose.slice(0, 60) || `New ${entity.name.toLowerCase()}`,
        entityId: entity.id,
        fields: entity.fields.slice(0, 7).map((f) => ({ name: f.name, label: f.label ?? title(f.name), kind: f.type === "enum" ? ("select" as const) : f.type === "text" ? ("textarea" as const) : f.type === "date" ? ("date" as const) : f.type === "number" || f.type === "money" ? ("number" as const) : f.type === "boolean" ? ("toggle" as const) : ("text" as const), ...(f.type === "enum" && f.options ? { options: f.options } : {}), required: false })),
        submitLabel: "Submit",
        onSubmit: { kind: "toast", message: `${entity.name} received.` },
      },
    ];
    side = [{ type: "text", id: bid("help"), title: "What happens next", markdown: s.description }];
    layout = "form";
  } else {
    main = chat ? [chat] : [{ type: "text", id: bid("note"), markdown: s.description }];
    side = [{ type: "list", id: bid("list"), title: entity.plural, entityId: entity.id, titleField, ...(subtitleField ? { subtitleField } : {}) }];
    layout = "split";
  }
  const slugs = new Set(bp.screens.map((x) => x.slug));
  let slug = id;
  while (slugs.has(slug)) slug += "-2";
  return { id, slug, title: s.title, icon: ICONS[s.kind] ?? "layout-dashboard", purpose: s.purpose, plain: s.description, layout, regions: { main, side }, audience: s.audience, status: "planned" };
}

const HEX = /^#[0-9a-f]{6}$/i;

export type Compiled = { ops: ChangeOperation[]; problems: string[] };

/** Turn typed edits into JSON Pointer operations against `bp`. */
export function compileEdits(bp: Blueprint, e: Edits, scopeScreenId?: string): Compiled {
  const next = structuredClone(bp);
  const problems: string[] = [];
  const agentNames = (a: Blueprint["agents"][number]) => [a.name, a.role];
  const entityNames = (x: Blueprint["entities"][number]) => [x.name, x.plural];

  for (const f of e.addFields) {
    const ent = find(next.entities, f.entity, entityNames);
    if (!ent) { problems.push(`addFields: no data type called "${f.entity}"`); continue; }
    const name = snake(f.name);
    if (ent.fields.some((x) => x.name === name)) continue;
    if (ent.fields.length >= 12) { problems.push(`addFields: ${ent.plural} already has 12 details (the maximum)`); continue; }
    ent.fields.push({ name, label: title(f.name), type: f.type, ...(f.type === "enum" ? { options: f.options.length ? f.options.slice(0, 6) : ["Low", "Medium", "High"] } : {}) });
    ent.sample.forEach((row, i) => (row[name] = sampleFor(f.type, i, f.options, f.sampleValues)));
  }

  const tablesFor = (entityId: string, screenRef: string) => {
    const screen = screenRef ? find(next.screens, screenRef, (s) => [s.title]) : scopeScreenId ? next.screens.find((s) => s.id === scopeScreenId) : undefined;
    const screens = screen ? [screen] : next.screens;
    const out = screens.flatMap((s) => s.regions.main.filter((b): b is Extract<Block, { type: "table" }> => b.type === "table" && b.entityId === entityId));
    // A screen with no table of that entity: fall back to every table of it.
    return out.length || !screen ? out : next.screens.flatMap((s) => s.regions.main.filter((b): b is Extract<Block, { type: "table" }> => b.type === "table" && b.entityId === entityId));
  };

  for (const c of e.addColumns) {
    const ent = find(next.entities, c.entity, entityNames);
    if (!ent) { problems.push(`addColumns: no data type called "${c.entity}"`); continue; }
    let field = ent.fields.find((x) => x.name === snake(c.field) || norm(x.label ?? "") === norm(c.field));
    if (!field) {
      if (ent.fields.length >= 12) { problems.push(`addColumns: ${ent.plural} has no "${c.field}" and is full`); continue; }
      field = { name: snake(c.field), label: title(c.field), type: "string" };
      ent.fields.push(field);
      ent.sample.forEach((row, i) => (row[field!.name] = sampleFor("string", i, [], [])));
    }
    const tables = tablesFor(ent.id, c.screen);
    if (!tables.length) { problems.push(`addColumns: no table shows ${ent.plural}; add a screen for it instead`); continue; }
    for (const t of tables) {
      const cols = t.columns.filter((x) => x !== field!.name);
      const withNew = c.first ? [field.name, ...cols] : [...cols, field.name];
      t.columns = withNew.length > 8 ? (c.first ? withNew.slice(0, 8) : [...withNew.slice(0, 7), field.name]) : withNew;
    }
  }

  for (const c of e.removeColumns) {
    const ent = find(next.entities, c.entity, entityNames);
    if (!ent) continue;
    for (const t of tablesFor(ent.id, c.screen)) {
      const cols = t.columns.filter((x) => x !== snake(c.field) && norm(x) !== norm(c.field));
      if (cols.length) t.columns = cols;
    }
  }

  for (const p of e.permissions) {
    const agents = many(next.agents, p.agent, agentNames);
    if (!agents.length) { problems.push(`permissions: no agent called "${p.agent}"`); continue; }
    let hit = 0;
    for (const a of agents) {
      const tools = p.tool === "*" ? a.tools : p.tool === "irreversible" || p.tool === "write" ? a.tools.filter((t) => t.access === p.tool) : [find(a.tools, p.tool, (t) => [t.name, t.id.replace(/_/g, " ")])].filter(Boolean) as typeof a.tools;
      tools.forEach((t) => (t.permission = p.permission));
      hit += tools.length;
    }
    if (!hit && p.agent !== "*") problems.push(`permissions: no tool "${p.tool}" on ${agents.map((a) => a.name).join(", ")}`);
  }

  for (const s of e.supervision) for (const a of many(next.agents, s.agent, agentNames)) a.supervision = s.level;

  for (const r of e.rules) {
    for (const a of many(next.agents, r.agent, agentNames)) {
      if (a.rules.some((x) => norm(x) === norm(r.rule))) continue;
      if (a.rules.length >= 8) a.rules = [...a.rules.slice(0, 7), r.rule];
      else a.rules.push(r.rule);
    }
  }

  for (const r of e.rehearsals) {
    const a = find(next.agents, r.agent, agentNames);
    if (!a) continue;
    let id = kebab(r.name) || "rehearsal";
    while (a.rehearsals.some((x) => x.id === id)) id += "-2";
    const list = [...a.rehearsals, { id, name: r.name, input: r.input, expect: r.expect, history: [] }];
    a.rehearsals = list.slice(-8);
  }

  for (const r of e.renames) {
    const name = r.name.trim();
    if (!name) continue;
    if (r.type === "project") next.meta.name = name;
    else if (r.type === "screen") { const s = find(next.screens, r.target, (x) => [x.title]); if (s) s.title = name; else problems.push(`renames: no screen "${r.target}"`); }
    else if (r.type === "agent") { const a = find(next.agents, r.target, agentNames); if (a) a.name = name; else problems.push(`renames: no agent "${r.target}"`); }
    else if (r.type === "entity") { const x = find(next.entities, r.target, entityNames); if (x) { x.name = name; x.plural = name.endsWith("s") ? name : `${name}s`; } }
    else { const c = find(next.connections, r.target, (x) => [x.name]); if (c) c.name = name; }
  }

  if (e.theme.primary && HEX.test(e.theme.primary.trim())) next.meta.theme.primary = e.theme.primary.trim().toUpperCase();
  else if (e.theme.primary) problems.push(`theme: "${e.theme.primary}" is not a hex colour like #0F766E`);
  if (e.theme.radius !== "keep") next.meta.theme.radius = e.theme.radius;
  if (e.theme.density !== "keep") next.meta.theme.density = e.theme.density;

  for (const s of e.newScreens) {
    if (next.screens.length >= 8) { problems.push("newScreens: the app already has 8 screens (the maximum)"); break; }
    next.screens.push(buildScreen(next, s));
  }

  for (const p of e.patches) {
    let value: unknown = undefined;
    if (p.op !== "remove") {
      try { value = JSON.parse(p.valueJson); } catch { value = p.valueJson; }
    }
    try { applyOperation(next as unknown, { op: p.op, path: p.path, value }); }
    catch (err) { problems.push(`patch ${p.path}: ${err instanceof Error ? err.message : "failed"}`); }
  }

  // Emit element-level operations: index-safe and easy to review.
  const ops: ChangeOperation[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(bp.meta, next.meta)) ops.push({ op: "set", path: "/meta", value: next.meta });
  for (const key of ["screens", "agents", "entities", "connections"] as const) {
    const before = bp[key] as unknown[];
    const after = next[key] as unknown[];
    if (after.length < before.length) { ops.push({ op: "set", path: `/${key}`, value: after }); continue; }
    after.forEach((item, i) => {
      if (i >= before.length) ops.push({ op: "add", path: `/${key}/-`, value: item });
      else if (!same(before[i], item)) ops.push({ op: "set", path: `/${key}/${i}`, value: item });
    });
  }
  return { ops, problems };
}

/** A compact map of the blueprint for the model: names, ids, fields, tables, tools. */
export function blueprintIndex(bp: Blueprint): string {
  const lines: string[] = [`Project: ${bp.meta.name} (theme ${bp.meta.theme.primary}, radius ${bp.meta.theme.radius}, density ${bp.meta.theme.density})`];
  lines.push("Data types:");
  for (const e of bp.entities) lines.push(`- ${e.name} / ${e.plural} (id ${e.id}): ${e.fields.map((f) => `${f.name}:${f.type}`).join(", ")} · ${e.sample.length} sample records`);
  lines.push("Screens:");
  for (const s of bp.screens) {
    const blocks = [...s.regions.main, ...s.regions.side].map((b) => (b.type === "table" ? `table(${bp.entities.find((x) => x.id === b.entityId)?.name}: ${b.columns.join(", ")})` : b.type === "chat" ? `chat(${bp.agents.find((a) => a.id === b.agentId)?.name})` : b.type));
    lines.push(`- ${s.title} (id ${s.id}, ${s.audience}): ${blocks.join(" · ")}`);
  }
  lines.push("Agents:");
  for (const a of bp.agents) {
    lines.push(`- ${a.name} (id ${a.id}), supervision ${a.supervision}, ${a.rules.length} rules, ${a.rehearsals.length} rehearsals`);
    for (const t of a.tools) lines.push(`    tool ${t.name} (id ${t.id}): access ${t.access}, permission ${t.permission}, via ${bp.connections.find((c) => c.id === t.connectionId)?.name}`);
  }
  lines.push(`Connections: ${bp.connections.map((c) => `${c.name} (${c.kind}, ${c.status})`).join("; ")}`);
  return lines.join("\n");
}

const FIELD_TYPES: Record<string, string> = { integer: "number", int: "number", float: "number", decimal: "number", currency: "money", price: "money", amount: "money", bool: "boolean", checkbox: "boolean", datetime: "date", time: "date", select: "enum", choice: "enum", status: "enum", longtext: "text", textarea: "text", str: "string", ref: "string" };
const PERMISSIONS: Record<string, string> = { ask_first: "ask", approve: "ask", approval: "ask", require_approval: "ask", confirm: "ask", manual: "ask", notify: "log", tell: "log", tell_me: "log", logged: "log", auto_approve: "auto", allow: "auto", just_do_it: "auto" };
const KINDS = ["queue", "dashboard", "detail", "form", "assistant", "report"];

/** Repair near-miss model output (nulls, synonyms, stray casing) before validating. */
export function salvageEdits(raw: unknown): Edits | null {
  if (!raw || typeof raw !== "object") return null;
  let o = raw as Record<string, unknown>;
  // Some responses wrap the object once, e.g. { "blueprint_edits": { … } }.
  const keys = Object.keys(o);
  if (keys.length === 1 && o[keys[0]] && typeof o[keys[0]] === "object" && !Array.isArray(o[keys[0]])) o = o[keys[0]] as Record<string, unknown>;
  const clean = (v: unknown): unknown => (v === null ? undefined : Array.isArray(v) ? v.map(clean) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, clean(x)])) : v);
  const x = clean(o) as Record<string, unknown>;
  const arr = (k: string) => (Array.isArray(x[k]) ? (x[k] as Record<string, unknown>[]) : undefined);
  arr("addFields")?.forEach((f) => { const t = String(f.type ?? "string").toLowerCase(); f.type = FIELD_TYPES[t] ?? t; });
  arr("permissions")?.forEach((p) => { const v = String(p.permission ?? "ask").toLowerCase().replace(/\s+/g, "_"); p.permission = PERMISSIONS[v] ?? v; });
  arr("supervision")?.forEach((s) => { const v = String(s.level ?? "spot_check").toLowerCase().replace(/[\s-]+/g, "_"); s.level = v.includes("approve") ? "approve_all" : v.includes("auto") || v.includes("own") ? "autonomous" : v.includes("spot") ? "spot_check" : v; });
  arr("newScreens")?.forEach((s) => { const k = String(s.kind ?? "dashboard").toLowerCase(); s.kind = KINDS.includes(k) ? k : k.includes("list") || k.includes("table") ? "queue" : k.includes("chat") ? "assistant" : "dashboard"; if (s.audience) s.audience = String(s.audience).toLowerCase(); });
  arr("renames")?.forEach((r) => { r.type = String(r.type ?? "project").toLowerCase(); });
  if (x.theme && typeof x.theme === "object") {
    const t = x.theme as Record<string, unknown>;
    if (t.radius && !["keep", "sm", "md", "lg"].includes(String(t.radius))) t.radius = "keep";
    if (t.density && !["keep", "compact", "comfortable"].includes(String(t.density))) t.density = "keep";
  }
  arr("addColumns")?.forEach((c) => { if (typeof c.first !== "boolean") c.first = String(c.first).toLowerCase() === "true"; });
  if (typeof x.feasible !== "boolean") x.feasible = String(x.feasible).toLowerCase() !== "false";
  x.summary ??= "Change the project";
  x.rationale ??= "";
  const parsed = EditsSchema.safeParse(x);
  if (!parsed.success) {
    console.warn("[change] salvage failed:", parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return null;
  }
  return parsed.data;
}
