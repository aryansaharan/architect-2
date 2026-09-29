import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listIntegrations, listProjects, usageSummary } from "@/lib/db/queries";
import { creditMeter } from "@/lib/pricing";
import { AppHeader } from "@/components/app-header";
import { SettingsView } from "@/components/settings/settings-view";
import { monthStartIso } from "@/lib/prices";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const supa = await createClient();
  // The same month as the credit meter: from the 1st, UTC.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [projects, integrations, month, credits] = await Promise.all([listProjects(supa), listIntegrations(supa), usageSummary(supa, { sinceIso: monthStart.toISOString() }), creditMeter(user)]);
  // Each project's spend against its own optional cap, which is still enforced.
  const perProject = await Promise.all(projects.map(async (p) => ({ id: p.id, name: p.name, cap: p.settings.budgetCapCredits, used: (await usageSummary(supa, { projectId: p.id, sinceIso: monthStartIso() })).credits, agents: p.blueprint.agents.map((a) => ({ id: a.id, name: a.name })) })));
  const connections = [...new Map(projects.flatMap((p) => p.blueprint.connections.map((c) => [c.name, { ...c, project: p.name }] as const))).values()];
  return (
    <div className="min-h-screen">
      <AppHeader current="/settings" user={{ name: user.name, isAnonymous: user.isAnonymous, avatarUrl: user.avatarUrl }} credits={credits} />
      <SettingsView
        user={{ name: user.name, email: user.email, isAnonymous: user.isAnonymous, provider: user.provider }}
        integrations={integrations}
        month={month}
        credits={credits}
        projects={perProject}
        connections={connections.map((c) => ({ name: c.name, kind: c.kind, auth: c.auth, status: c.status, project: c.project }))}
      />
    </div>
  );
}
