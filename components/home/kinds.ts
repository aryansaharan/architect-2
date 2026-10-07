import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { HomeProject } from "./project-card";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Each card's kind (business or code) and, for a code app, what it is and whether it builds, read through
 * the person's own session (row-level security) in one small query: only those fields, never the files or
 * the bundle. Cards that already carry all of it are left as they are; if the read fails, they show as before.
 */
export async function withKinds(projects: HomeProject[]): Promise<HomeProject[]> {
  const ids = projects.filter((p) => !p.kind || (p.kind === "code" && !p.code)).map((p) => p.id);
  if (!ids.length) return projects;
  try {
    const supa = await createClient();
    const { data, error } = await supa.from("projects").select("id, kind, tagline:code->manifest->>tagline, what:code->manifest->>kind, built:build->ok").in("id", ids);
    if (error) throw error;
    const byId = new Map(((data ?? []) as Record<string, unknown>[]).filter(isRecord).map((r) => [String(r.id), r]));
    return projects.map((p) => {
      const r = byId.get(p.id);
      if (!r) return p;
      if (r.kind !== "code") return { ...p, kind: "business" };
      const tagline = typeof r.tagline === "string" && r.tagline.trim() ? r.tagline.trim() : p.tagline;
      return { ...p, kind: "code", tagline, code: { what: typeof r.what === "string" ? r.what.trim().slice(0, 60) : "", built: r.built === true } };
    });
  } catch (e) {
    console.error("[home] kinds read failed", e instanceof Error ? e.message : e);
    return projects;
  }
}
