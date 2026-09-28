import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listIntegrations, listProjects, usageSummary } from "@/lib/db/queries";
import { AppHeader } from "@/components/app-header";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const supa = await createClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [projects, integrations, month] = await Promise.all([listProjects(supa), listIntegrations(supa), usageSummary(supa, { sinceIso: monthStart.toISOString() })]);
  const perProject = await Promise.all(projects.map(async (p) => ({ id: p.id, name: p.name, cap: p.settings.budgetCapCredits, used: (await usageSummary(supa, { projectId: p.id })).credits, agents: p.blueprint.agents.map((a) => ({ id: a.id, name: a.name })) })));
  const cap = projects[0]?.settings.budgetCapCredits ?? 200;
  const connections = [...new Map(projects.flatMap((p) => p.blueprint.connections.map((c) => [c.name, { ...c, project: p.name }] as const))).values()];
  return (
    <div className="min-h-screen">
      <AppHeader current="/settings" user={{ name: user.name, isAnonymous: user.isAnonymous, avatarUrl: user.avatarUrl }} credits={month.credits} cap={cap} />
      <SettingsView
        user={{ name: user.name, email: user.email, isAnonymous: user.isAnonymous, provider: user.provider }}
        integrations={integrations}
        month={month}
        projects={perProject}
        connections={connections.map((c) => ({ name: c.name, kind: c.kind, auth: c.auth, status: c.status, project: c.project }))}
      />
    </div>
  );
}
