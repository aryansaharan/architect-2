import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLiveSiteForProject, getProject, listCheckpoints, listHandoffs, listLedger, listWorkOrders, usageSummary } from "@/lib/db/queries";
import { WorkspaceShell } from "@/components/workspace/shell";
import { parseRailPref, RAIL_COOKIE } from "@/components/workspace/rail-pref";
import { llmMode } from "@/lib/llm/provider";
import { creditMeter } from "@/lib/pricing";
import { monthStartIso } from "@/lib/prices";
import { publicReport } from "@/lib/build/report";
import { buildInfo } from "@/components/code-apps/build-info";

export async function generateMetadata(props: LayoutProps<"/p/[id]">) {
  const { id } = await props.params;
  const supa = await createClient();
  const project = await getProject(supa, id).catch(() => null);
  return { title: project?.name ?? "Project" };
}

/**
 * Every project page: the top bar, the page (the Sheet at /p/[id], or AI helpers, Publish and the
 * Under the hood pages), and the notes margin on the right. The shell lays them out.
 */
export default async function ProjectLayout(props: LayoutProps<"/p/[id]">) {
  const { id } = await props.params;
  // After signing in, come back to the Sheet.
  const user = await requireUser(`/p/${id}`);
  const supa = await createClient();
  const project = await getProject(supa, id);
  if (!project) notFound();
  const [checkpoints, ledger, handoffs, usage, credits, live, workOrders, cookieStore] = await Promise.all([
    listCheckpoints(supa, id),
    listLedger(supa, id),
    listHandoffs(supa, id),
    usageSummary(supa, { projectId: id, sinceIso: monthStartIso() }),
    creditMeter(user),
    getLiveSiteForProject(supa, id),
    listWorkOrders(supa, id),
    cookies(),
  ]);
  return (
    <WorkspaceShell
      // Whether the notes margin is open or folded on the Sheet, so the first paint already has the right width.
      railPref={parseRailPref(cookieStore.get(RAIL_COOKIE)?.value)}
      // Recent proposed changes, so the notes can show each one's outcome (applied, not now, still waiting).
      changeOrders={workOrders.filter((w) => w.kind === "change")}
      data={{
        project: {
          id: project.id,
          name: project.name,
          buildState: project.build_state,
          isDemo: project.is_demo,
          settings: project.settings,
          source: project.source,
          brief: project.brief,
          currentCheckpointId: project.current_checkpoint_id,
          kind: project.kind === "code" ? "code" : "business",
          buildReport: project.build_report ? publicReport(project.build_report) : null,
        },
        // A code app's files, and its latest build without the bundle (the sandbox page serves that).
        code: project.kind === "code" ? project.code : null,
        codeBuild: project.kind === "code" ? buildInfo(project.build) : null,
        blueprint: project.blueprint,
        checkpoints,
        ledger,
        // This project's spend against its own optional cap (still enforced), and the person's monthly credits (the meter).
        usage: { credits: usage.credits, cap: project.settings.budgetCapCredits },
        credits,
        liveSlug: live?.slug ?? null,
        user: { name: user.name, isAnonymous: user.isAnonymous, avatarUrl: user.avatarUrl },
        handoffs,
        pendingWorkOrder: workOrders.find((w) => w.kind === "build" && w.status === "proposed") ?? null,
        llm: llmMode(),
      }}
    >
      {props.children}
    </WorkspaceShell>
  );
}
