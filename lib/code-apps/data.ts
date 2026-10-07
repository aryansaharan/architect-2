import "server-only";
import type { SessionUser } from "@/lib/auth";
import { isTeam, roleFor, type AppRole, type LiveSite } from "@/lib/apps/access";
import { createRecord, updateRecord, type Value } from "@/lib/apps/records";
import { visitorKey, withinLimit } from "@/lib/security/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { ManifestSchema, type Collection } from "./schema";

/**
 * A published code app's records (prod.data), with every rule decided here on the server. The rules
 * come from the PUBLISHED manifest's collections, never from the browser: a visitor may read a
 * collection whose `read` is "public" and add to one whose `write` is "public"; the team (the owner and
 * the people they invited) may do everything, including changing and removing records. Records are
 * app_records rows (entity_id = the collection's name) under the app's 2,000-record cap, with plain
 * JSON values (text, numbers, true or false, lists and plain objects), at most 4 KB each.
 */

export type DataOp = "list" | "add" | "update" | "remove";
export type CodeRecord = Record<string, unknown> & { id: string; createdAt: string };
export type DataResult = { ok: true; result: unknown } | { ok: false; status: number; error: string };

export const RECORD_LIMITS = { bytes: 4_000, keyChars: 40, keys: 60, depth: 4, listItems: 200, listMax: 200, listDefault: 50 } as const;
/** Visitors add by network, per app; the team writes per person; visitors' reads are capped too, so a list can't be scraped in a loop. */
const LIMITS = { visitorWrites: { max: 30, windowSeconds: 3600 }, teamWrites: { max: 300, windowSeconds: 3600 }, visitorReads: { max: 600, windowSeconds: 600 } } as const;

