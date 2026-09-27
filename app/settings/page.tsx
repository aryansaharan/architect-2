import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listIntegrations, listProjects, usageSummary } from "@/lib/db/queries";
import { Logo } from "@/components/brand/logo";
import { UserMenuView } from "@/components/workspace/top-bar";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata = { title: "Settings" };

const MAIN_NAV = [
  { href: "/home", label: "Projects" },
  { href: "/settings#connections", label: "Connections" },
  { href: "/settings#usage", label: "Usage" },
  { href: "/settings", label: "Settings" },
];

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
      <header className="sticky top-0 z-20 border-b border-hairline bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
          <Logo href="/home" />
          {/* The same items, in the same order, as the Home header (app/home/page.tsx). */}
          <nav className="ml-4 hidden items-center gap-1 text-[13px] md:flex" aria-label="Main">
            {MAIN_NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={n.href === "/settings" ? "page" : undefined} className={n.href === "/settings" ? "rounded-md bg-raised px-2.5 py-1.5 font-medium" : "rounded-md px-2.5 py-1.5 text-muted-foreground hover:text-foreground"}>{n.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden font-mono text-[12px] text-muted-foreground sm:inline">{Math.round(month.credits)} / {cap} cr this month</span>
            <UserMenuView name={user.name} isAnonymous={user.isAnonymous} avatarUrl={user.avatarUrl} />
          </div>
        </div>
      </header>
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
