import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLiveSiteForProject, getProject, listCheckpoints, listHandoffs, listLedger, listWorkOrders, usageSummary } from "@/lib/db/queries";
import { WorkspaceShell } from "@/components/workspace/shell";
import { parseRailPref, RAIL_COOKIE } from "@/components/workspace/rail-pref";
import { llmMode } from "@/lib/llm/provider";

export async function generateMetadata(props: LayoutProps<"/p/[id]">) {
  const { id } = await props.params;
  const supa = await createClient();
  const project = await getProject(supa, id).catch(() => null);
  return { title: project?.name ?? "Project" };
}

export default async function ProjectLayout(props: LayoutProps<"/p/[id]">) {
  const { id } = await props.params;
  const user = await requireUser(`/p/${id}/blueprint`);
  const supa = await createClient();
  const project = await getProject(supa, id);
  if (!project) notFound();
  const [checkpoints, ledger, handoffs, usage, live, workOrders, cookieStore] = await Promise.all([
    listCheckpoints(supa, id),
    listLedger(supa, id),
    listHandoffs(supa, id),
    usageSummary(supa, { projectId: id }),
    getLiveSiteForProject(supa, id),
    listWorkOrders(supa, id),
    cookies(),
  ]);
  return (
    <WorkspaceShell
      // The rail's open/collapsed choice, so the first paint already has the right width.
      railPref={parseRailPref(cookieStore.get(RAIL_COOKIE)?.value)}
      // Recent change Work Orders, so the chat can show each one's outcome (approved, dismissed, still waiting).
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
        },
        blueprint: project.blueprint,
        checkpoints,
        ledger,
        usage: { credits: usage.credits, cap: project.settings.budgetCapCredits },
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
