"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProject, usageSummary } from "@/lib/db/queries";
import { addLedger, updateProject } from "@/lib/db/writes";
import { monthStartIso } from "@/lib/prices";

export async function setBudgetCap(projectId: string, cap: number) {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false as const, error: "Project not found" };
  const value = Math.round(cap);
  // No silent clamping: the cap you see confirmed is the cap that was saved.
  if (!Number.isFinite(value) || value < 10) return { ok: false as const, error: "Minimum is 10 credits a month." };
  if (value > 100000) return { ok: false as const, error: "Maximum is 100,000 credits a month." };
  await updateProject(supa, projectId, { settings: { ...project.settings, budgetCapCredits: value } });
  await addLedger(supa, projectId, [{ lane: "did", kind: "budget", title: `Spending cap set to ${value} credits a month`, body: "AI helpers pause and tell you before passing it.", credits: 0 }]);
  revalidatePath("/settings");
  revalidatePath(`/p/${projectId}`, "layout");
  // Say so when the new cap is already used up, instead of a cheerful "saved".
  const used = (await usageSummary(supa, { projectId, sinceIso: monthStartIso() }).catch(() => null))?.credits ?? 0;
  const warning = used >= value ? `This project has already used ${Math.round(used)} credits this month, so its AI helpers are paused until next month or until you raise the cap.` : undefined;
  return { ok: true as const, value, warning };
}

export async function toggleIntegration(provider: string, connect: boolean) {
  const user = await requireUser();
  const supa = await createClient();
  if (connect) await supa.from("integrations").upsert({ user_id: user.id, provider, status: "connected", meta: { sandbox: true } }, { onConflict: "user_id,provider" });
  else await supa.from("integrations").delete().eq("user_id", user.id).eq("provider", provider);
  revalidatePath("/settings");
  return { ok: true as const };
}
