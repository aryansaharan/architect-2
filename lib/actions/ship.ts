"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCheckpoint, getLiveSiteForProject, getProject } from "@/lib/db/queries";
import { addCheckpoint, addLedger, updateProject } from "@/lib/db/writes";
import { canGoLive, preflight, type PreflightFix } from "@/lib/sim/preflight";
import { shortId } from "@/lib/sim/hash";
import { estimate } from "@/lib/blueprint/estimate";
import type { DeploymentRow } from "@/lib/db/types";

type R = { ok: true; slug?: string; message?: string } | { ok: false; error: string };

export async function fixPreflight(projectId: string, action: PreflightFix): Promise<R> {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  const bp = structuredClone(project.blueprint);
  let title = "";
  if (action === "enable_auth") {
    bp.meta.auth = { enabled: true, providers: bp.meta.auth.providers.length ? bp.meta.auth.providers : ["google", "email"] };
    title = "Turned on sign-in";
  } else if (action === "gate_irreversible") {
    let n = 0;
    bp.agents.forEach((a) => a.tools.forEach((t) => {
      if (t.access === "irreversible" && t.permission !== "ask") {
        t.permission = "ask";
        n++;
      }
    }));
    title = `Added ${n} approval gate${n === 1 ? "" : "s"}`;
  } else if (action === "sandbox_keys") {
    const names = bp.connections.filter((c) => c.status === "missing").map((c) => c.name);
    bp.connections.forEach((c) => (c.status = "configured"));
    title = `Added sandbox keys for ${names.join(", ")}`;
  } else if (action === "set_budget") {
    await updateProject(supa, projectId, { settings: { ...project.settings, budgetCapCredits: 200 } });
    await addLedger(supa, projectId, [{ lane: "did", kind: "budget", title: "Set a 200-credit monthly cap", credits: 0 }]);
    revalidatePath(`/p/${projectId}`, "layout");
    return { ok: true };
  } else {
    return { ok: false, error: "Build the project first" };
  }
  bp.estimate = estimate(bp);
  await updateProject(supa, projectId, { blueprint: bp });
  const cp = await addCheckpoint(supa, projectId, { label: title.slice(0, 60), kind: "change", blueprint: bp, summary: "Fixed from Preflight" });
  await addLedger(supa, projectId, [{ lane: "did", kind: "ship", title: `Preflight: ${title.toLowerCase()}`, credits: 0, checkpointId: cp.id, body: "One-click fix from the Ship tab, free." }]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true };
}

const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);

export async function goLive(projectId: string, target: DeploymentRow["target"], domain?: string): Promise<R> {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  const checks = preflight(project.blueprint, { budgetCapCredits: project.settings.budgetCapCredits, built: project.build_state === "built", region: project.settings.region });
  if (!canGoLive(checks)) return { ok: false, error: "Preflight has blocking issues. Fix them first." };
  const summary = checks.map((c) => ({ id: c.id, label: c.label, pass: c.status !== "fail" }));

  if (target !== "architect_cloud") {
    await supa.from("deployments").insert({ project_id: projectId, env: "live", target, checkpoint_id: project.current_checkpoint_id, status: "sandbox", preflight: summary, url: null });
    await addLedger(supa, projectId, [
      {
        lane: "did",
        kind: "ship",
        title: target === "vercel" ? "Prepared a Vercel deployment (sandbox)" : "Packaged the app for your own cloud (sandbox)",
        body: target === "vercel" ? "In production this pushes to your Vercel team and opens a deploy preview." : `docker-compose.yml and agent runtime images are ready${domain ? ` for ${domain}` : ""}. Nothing leaves your network.`,
      },
    ]);
    revalidatePath(`/p/${projectId}`, "layout");
    return { ok: true, message: "sandbox" };
  }

  const existing = await getLiveSiteForProject(supa, projectId);
  const slug = existing?.slug ?? `${kebab(project.name) || "app"}-${shortId(projectId)}`;
  const cp = await addCheckpoint(supa, projectId, { label: "Went live", kind: "ship", blueprint: project.blueprint, summary: `Live at /live/${slug}` });
  if (existing) await supa.from("live_sites").update({ blueprint: project.blueprint, checkpoint_id: cp.id, published_at: new Date().toISOString() }).eq("slug", slug);
  else await supa.from("live_sites").insert({ slug, project_id: projectId, checkpoint_id: cp.id, blueprint: project.blueprint });
  await supa.from("deployments").update({ status: "rolled_back" }).eq("project_id", projectId).eq("status", "live");
  await supa.from("deployments").insert({ project_id: projectId, env: "live", target, checkpoint_id: cp.id, status: "live", preflight: summary, url: `/live/${slug}` });
  await addLedger(supa, projectId, [
    { lane: "did", kind: "ship", title: existing ? "Updated the live version" : "Went live on Architect Cloud", body: `Anyone with the link can open /live/${slug}.${domain ? ` ${domain} will point here once DNS checks pass.` : ""}`, checkpointId: cp.id },
  ]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true, slug };
}

export async function rollbackTo(projectId: string, deploymentId: string): Promise<R> {
  await requireUser();
  const supa = await createClient();
  const { data: dep } = await supa.from("deployments").select("*").eq("id", deploymentId).eq("project_id", projectId).maybeSingle();
  const live = await getLiveSiteForProject(supa, projectId);
  if (!dep || !dep.checkpoint_id || !live) return { ok: false, error: "Nothing to roll back to" };
  const cp = await getCheckpoint(supa, dep.checkpoint_id);
  if (!cp) return { ok: false, error: "That save point is gone" };
  await supa.from("live_sites").update({ blueprint: cp.blueprint, checkpoint_id: cp.id, published_at: new Date().toISOString() }).eq("slug", live.slug);
  await supa.from("deployments").update({ status: "rolled_back" }).eq("project_id", projectId).eq("status", "live");
  await supa.from("deployments").insert({ project_id: projectId, env: "live", target: "architect_cloud", checkpoint_id: cp.id, status: "live", preflight: dep.preflight, url: `/live/${live.slug}` });
  await addLedger(supa, projectId, [{ lane: "did", kind: "restore", title: `Rolled the live version back to save point #${cp.seq}`, body: "Rollbacks are instant and free. The test version is unchanged.", credits: 0 }]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true };
}

export async function takeOffline(projectId: string): Promise<R> {
  await requireUser();
  const supa = await createClient();
  await supa.from("live_sites").delete().eq("project_id", projectId);
  await supa.from("deployments").update({ status: "rolled_back" }).eq("project_id", projectId).eq("status", "live");
  await addLedger(supa, projectId, [{ lane: "did", kind: "ship", title: "Took the live version offline", body: "The link now shows “not found”. Your project and save points are untouched." }]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true };
}
