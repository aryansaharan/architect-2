"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/lib/db/queries";
import { addLedger, updateProject } from "@/lib/db/writes";

export async function setBudgetCap(projectId: string, cap: number) {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false as const, error: "Project not found" };
  const value = Math.max(10, Math.min(100000, Math.round(cap)));
  await updateProject(supa, projectId, { settings: { ...project.settings, budgetCapCredits: value } });
  await addLedger(supa, projectId, [{ lane: "did", kind: "budget", title: `Spending cap set to ${value} credits a month`, body: `≈ $${(value / 100).toFixed(2)}. Agents pause and tell you before passing it.`, credits: 0 }]);
  revalidatePath("/settings");
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true as const };
}

export async function toggleIntegration(provider: string, connect: boolean) {
  const user = await requireUser();
  const supa = await createClient();
  if (connect) await supa.from("integrations").upsert({ user_id: user.id, provider, status: "connected", meta: { sandbox: true } }, { onConflict: "user_id,provider" });
  else await supa.from("integrations").delete().eq("user_id", user.id).eq("provider", provider);
  revalidatePath("/settings");
  return { ok: true as const };
}
