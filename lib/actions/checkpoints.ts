"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCheckpoint, getProject } from "@/lib/db/queries";
import { addCheckpoint, addLedger, updateProject } from "@/lib/db/writes";

export async function restoreCheckpoint(projectId: string, checkpointId: string): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const supa = await createClient();
  const [project, cp] = await Promise.all([getProject(supa, projectId), getCheckpoint(supa, checkpointId)]);
  if (!project || !cp || cp.project_id !== projectId) return { ok: false, error: "Save point not found" };
  const built = cp.blueprint.screens.every((s) => s.status === "built");
  await updateProject(supa, projectId, { blueprint: cp.blueprint, build_state: built ? "built" : project.build_state === "building" ? "draft" : project.build_state });
  const next = await addCheckpoint(supa, projectId, {
    label: `Restored “${cp.label}”`,
    kind: "restore",
    blueprint: cp.blueprint,
    summary: `Went back to save point #${cp.seq}. Nothing was lost — the previous state is still a save point.`,
  });
  await addLedger(supa, projectId, [
    {
      lane: "did",
      kind: "restore",
      title: `Went back to save point #${cp.seq} · ${cp.label}`,
      body: "Restoring is always free. Your previous state is kept as its own save point.",
      credits: 0,
      checkpointId: next.id,
    },
  ]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true };
}

export async function saveCheckpoint(projectId: string, label: string): Promise<{ ok: boolean }> {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false };
  const cp = await addCheckpoint(supa, projectId, { label: label.slice(0, 60) || "Manual save point", kind: "change", blueprint: project.blueprint });
  await addLedger(supa, projectId, [{ lane: "did", kind: "restore", title: `Saved a save point · ${cp.label}`, credits: 0, checkpointId: cp.id }]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true };
}

export async function renameProject(projectId: string, name: string): Promise<{ ok: boolean }> {
  await requireUser();
  const supa = await createClient();
  const clean = name.trim().slice(0, 60);
  if (!clean) return { ok: false };
  await updateProject(supa, projectId, { name: clean });
  revalidatePath(`/p/${projectId}`, "layout");
  revalidatePath("/home");
  return { ok: true };
}
