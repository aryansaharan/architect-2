"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { getProject } from "@/lib/db/queries";
import { updateProject } from "@/lib/db/writes";

type R = { ok: true; name?: string } | { ok: false; error: string };

/** The longest name a project may have. */
const MAX_NAME = 120;

/** Renames one of your own projects (row-level security: owners only). Its published app keeps its name until it's published again. */
export async function renameProject(projectId: string, name: string): Promise<R> {
  await requireUser();
  const clean = String(name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return { ok: false, error: "A project needs a name." };
  if (clean.length > MAX_NAME) return { ok: false, error: `Keep it under ${MAX_NAME} characters.` };
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  if (project.name === clean) return { ok: true, name: clean };
  try {
    await updateProject(supa, projectId, { name: clean });
  } catch (e) {
    console.error("[projects] rename failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't rename it. Try again." };
  }
  revalidatePath("/home");
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true, name: clean };
}

/**
 * Deletes one of your own projects and everything in it: its versions, notes, published app and the
 * records people added there. The ownership check runs through the person's own session (row-level
 * security); only then does the server's trusted connection do the two things people can't do themselves.
 */
export async function deleteProject(projectId: string): Promise<R> {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  if (hasAdmin()) {
    const admin = adminClient();
    // What it cost stays on the person's meter: the spend is kept, only its link to the project goes.
    const { error: usage } = await admin.from("usage_events").update({ project_id: null }).eq("project_id", projectId);
    if (usage) {
      console.error("[projects] keeping usage failed", usage.message);
      return { ok: false, error: "Couldn't delete it. Try again." };
    }
    // A published app taken down after a report stays down, its link included: its project can't be deleted to free the link.
    const { data: blocked } = await admin.from("live_sites").select("slug").eq("project_id", projectId).not("blocked_at", "is", null).maybeSingle();
    if (blocked) return { ok: false, error: "Its published app was taken down after a report, so this project can't be deleted." };
    // The published app goes offline first (published sites are written by the server only).
    const { error: live } = await admin.from("live_sites").delete().eq("project_id", projectId).is("blocked_at", null);
    if (live) {
      console.error("[projects] taking the app offline failed", live.message);
      return { ok: false, error: "Couldn't take its published app offline, so nothing was deleted. Try again." };
    }
  }
  // Versions, notes, records, members and the rest go with it (on delete cascade).
  const { data, error } = await supa.from("projects").delete().eq("id", projectId).select("id");
  if (error || !data?.length) {
    console.error("[projects] delete failed", error?.message ?? "no row deleted");
    return { ok: false, error: "Couldn't delete it. Try again." };
  }
  revalidatePath("/home");
  revalidatePath("/settings");
  return { ok: true };
}
