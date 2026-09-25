"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/lib/db/queries";
import { addLedger } from "@/lib/db/writes";
import { findBlock } from "@/lib/blueprint";

export async function addComment(projectId: string, input: { screenId: string; blockId: string | null; x: number; y: number; body: string }) {
  const user = await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false as const, error: "Project not found" };
  const body = input.body.trim().slice(0, 600);
  if (!body) return { ok: false as const, error: "Write a comment first" };
  const { error } = await supa.from("comments").insert({
    project_id: projectId,
    screen_id: input.screenId,
    block_id: input.blockId,
    x: Math.max(0, Math.min(100, input.x)),
    y: Math.max(0, Math.min(100, input.y)),
    body,
    author_id: user.id,
    author_name: user.isAnonymous ? "You (guest)" : user.name,
  });
  if (error) return { ok: false as const, error: error.message };
  const found = input.blockId ? findBlock(project.blueprint, input.blockId) : null;
  const screen = project.blueprint.screens.find((s) => s.id === input.screenId);
  await addLedger(supa, projectId, [
    { lane: "thought", kind: "comment", title: `You commented on ${screen?.title ?? "a screen"}`, body: `“${body}”`, objectRef: found ? { type: "block", id: found.block.id } : { type: "screen", id: input.screenId } },
  ]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true as const };
}

export async function resolveComment(projectId: string, commentId: string) {
  await requireUser();
  const supa = await createClient();
  await supa.from("comments").update({ resolved: true }).eq("id", commentId).eq("project_id", projectId);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true };
}
