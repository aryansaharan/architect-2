import Link from "next/link";
import { ArrowRight, Bot, FolderGit2, Inbox, KeyRound, Sparkles, UsersRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listHandoffs, listProjects, usageSummary } from "@/lib/db/queries";
import { Logo } from "@/components/brand/logo";
import { UserMenuView } from "@/components/workspace/top-bar";
import { StatusBadge } from "@/components/arch/badges";
import { ScreenThumb } from "@/components/workspace/screen-thumb";
import { TimeAgo } from "@/components/time-ago";
import { HomeComposer } from "@/components/home/home-composer";
import { Button } from "@/components/ui/button";
import { creditsUsd, formatCredits } from "@/lib/format";

export const metadata = { title: "Projects" };

export default async function HomePage() {
  const user = await requireUser("/home");
  const supa = await createClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [projects, handoffs, usage, fixes, live] = await Promise.all([
    listProjects(supa),
    listHandoffs(supa),
    usageSummary(supa, { sinceIso: monthStart.toISOString() }),
    supa.from("ledger_events").select("id", { count: "exact", head: true }).eq("blame", "system_fix"),
    supa.from("live_sites").select("project_id, slug"),
  ]);
  const liveMap = new Map((live.data ?? []).map((l) => [l.project_id as string, l.slug as string]));
  const openHandoffs = handoffs.filter((h) => h.status !== "resolved");
  const drafts = projects.filter((p) => p.build_state === "draft");
  const missingKeys = projects.flatMap((p) => p.blueprint.connections.filter((c) => c.status === "missing").map((c) => ({ p, c })));
  const cap = projects[0]?.settings.budgetCapCredits ?? 200;
  const first = user.name.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-hairline bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
          <Logo href="/home" />
          <nav className="ml-4 hidden items-center gap-1 text-[13px] md:flex" aria-label="Main">
            <Link href="/home" className="rounded-md bg-raised px-2.5 py-1.5 font-medium">Projects</Link>
            <Link href="/settings#connections" className="rounded-md px-2.5 py-1.5 text-muted-foreground hover:text-foreground">Connections</Link>
            <Link href="/settings#usage" className="rounded-md px-2.5 py-1.5 text-muted-foreground hover:text-foreground">Usage</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden font-mono text-[12px] text-muted-foreground sm:inline">{Math.round(usage.credits)} / {cap} cr this month</span>
            <UserMenuView name={user.name} isAnonymous={user.isAnonymous} avatarUrl={user.avatarUrl} />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-6 pb-24 pt-10">
        {user.isAnonymous && (
          <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-amber/25 bg-amber-soft px-4 py-3 text-[13px]">
            <Sparkles className="size-4 text-amber" />
            <span>You&apos;re exploring as a guest. Everything works — sign in any time and it all comes with you.</span>
            <Button asChild size="sm" variant="outline" className="ml-auto h-8"><Link href="/login?next=/home">Keep this work</Link></Button>
          </div>
        )}

        <section aria-labelledby="new-heading">
          <p className="text-[13px] text-muted-foreground">{greeting}{user.isAnonymous ? "" : `, ${first}`}.</p>
          <h1 id="new-heading" className="mt-1 font-display text-[40px] leading-tight tracking-tight">What should we build?</h1>
          <HomeComposer />
        </section>

        {(openHandoffs.length > 0 || drafts.length > 0 || missingKeys.length > 0) && (
          <section aria-labelledby="needs-heading" className="mt-12">
            <h2 id="needs-heading" className="micro-label">Needs you</h2>
            <ul className="mt-3 grid gap-3 md:grid-cols-3">
              {openHandoffs.slice(0, 2).map((h) => {
                const p = projects.find((x) => x.id === h.project_id);
                return (
                  <li key={h.id}>
                    <Link href={`/p/${h.project_id}/handoffs?h=${h.id}`} className="panel flex h-full gap-3 rounded-xl p-4 transition-colors hover:border-[#343947]">
                      <UsersRound className="mt-0.5 size-4 shrink-0 text-change" />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium">Waiting on {h.assignee.split(" · ")[0].split(" ")[0]}</span>
                        <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-muted-foreground">“{h.prompt}”</span>
                        <span className="mt-2 block text-[11.5px] text-faint">{p?.name} · <TimeAgo iso={h.created_at} /></span>
                      </span>
                    </Link>
                  </li>
                );
              })}
              {drafts.slice(0, 2).map((p) => (
                <li key={p.id}>
                  <Link href={`/p/${p.id}/blueprint`} className="panel flex h-full gap-3 rounded-xl p-4 transition-colors hover:border-[#343947]">
                    <Inbox className="mt-0.5 size-4 shrink-0 text-amber" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">Plan ready: {p.name}</span>
                      <span className="mt-0.5 block text-[12.5px] text-muted-foreground">~{p.blueprint.estimate.minutes} min · {p.blueprint.estimate.credits} credits (≈ {creditsUsd(p.blueprint.estimate.credits)}). Nothing runs until you say so.</span>
                    </span>
                  </Link>
                </li>
              ))}
              {missingKeys.slice(0, 1).map(({ p, c }) => (
                <li key={p.id + c.id}>
                  <Link href={`/p/${p.id}/blueprint?sel=connection:${c.id}`} className="panel flex h-full gap-3 rounded-xl p-4 transition-colors hover:border-[#343947]">
                    <KeyRound className="mt-0.5 size-4 shrink-0 text-amber" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{c.name} needs a key</span>
                      <span className="mt-0.5 block text-[12.5px] text-muted-foreground">{p.name} is using test data for it. Add a key, or ask a teammate who has one.</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="projects-heading" className="mt-12">
          <div className="flex items-baseline justify-between">
            <h2 id="projects-heading" className="micro-label">Your projects · {projects.length}</h2>
            <Link href="/demo" className="text-[12.5px] text-muted-foreground hover:text-foreground">Open the demo project</Link>
          </div>
          {projects.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-hairline p-10 text-center">
              <Bot className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 text-[14px] font-medium">No projects yet</p>
              <p className="mt-1 text-[13px] text-muted-foreground">Describe one above, bring an existing repo, or open the finished demo to look around.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button asChild variant="outline" size="sm"><Link href="/demo">Open the demo</Link></Button>
                <Button asChild variant="outline" size="sm"><Link href="/new?mode=import"><FolderGit2 /> Bring a repo</Link></Button>
              </div>
            </div>
          ) : (
            <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => {
                const s = p.blueprint.screens[0];
                return (
                  <li key={p.id}>
                    <Link href={`/p/${p.id}/blueprint`} className="panel group block overflow-hidden rounded-xl transition-colors hover:border-[#343947]">
                      <div className="dot-grid border-b border-hairline p-4">
                        <div className="rounded-lg border border-white/[0.06] bg-panel/80 p-2.5">{s && <ScreenThumb screen={s} primary={p.blueprint.meta.theme.primary} />}</div>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[14px] font-medium">{p.name}</p>
                          <span className="ml-auto"><StatusBadge state={p.build_state} live={liveMap.has(p.id)} /></span>
                        </div>
                        <p className="mt-1 line-clamp-1 text-[12.5px] text-muted-foreground">{p.blueprint.meta.tagline}</p>
                        <p className="mt-3 flex items-center gap-3 text-[11.5px] text-faint">
                          <span>{p.blueprint.screens.length} screens</span>
                          <span>{p.blueprint.agents.length} agents</span>
                          {p.source === "import" && <span className="inline-flex items-center gap-1"><FolderGit2 className="size-3" />imported</span>}
                          <span className="ml-auto"><TimeAgo iso={p.updated_at} /></span>
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="usage-heading" className="mt-12 grid gap-4 md:grid-cols-3">
          <h2 id="usage-heading" className="sr-only">Usage</h2>
          <div className="panel rounded-xl p-4">
            <p className="micro-label">Spent this month</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{formatCredits(usage.credits)}</p>
            <p className="text-[12.5px] text-muted-foreground">≈ {creditsUsd(usage.credits)} of a {cap}-credit cap</p>
          </div>
          <div className="panel rounded-xl p-4">
            <p className="micro-label">Our fixes, on us</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-fix">{fixes.count ?? 0}</p>
            <p className="text-[12.5px] text-muted-foreground">Problems Architect caught and fixed without charging you.</p>
          </div>
          <Link href="/settings#usage" className="panel group flex flex-col justify-between rounded-xl p-4 transition-colors hover:border-[#343947]">
            <p className="micro-label">Budgets &amp; breakdown</p>
            <p className="mt-2 flex items-center gap-1 text-[13px]">Per agent, per project, build vs. runtime <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></p>
          </Link>
        </section>
      </main>
    </div>
  );
}
