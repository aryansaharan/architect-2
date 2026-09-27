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
  // Restoring a restore shouldn't nest: "Restored #6 · Build complete", never "Restored “Restored “…””".
  let base = cp.label;
  for (let i = 0; i < 5 && /^Restored /.test(base); i++) base = base.replace(/^Restored (?:#\d+ · |“)/, "").replace(/”$/, "");
  const next = await addCheckpoint(supa, projectId, {
    label: `Restored #${cp.seq} · ${base}`.slice(0, 60),
    kind: "restore",
    blueprint: cp.blueprint,
    summary: `Went back to save point #${cp.seq}. Nothing was lost. The previous state is still a save point.`,
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

