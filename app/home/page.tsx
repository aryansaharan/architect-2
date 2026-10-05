import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listProjects, liveProjectIds } from "@/lib/db/queries";
import { creditMeter } from "@/lib/pricing";
import { projectCapMessage } from "@/lib/security/caps";
import { HomeView } from "@/components/home/home-view";
import type { HomeProject } from "@/components/home/project-card";

export const metadata = { title: "Projects" };

export default async function HomePage() {
  const user = await requireUser("/home");
  const supa = await createClient();
  const [projects, credits, capMessage] = await Promise.all([listProjects(supa), creditMeter(user), projectCapMessage(supa, user)]);
  const liveIds = await liveProjectIds(supa, projects.map((p) => p.id));
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

  return <HomeView user={{ name: user.name, isAnonymous: user.isAnonymous, avatarUrl: user.avatarUrl }} projects={cards} credits={credits} capMessage={capMessage} />;
}
