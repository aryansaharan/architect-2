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
  if (!project || !cp || cp.project_id !== projectId) return { ok: false, error: "That version is gone" };
  const built = cp.blueprint.screens.every((s) => s.status === "built");
  await updateProject(supa, projectId, { blueprint: cp.blueprint, build_state: built ? "built" : project.build_state === "building" ? "draft" : project.build_state });
  // Older labels said "Restored #6" and "Went live": read them in today's words, "Restored version 6" and "Published".
  const shown = cp.label.replace(/^Restored #(\d+) · /, "Restored version $1 · ").replace(/^Went live$/, "Published");
  // Restoring a restore shouldn't nest: "Restored version 6 · Build complete", never "Restored “Restored “…””".
  let base = shown;
  for (let i = 0; i < 5 && /^Restored /.test(base); i++) base = base.replace(/^Restored (?:(?:version |#)\d+ · |“)/, "").replace(/”$/, "");
  const next = await addCheckpoint(supa, projectId, {
    label: `Restored version ${cp.seq} · ${base}`.slice(0, 60),
    kind: "restore",
    blueprint: cp.blueprint,
    summary: `Went back to version ${cp.seq}. Nothing was lost: where you were is kept as a version too.`,
  });
  await addLedger(supa, projectId, [
    {
      lane: "did",
      kind: "restore",
      title: `Went back to version ${cp.seq} · ${shown}`,
      body: "Going back is always free. Where you were is kept as its own version.",
      credits: 0,
      checkpointId: next.id,
    },
  ]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true };
}

