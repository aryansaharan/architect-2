import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import type { Blueprint, Block, Entity } from "@/lib/blueprint/schema";

/**
 * A published app's records. People who use an app are usually not its owner, so every read and
 * write here goes through the admin connection; callers check who is asking first (lib/apps/access.ts).
 * Values are always cleaned against the app's own fields: nothing arrives in the database untyped.
 */
export type Value = string | number | boolean;
export type AppRecord = { id: string; entityId: string; data: Record<string, Value>; isSample: boolean; createdAt: string; updatedAt: string };
export type Actor = { kind: "member" | "helper" | "visitor" | "owner"; id: string | null; runId?: string | null };

type FieldSpec = { name: string; type: Entity["fields"][number]["type"]; options?: string[] };
type FormField = Extract<Block, { type: "form" }>["fields"][number];

const LIMIT = { string: 500, text: 4000, date: 40 } as const;

/** The fields a record of this type can hold: the entity's own, plus any a form collects that the entity doesn't name. */
export function fieldSpecs(entity: Entity, form?: FormField[]): FieldSpec[] {
  const specs: FieldSpec[] = entity.fields.map((f) => ({ name: f.name, type: f.type, options: f.options }));
  const known = new Set(specs.map((s) => s.name));
  for (const f of form ?? []) {
    if (known.has(f.name) || f.kind === "file") continue;
    const type: FieldSpec["type"] = f.kind === "textarea" ? "text" : f.kind === "number" ? "number" : f.kind === "date" ? "date" : f.kind === "select" ? "enum" : f.kind === "toggle" ? "boolean" : "string";
    specs.push({ name: f.name, type, options: f.options });
  }
  return specs;
}

function clean(spec: FieldSpec, raw: unknown): Value | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  switch (spec.type) {
    case "number":
    case "money": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[$,\s]/g, ""));
      if (!Number.isFinite(n) || Math.abs(n) > 1e12) return undefined;
      return spec.type === "money" ? Math.round(n * 100) / 100 : n;
    }
    case "boolean":
      return raw === true || raw === "true" || raw === "on" || raw === 1 || raw === "1";
    case "date": {
      const s = String(raw).trim().slice(0, LIMIT.date);
      return Number.isNaN(Date.parse(s)) ? undefined : s;
    }
    case "enum": {
      const s = String(raw).trim();
      if (!spec.options?.length) return s.slice(0, LIMIT.string);
      return spec.options.find((o) => o.toLowerCase() === s.toLowerCase());
    }
    case "text":
      return String(raw).trim().slice(0, LIMIT.text);
    default:
      return String(raw).trim().slice(0, LIMIT.string);
  }
}

/** Keeps only the allowed fields, each cleaned to its type. Unknown keys are dropped, bad values skipped. */
export function cleanValues(specs: FieldSpec[], values: unknown, allowed?: string[]): Record<string, Value> {
  return Object.fromEntries(Object.entries(cleanPatch(specs, values, allowed)).filter((e): e is [string, Value] => e[1] !== null));
}

/** For an edit: like cleanValues, but a field sent empty ("" or null) means "clear it" (null). */
export function cleanPatch(specs: FieldSpec[], values: unknown, allowed?: string[]): Record<string, Value | null> {
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};
  const ok = allowed ? new Set(allowed) : null;
  const out: Record<string, Value | null> = {};
  for (const spec of specs) {
    if (ok && !ok.has(spec.name)) continue;
    if (!(spec.name in values)) continue;
    const raw = (values as Record<string, unknown>)[spec.name];
    if (raw === "" || raw === null) {
      out[spec.name] = null;
      continue;
    }
    const v = clean(spec, raw);
    if (v !== undefined) out[spec.name] = v;
  }
  return out;
}

/** A record's data with a patch applied: null clears a field. */
function applyPatch(data: Record<string, Value>, patch: Record<string, Value | null>): Record<string, Value> {
  const next: Record<string, Value> = { ...data };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  return next;
}

/**
 * What a new record gets that its form didn't ask for, so it reads well in the team's lists:
 * a reference in the style of the plan's own (CLM-20931 -> CLM-48213), a status-like field set to
 * its first option ("New"), and a filed/created/received date of today.
 */
