"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/lib/db/queries";
import { addLedger, updateProject } from "@/lib/db/writes";

const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Sandbox GitHub connection: the flow and the repo semantics are real, the push is not. */
export async function connectGitHub(projectId: string): Promise<{ ok: boolean; repo?: string }> {
  const user = await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false };
  const account = user.isAnonymous ? "guest" : (user.email?.split("@")[0] ?? kebab(user.name) ?? "you");
  const repo = `${account}/${kebab(project.name)}`;
  await updateProject(supa, projectId, { settings: { ...project.settings, github: { connected: true, repo, account } } });
  await supa.from("integrations").upsert({ user_id: user.id, provider: "github", status: "connected", meta: { account, sandbox: true } }, { onConflict: "user_id,provider" });
  await addLedger(supa, projectId, [
    { lane: "did", kind: "change", title: `Connected GitHub · ${repo}`, body: "Every Work Order now lands on its own branch as a change for review. Two-way sync is on (sandbox).", credits: 0 },
  ]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true, repo };
}

export async function pullFromGitHub(projectId: string): Promise<{ ok: boolean }> {
  await requireUser();
  const supa = await createClient();
  await addLedger(supa, projectId, [
    { lane: "checked", kind: "change", blame: "teammate", title: "Pulled 2 commits from main", body: "Priya changed the adjuster routing threshold in agents/intake-triage/RULES.md. No conflicts. The blueprint picked it up and rehearsals still pass (sandbox).", credits: 0 },
  ]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true };
}
