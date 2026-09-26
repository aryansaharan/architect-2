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
import { Spotlight } from "@/components/fx/spotlight";
import { creditsUsd, formatCredits } from "@/lib/format";
import { Greeting } from "@/components/home/greeting";

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

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[560px] overflow-hidden">
        <div className="solstice-orb -left-[10%] -top-[70%] h-[640px] w-[640px] opacity-[0.26]" />
        <div className="solstice-orb -right-[12%] -top-[60%] h-[520px] w-[520px] opacity-[0.16] [animation-direction:reverse] [animation-duration:40s]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.045)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
      </div>
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

      <main id="main" className="relative mx-auto max-w-6xl px-6 pb-24 pt-10">
        {user.isAnonymous && (
          <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-amber/25 bg-amber-soft px-4 py-3 text-[13px]">
            <Sparkles className="size-4 text-amber" />
            <span>You&apos;re exploring as a guest. Everything works. Sign in any time and it all comes with you.</span>
            <Button asChild size="sm" variant="outline" className="ml-auto h-8"><Link href="/login?next=/home">Keep this work</Link></Button>
          </div>
        )}

        <section aria-labelledby="new-heading">
          <p className="fade-up text-[13px] text-muted-foreground"><Greeting name={user.isAnonymous ? undefined : first} /></p>
          <h1 id="new-heading" className="mt-1 font-display text-[44px] leading-tight tracking-tight">
            {"What should we".split(" ").map((w, i) => <span key={i} className="word-in mr-[0.25em]" style={{ animationDelay: `${80 + i * 70}ms` }}>{w}</span>)}
            <em className="word-in text-amber-grad" style={{ animationDelay: "380ms" }}>build?</em>
          </h1>
          <div className="fade-up" style={{ animationDelay: "420ms" }}><HomeComposer /></div>
        </section>

        {(openHandoffs.length > 0 || drafts.length > 0 || missingKeys.length > 0) && (
          <section aria-labelledby="needs-heading" className="mt-12">
            <h2 id="needs-heading" className="micro-label">Needs you</h2>
            <ul className="mt-3 grid gap-3 md:grid-cols-3">
              {openHandoffs.slice(0, 2).map((h) => {
                const p = projects.find((x) => x.id === h.project_id);
                return (
                  <li key={h.id}>
                    <Link href={`/p/${h.project_id}/handoffs?h=${h.id}`} className="panel flex h-full gap-3 rounded-xl p-4 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-hairline-hi hover:shadow-[0_18px_40px_-18px_rgb(0_0_0/0.8)]">
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
                  <Link href={`/p/${p.id}/blueprint`} className="panel flex h-full gap-3 rounded-xl p-4 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-hairline-hi hover:shadow-[0_18px_40px_-18px_rgb(0_0_0/0.8)]">
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
                  <Link href={`/p/${p.id}/blueprint?sel=connection:${c.id}`} className="panel flex h-full gap-3 rounded-xl p-4 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-hairline-hi hover:shadow-[0_18px_40px_-18px_rgb(0_0_0/0.8)]">
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
            <Link href="/demo" prefetch={false} className="text-[12.5px] text-muted-foreground hover:text-foreground">Open the demo project</Link>
          </div>
          {projects.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-hairline p-10 text-center">
              <Bot className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 text-[14px] font-medium">No projects yet</p>
              <p className="mt-1 text-[13px] text-muted-foreground">Describe one above, bring an existing repo, or open the finished demo to look around.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button asChild variant="outline" size="sm"><Link href="/demo" prefetch={false}>Open the demo</Link></Button>
                <Button asChild variant="outline" size="sm"><Link href="/new?mode=import"><FolderGit2 /> Bring a repo</Link></Button>
              </div>
            </div>
          ) : (
            <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p, i) => {
                const s = p.blueprint.screens[0];
                return (
                  <li key={p.id} className="fade-up" style={{ animationDelay: `${520 + Math.min(i, 8) * 60}ms` }}>
                    <Spotlight className="rounded-xl">
                    <Link href={`/p/${p.id}/blueprint`} className="panel group block overflow-hidden rounded-xl transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-1 hover:border-hairline-hi hover:shadow-[0_28px_60px_-24px_rgb(0_0_0/0.9),0_0_40px_-20px_rgb(223_255_79/0.35)]">
                      <div className="dot-grid relative overflow-hidden border-b border-hairline p-4">
                        <div className="rounded-lg border border-white/[0.06] bg-panel/80 p-2.5 transition-transform duration-500 ease-out group-hover:scale-[1.03]">{s && <ScreenThumb screen={s} primary={p.blueprint.meta.theme.primary} />}</div>
                        <div aria-hidden className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-panel/70 to-transparent" />
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
                    </Spotlight>
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
            <p className="mt-2 text-2xl font-semibold tabular-nums text-fix [text-shadow:0_0_24px_rgb(180_140_255/0.45)]">{fixes.count ?? 0}</p>
            <p className="text-[12.5px] text-muted-foreground">Problems Wonderwork caught and fixed without charging you.</p>
          </div>
          <Link href="/settings#usage" className="panel group flex flex-col justify-between rounded-xl p-4 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-hairline-hi">
            <p className="micro-label">Budgets &amp; breakdown</p>
            <p className="mt-2 flex items-center gap-1 text-[13px]">Per agent, per project, build vs. runtime <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></p>
          </Link>
        </section>
      </main>
    </div>
  );
}