const NAME = /^[a-z][a-z0-9_]{0,39}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Keys the record itself owns, or that could reach an object's prototype. */
const RESERVED = new Set(["id", "createdAt", "__proto__", "constructor", "prototype"]);

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function cleanValue(v: unknown, depth: number): Json | undefined {
  if (v === null || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (depth >= RECORD_LIMITS.depth) throw new Error(`A record can nest at most ${RECORD_LIMITS.depth} levels deep.`);
  if (Array.isArray(v)) {
    if (v.length > RECORD_LIMITS.listItems) throw new Error(`A list in a record can hold at most ${RECORD_LIMITS.listItems} items.`);
    return v.map((x) => cleanValue(x, depth + 1) ?? null);
  }
  if (isPlain(v)) return cleanObject(v, depth + 1, false);
  throw new Error("A record can hold text, numbers, true or false, lists and plain objects only.");
}

function cleanObject(v: Record<string, unknown>, depth: number, top: boolean): { [k: string]: Json } {
  const entries = Object.entries(v);
  if (entries.length > RECORD_LIMITS.keys) throw new Error(`A record can have at most ${RECORD_LIMITS.keys} fields.`);
  const out: { [k: string]: Json } = {};
  for (const [k, x] of entries) {
    if (!k || (top && RESERVED.has(k)) || k === "__proto__") continue;
    if (k.length > RECORD_LIMITS.keyChars) throw new Error(`A field name can be at most ${RECORD_LIMITS.keyChars} characters ("${k.slice(0, 20)}...").`);
    const c = cleanValue(x, depth);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

/** A record's fields from the browser, cleaned: plain JSON only, short keys, at most 4 KB. */
export function cleanRecordValues(raw: unknown): { ok: true; values: { [k: string]: Json } } | { ok: false; error: string } {
  if (!isPlain(raw)) return { ok: false, error: 'Records are plain objects, like { name: "Ana", points: 42 }.' };
  try {
    const values = cleanObject(raw, 0, true);
    const bytes = Buffer.byteLength(JSON.stringify(values));
    if (bytes > RECORD_LIMITS.bytes) return { ok: false, error: `That record is ${Math.ceil(bytes / 100) / 10} KB; a record can be at most 4 KB.` };
    return { ok: true, values };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "That record can't be saved." };
  }
}

/** The published app's collections (its manifest, checked again, as the site was published). */
export function publishedCollections(site: LiveSite): Collection[] {
  const parsed = ManifestSchema.safeParse(site.build?.manifest);
  return parsed.success ? parsed.data.collections : [];
}

/** May this person do this to that collection? */
export function mayUse(op: DataOp, c: Collection, role: AppRole): boolean {
  if (isTeam(role)) return true;
  if (op === "list") return c.read === "public";
  if (op === "add") return c.write === "public";
  return false;
}

const refusal = (op: DataOp, c: Collection): string => {
  const label = c.label.trim() || c.name;
  if (op === "list") return `Only the app's team can read ${label}.`;
  if (op === "add") return `Only the app's team can add to ${label}.`;
  return `Only the app's team can ${op === "update" ? "change" : "remove"} records in ${label}.`;
};

type Row = { id: string; data: Record<string, unknown>; created_at: string };
const toRecord = (r: Row): CodeRecord => ({ ...(isPlain(r.data) ? r.data : {}), id: r.id, createdAt: r.created_at });

/** A data request after its body is read: { op, collection, limit?, id?, values? } from the host page. */
export type DataRequest = { op: DataOp; collection: unknown; limit?: unknown; id?: unknown; values?: unknown };

/**
 * One prod.data call on a published code app, start to finish: the collection is in the published manifest,
 * this person may do this to it, they're within their rate, the values are clean, and the record is in that
 * collection of this app.
 */
export async function runDataRequest(site: LiveSite, user: SessionUser | null, req: DataRequest): Promise<DataResult> {
  if (typeof req.collection !== "string" || !NAME.test(req.collection)) return { ok: false, status: 400, error: 'A collection name is lowercase letters, digits and _, like "scores".' };
  const collections = publishedCollections(site);
  const c = collections.find((x) => x.name === req.collection);
  if (!c) return { ok: false, status: 404, error: `This app has no collection called "${req.collection}". It keeps: ${collections.map((x) => x.name).join(", ") || "nothing"}.` };
  const role = await roleFor(site, user);
  if (!mayUse(req.op, c, role)) return { ok: false, status: 403, error: refusal(req.op, c) };
  const team = isTeam(role) && user;
  const admin = adminClient();

  if (req.op === "list") {
    if (!team && !(await withinLimit(`${await visitorKey()}:code-read:${site.projectId}`, LIMITS.visitorReads.max, LIMITS.visitorReads.windowSeconds))) return { ok: false, status: 429, error: "That's a lot of reading in a few minutes. Try again soon." };
    const n = typeof req.limit === "number" && Number.isFinite(req.limit) ? Math.floor(req.limit) : RECORD_LIMITS.listDefault;
    const limit = Math.max(1, Math.min(RECORD_LIMITS.listMax, n));
    const { data, error } = await admin.from("app_records").select("id, data, created_at").eq("project_id", site.projectId).eq("entity_id", c.name).order("created_at", { ascending: false }).limit(limit);
    if (error) {
      console.error("[code-apps] list failed", error.message);
      return { ok: false, status: 500, error: "Couldn't read that. Try again." };
    }
    return { ok: true, result: ((data ?? []) as Row[]).map(toRecord) };
  }

  // Every write counts against the writer's rate: a visitor's network for this app, or a teammate's account.
  const key = team ? `user:${team.id}:code-write` : `${await visitorKey()}:code-write:${site.projectId}`;
  const lim = team ? LIMITS.teamWrites : LIMITS.visitorWrites;
  if (!(await withinLimit(key, lim.max, lim.windowSeconds))) return { ok: false, status: 429, error: "That's a lot of changes in a short time. Try again later." };
  const actor = team ? { kind: (role === "owner" ? "owner" : "member") as "owner" | "member", id: team.id } : { kind: "visitor" as const, id: null };

  if (req.op === "add") {
    const clean = cleanRecordValues(req.values);
    if (!clean.ok) return { ok: false, status: 400, error: clean.error };
    if (!Object.keys(clean.values).length) return { ok: false, status: 400, error: "That record is empty." };
    const r = await createRecord(site.projectId, c.name, clean.values as Record<string, Value>, actor, team ? "team" : "form");
    if (!r.ok) return { ok: false, status: 400, error: r.error };
    const record: CodeRecord = { ...(r.record.data as Record<string, unknown>), id: r.record.id, createdAt: r.record.createdAt };
    // Someone who can't read the collection learns only that their record was saved.
    return { ok: true, result: mayUse("list", c, role) ? record : { id: record.id, createdAt: record.createdAt } };
  }

  // Changing and removing are the team's (checked above); the record must be in this collection of this app.
  if (typeof req.id !== "string" || !UUID.test(req.id)) return { ok: false, status: 400, error: "That needs the record's id." };
  const { data: current } = await admin.from("app_records").select("id, data, created_at").eq("project_id", site.projectId).eq("entity_id", c.name).eq("id", req.id).maybeSingle();
  if (!current) return { ok: false, status: 404, error: "That record is gone." };

  if (req.op === "update") {
    const clean = cleanRecordValues(req.values);
    if (!clean.ok) return { ok: false, status: 400, error: clean.error };
    if (!Object.keys(clean.values).length) return { ok: false, status: 400, error: "Nothing to change." };
    // null clears a field; the whole record still has to fit in 4 KB.
    const merged: Record<string, unknown> = { ...((current as Row).data ?? {}) };
    for (const [k, v] of Object.entries(clean.values)) {
      if (v === null) delete merged[k];
      else merged[k] = v;
    }
    if (Buffer.byteLength(JSON.stringify(merged)) > RECORD_LIMITS.bytes) return { ok: false, status: 400, error: "With that change the record would be over 4 KB." };
    const r = await updateRecord(site.projectId, req.id, clean.values as Record<string, Value | null>, actor);
    if (!r.ok) return { ok: false, status: 400, error: r.error };
    return { ok: true, result: { ...(r.record.data as Record<string, unknown>), id: r.record.id, createdAt: r.record.createdAt } };
  }

  // remove: the change log keeps what it was, so the team can see who removed what.
  await admin.from("app_record_changes").insert({ project_id: site.projectId, record_id: req.id, entity_id: c.name, before: (current as Row).data, after: null, actor: actor.kind, actor_id: actor.id });
  const { error } = await admin.from("app_records").delete().eq("project_id", site.projectId).eq("entity_id", c.name).eq("id", req.id);
  if (error) {
    console.error("[code-apps] remove failed", error.message);
    return { ok: false, status: 500, error: "Couldn't remove that. Try again." };
  }
  return { ok: true, result: { ok: true, id: req.id } };
}
