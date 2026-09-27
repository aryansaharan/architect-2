import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listProjects, usageSummary } from "@/lib/db/queries";
import { HomeView } from "@/components/home/home-view";
import type { HomeProject } from "@/components/home/project-card";

export const metadata = { title: "Projects" };

export default async function HomePage() {
  const user = await requireUser("/home");
  const supa = await createClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [projects, usage, live] = await Promise.all([
    listProjects(supa),
    usageSummary(supa, { sinceIso: monthStart.toISOString() }),
    supa.from("live_sites").select("project_id"),
  ]);
  const liveIds = new Set((live.data ?? []).map((l) => l.project_id as string));
  const cap = projects[0]?.settings.budgetCapCredits ?? 200;
  const cards: HomeProject[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    tagline: p.blueprint.meta.tagline,
    buildState: p.build_state,
    live: liveIds.has(p.id),
    layout: p.blueprint.screens[0]?.layout,
    screens: p.blueprint.screens.length,
    helpers: p.blueprint.agents.length,
    imported: p.source === "import",
    updatedAt: p.updated_at,
  }));

  return <HomeView user={{ name: user.name, isAnonymous: user.isAnonymous, avatarUrl: user.avatarUrl }} projects={cards} credits={usage.credits} cap={cap} />;
}
