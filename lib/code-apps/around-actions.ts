"use server";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CodeFile } from "./schema";

/**
 * What the studio's surroundings (Code tab, Publish) read about a code app beyond the project page's own
 * data: older versions' files, for the diff between two of them. Read through the person's own session, so row-level
 * security decides whose project it is; nothing here writes, and no bundle ever leaves the server here.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CodeVersionFiles = { id: string; seq: number; files: CodeFile[] | null };

async function session() {
  if (!(await getSessionUser())) return null;
  return createClient();
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Files as stored, kept only when each has a string path and content (the schema is enforced when they're written). */
function cleanFiles(v: unknown): CodeFile[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((f): f is CodeFile => isRecord(f) && typeof f.path === "string" && typeof f.content === "string").map((f) => ({ path: f.path, content: f.content }));
}

/** Two versions' files, for the diff between them (at most two at a time, only this project's). */
export async function codeVersionFiles(projectId: string, ids: string[]): Promise<CodeVersionFiles[]> {
  if (typeof projectId !== "string" || !UUID.test(projectId) || !Array.isArray(ids)) return [];
  const want = [...new Set(ids.filter((id) => typeof id === "string" && UUID.test(id)))].slice(0, 2);
  if (!want.length) return [];
  const supa = await session();
  if (!supa) return [];
  const { data, error } = await supa.from("checkpoints").select("id, seq, files:code->files").eq("project_id", projectId).in("id", want);
  if (error) console.error("[code-apps] version files read failed", error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), seq: Number(r.seq), files: cleanFiles(r.files) }));
}