export function withDefaults(entity: Entity, data: Record<string, Value>): Record<string, Value> {
  const out = { ...data };
  const [first] = entity.fields;
  if (first && out[first.name] === undefined && first.type === "string") {
    const example = String(entity.sample[0]?.[first.name] ?? "");
    const m = /^([A-Za-z]+[-_#]?)\d{3,}$/.exec(example);
    if (m) out[first.name] = `${m[1]}${Math.floor(10000 + Math.random() * 90000)}`;
  }
  for (const f of entity.fields) {
    if (out[f.name] !== undefined) continue;
    if (f.type === "enum" && f.options?.length && /status|stage|state/i.test(f.name)) out[f.name] = f.options[0];
    if (f.type === "date" && /filed|created|received|submitted|opened|requested/i.test(f.name)) out[f.name] = new Date().toISOString().slice(0, 10);
  }
  return out;
}

type Row = { id: string; entity_id: string; data: Record<string, Value>; is_sample: boolean; created_at: string; updated_at: string };
const toRecord = (r: Row): AppRecord => ({ id: r.id, entityId: r.entity_id, data: r.data, isSample: r.is_sample, createdAt: r.created_at, updatedAt: r.updated_at });

/** Newest first, per data type. */
export async function listRecords(projectId: string, entityIds: string[], limit = 200): Promise<Record<string, AppRecord[]>> {
  const out: Record<string, AppRecord[]> = Object.fromEntries(entityIds.map((e) => [e, []]));
  if (!entityIds.length) return out;
  const { data, error } = await adminClient()
    .from("app_records")
    .select("id, entity_id, data, is_sample, created_at, updated_at")
    .eq("project_id", projectId)
    .in("entity_id", entityIds)
    .order("created_at", { ascending: false })
    .limit(limit * entityIds.length);
  if (error) {
    console.error("[apps] list failed", error.message);
    return out;
  }
  for (const r of (data ?? []) as Row[]) if (out[r.entity_id] && out[r.entity_id].length < limit) out[r.entity_id].push(toRecord(r));
  return out;
}

export async function getRecord(projectId: string, id: string): Promise<AppRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await adminClient().from("app_records").select("id, entity_id, data, is_sample, created_at, updated_at").eq("project_id", projectId).eq("id", id).maybeSingle();
  return data ? toRecord(data as Row) : null;
}

export type WriteResult = { ok: true; record: AppRecord } | { ok: false; error: string };

export async function createRecord(projectId: string, entityId: string, data: Record<string, Value>, actor: Actor, source: "form" | "team" | "helper"): Promise<WriteResult> {
  if (!Object.keys(data).length) return { ok: false, error: "Nothing to save" };
  const admin = adminClient();
  const { data: row, error } = await admin
    .from("app_records")
    .insert({ project_id: projectId, entity_id: entityId, data, source, created_by: actor.id })
    .select("id, entity_id, data, is_sample, created_at, updated_at")
    .single();
  if (error || !row) {
    if (error?.message.includes("app record cap")) return { ok: false, error: "This app is full (2,000 records). Delete some to add more." };
    console.error("[apps] create failed", error?.message);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
  await admin.from("app_record_changes").insert({ project_id: projectId, record_id: row.id, entity_id: entityId, before: null, after: data, actor: actor.kind, actor_id: actor.id, run_id: actor.runId ?? null });
  return { ok: true, record: toRecord(row as Row) };
}

/** Changes some fields of a record (null clears one) and keeps what they were, so the change can be undone. */
export async function updateRecord(projectId: string, id: string, patch: Record<string, Value | null>, actor: Actor): Promise<WriteResult & { changeId?: string }> {
  const current = await getRecord(projectId, id);
  if (!current) return { ok: false, error: "That record is gone" };
  if (!Object.keys(patch).length) return { ok: false, error: "Nothing to change" };
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, current.data[k] ?? null]));
  const admin = adminClient();
  const { data: row, error } = await admin
    .from("app_records")
    .update({ data: applyPatch(current.data, patch) })
    .eq("project_id", projectId)
    .eq("id", id)
    .select("id, entity_id, data, is_sample, created_at, updated_at")
    .single();
  if (error || !row) {
    console.error("[apps] update failed", error?.message);
    return { ok: false, error: "Couldn't save that change. Try again." };
  }
  const { data: change } = await admin
    .from("app_record_changes")
    .insert({ project_id: projectId, record_id: id, entity_id: current.entityId, before, after: patch, actor: actor.kind, actor_id: actor.id, run_id: actor.runId ?? null })
    .select("id")
    .single();
  return { ok: true, record: toRecord(row as Row), changeId: change?.id as string | undefined };
}

/** Puts a changed record's fields back to what they were before one change. */
export async function undoChange(projectId: string, changeId: string, actor: Actor): Promise<WriteResult> {
  const { data: change } = await adminClient().from("app_record_changes").select("record_id, before").eq("project_id", projectId).eq("id", changeId).maybeSingle();
  if (!change?.record_id || !change.before) return { ok: false, error: "That change can't be undone" };
  // A field that was empty before the change is cleared again (null), the rest get their old values back.
  return updateRecord(projectId, change.record_id as string, change.before as Record<string, Value | null>, actor);
}

/** An app starts with its plan's sample data, marked as such, the first time it's published. */
export async function seedSampleRecords(projectId: string, bp: Blueprint): Promise<number> {
  const admin = adminClient();
  const { count } = await admin.from("app_records").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  if (count) return 0;
  const rows = bp.entities.flatMap((e) =>
    // Oldest sample first, so the plan's first row stays at the top of a newest-first list.
    [...e.sample].reverse().map((s, i) => ({ project_id: projectId, entity_id: e.id, data: s, is_sample: true, source: "sample", created_at: new Date(Date.now() - 60_000 + i).toISOString() })),
  );
  if (!rows.length) return 0;
  const { error } = await admin.from("app_records").insert(rows);
  if (error) {
    console.error("[apps] seeding failed", error.message);
    return 0;
  }
  return rows.length;
}

export async function hasSampleRecords(projectId: string): Promise<boolean> {
  const { count } = await adminClient().from("app_records").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("is_sample", true);
  return Boolean(count);
}

export async function clearSampleRecords(projectId: string): Promise<number> {
  const { data, error } = await adminClient().from("app_records").delete().eq("project_id", projectId).eq("is_sample", true).select("id");
  if (error) console.error("[apps] clearing samples failed", error.message);
  return data?.length ?? 0;
}
