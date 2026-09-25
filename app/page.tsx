import Link from "next/link";
import { ArrowRight, Check, CircleDot, Coins, FileSearch, GitPullRequest, Lock, ShieldCheck, Undo2, UsersRound, X } from "lucide-react";
import { Logo, GitHubMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { HeroDemo, type HeroExample } from "@/components/landing/hero-demo";
import { DepthDemo } from "@/components/landing/depth-demo";
import { FrameworkTabs } from "@/components/landing/framework-tabs";
import { OAuthButton } from "@/components/landing/oauth-button";
import { Avatar } from "@/components/arch/badges";
import { STARTERS, starterBlueprint, type StarterVertical } from "@/lib/blueprint/fixtures";
import { applyOps } from "@/lib/blueprint/apply";
import { planRepair } from "@/lib/sim/repair";
import { PERMISSION_LABEL, SUPERVISION_LABEL, connectionName } from "@/lib/blueprint/describe";
import { agentYaml } from "@/lib/codegen/agentFiles";
import { FRAMEWORKS } from "@/lib/codegen/frameworks";
import { getSessionUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/env";

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/aryansaharan/architect-2";

export default async function Landing() {
  const user = hasSupabase() ? await getSessionUser() : null;
  const examples: HeroExample[] = (["claims", "support", "sales", "hr"] as StarterVertical[]).map((v) => {
    const bp = starterBlueprint(v);
    return {
      label: STARTERS[v].label,
      prompt: STARTERS[v].brief,
      screens: bp.screens.map((s) => s.title),
      agents: bp.agents.map((a) => ({ name: a.name, gated: a.tools.filter((t) => t.access === "irreversible").length })),
      data: bp.entities.map((e) => e.plural),
      connections: bp.connections.map((c) => c.name),
      minutes: bp.estimate.minutes,
      credits: bp.estimate.credits,
    };
  });

  const claims = starterBlueprint("claims");
  const fixed = applyOps(claims, planRepair(claims).options[0].ops);
  const bp = fixed.ok ? fixed.blueprint : claims;
  const settlement = bp.agents.find((a) => a.id === "settlement")!;
  const frameworkItems = Object.values(FRAMEWORKS).map((fw) => {
    const a = { ...settlement, framework: fw.id };
    return { id: fw.id, label: fw.label, file: fw.fileName(a), lang: (fw.language === "python" ? "py" : "ts") as "py" | "ts", code: fw.render(a, bp), notes: fw.notes(a, bp) };
  });

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-30 border-b border-hairline/70 bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <Logo />
          <nav className="hidden items-center gap-5 text-[13px] text-muted-foreground md:flex" aria-label="Sections">
            <a href="#turn-three" className="hover:text-foreground">Why it&apos;s different</a>
            <a href="#depth" className="hover:text-foreground">One project, three depths</a>
            <a href="#frameworks" className="hover:text-foreground">Any framework</a>
            <a href="#real" className="hover:text-foreground">What&apos;s real</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <a href={REPO_URL} className="hidden items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:text-foreground sm:inline-flex" target="_blank" rel="noreferrer">
              <GitHubMark /> Source
            </a>
            {user && !user.isAnonymous ? (
              <Button asChild size="sm"><Link href="/home">Your projects <ArrowRight /></Link></Button>
            ) : (
              <>
                <Button asChild size="sm" variant="ghost"><Link href="/login">Sign in</Link></Button>
                <Button asChild size="sm"><Link href="/demo">Try the demo</Link></Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="relative">
          <div className="amber-glow pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1fr_1.05fr] lg:pt-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-hairline bg-panel px-3 py-1 text-[12px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-amber" /> Architect 2.0 · a prototype for Lyzr
              </p>
              <h1 className="mt-6 font-display text-[52px] leading-[1.02] tracking-tight sm:text-[64px]">
                Agentic apps you&apos;d trust <em className="text-amber">in production.</em>
              </h1>
              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
                Describe the app. Architect plans it, prices it, builds it and shows its work — so the people who don&apos;t code and the people who do can ship it together, in the same project.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="h-11 px-5 text-[14px]">
                  <Link href="/demo">Try the demo — no account <ArrowRight /></Link>
                </Button>
                {!user || user.isAnonymous ? <OAuthButton /> : null}
              </div>
              <p className="mt-4 text-[12.5px] text-faint">Opens a finished claims desk with real data, agents and a live URL. Takes about 5 seconds.</p>
            </div>
            <HeroDemo examples={examples} />
          </div>
        </section>

        {/* Turn three */}
        <section id="turn-three" className="border-t border-hairline bg-panel/30">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <p className="micro-label text-amber">Designed for turn three</p>
            <h2 className="mt-3 max-w-3xl text-[34px] font-semibold leading-tight tracking-tight">Every AI builder looks great on the first prompt. Architect is built for the third — when something breaks, costs money, or needs a person.</h2>
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              <PromiseCard
                title="See the plan and the price before anything runs"
                body="Every build and every change starts as a Work Order: what it touches, how long, how many credits. You approve it — or narrow it."
              >
                <div className="rounded-xl border border-amber/25 bg-amber-soft p-3.5">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-amber">Work Order</p>
                  <p className="mt-1.5 text-[13px] font-medium">Add an “SLA risk” column to the intake table</p>
                  <div className="mt-3 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                    <span className="rounded bg-deep px-1.5 py-0.5">1 screen</span><span className="rounded bg-deep px-1.5 py-0.5">0 agents</span><span className="rounded bg-deep px-1.5 py-0.5">4 files</span>
                    <span className="ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-amber px-2.5 text-[12px] font-medium text-primary-foreground"><Check className="size-3.5" />Approve · 5 cr</span>
                  </div>
                </div>
              </PromiseCard>
              <PromiseCard
                title="When it breaks, it tells you — and you don't pay for its fixes"
                body="Rehearsals run on every build. When one fails, you see what it tried, why it matters and two ways forward. Fixes for our own mistakes are labelled and free."
              >
                <div className="rounded-xl border border-hairline bg-deep/70 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Checked · rehearsal</span>
                    <span className="ml-auto rounded-full border border-fix/30 bg-fix/10 px-2 py-px text-[10.5px] text-fix">Our fix · free</span>
                  </div>
                  <p className="mt-1.5 text-[13px] font-medium">Rehearsal caught Settlement trying to issue a payment without asking</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11.5px]">
                    <span className="rounded-lg border border-amber/30 bg-amber-soft px-2 py-1.5">A · Ask a person first <span className="text-amber">(recommended)</span></span>
                    <span className="rounded-lg border border-hairline px-2 py-1.5 text-muted-foreground">B · Hand it to a person</span>
                  </div>
                </div>
              </PromiseCard>
              <PromiseCard
                title="Agents ask before they act"
                body="Every tool is marked Read, Change or Can't undo. Anything that sends, pays, creates or deletes waits for a person — in the playground and in production."
              >
                <div className="rounded-xl border border-ask/25 bg-ask/[0.06] p-3.5">
                  <p className="flex items-center gap-2 text-[13px] font-medium"><Lock className="size-3.5 text-ask" />Settlement wants to issue a payment</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">$1,640 to Grace Liu · ACH · claim CLM-20935</p>
                  <div className="mt-3 flex gap-2 text-[12px]">
                    <span className="inline-flex h-7 items-center rounded-md bg-amber px-2.5 font-medium text-primary-foreground">Allow once</span>
                    <span className="inline-flex h-7 items-center rounded-md border border-hairline px-2.5">Always</span>
                    <span className="inline-flex h-7 items-center rounded-md border border-hairline px-2.5 text-muted-foreground">Deny</span>
                  </div>
                </div>
              </PromiseCard>
              <PromiseCard
                title="Stuck? Hand it over with full context"
                body="“Ask a teammate” sends the exact screen or agent, your brief, recent requests and the latest diff. The fix comes back to you as a sentence you can read."
              >
                <div className="rounded-xl border border-hairline bg-deep/70 p-3.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name="Priya Raman" hue={200} size={26} />
                    <p className="text-[12.5px]"><span className="font-medium">Priya</span> <span className="text-muted-foreground">resolved your request</span></p>
                    <span className="ml-auto rounded-full border border-change/30 bg-change/10 px-2 py-px text-[10.5px] text-change">Teammate</span>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed">“The policy system is connected to the sandbox. Intake Triage now gets real coverage answers instead of test data.”</p>
                </div>
              </PromiseCard>
            </div>
          </div>
        </section>

        {/* Depth */}
        <section id="depth" className="border-t border-hairline">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <p className="micro-label text-amber">One project, three depths</p>
              <h2 className="mt-3 text-[34px] font-semibold leading-tight tracking-tight">No “developer mode”. Every object has a plain face, a spec and its code.</h2>
              <p className="mt-5 text-[15.5px] leading-relaxed text-muted-foreground">
                Most builders split people into “technical” and “non-technical” and give each a different product. People don&apos;t work like that — an ops lead reads code when it matters, an engineer wants the plain summary when reviewing. So depth lives on each screen, agent and connection, not on the person.
              </p>
              <ul className="mt-6 space-y-2.5 text-[14px]">
                <li className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-read" />Plain: what it does, what it may do, what it costs.</li>
                <li className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-read" />Spec: the structured settings — change a permission with one click, free.</li>
                <li className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-read" />Code: the real files, in a real repo, with diffs between save points.</li>
              </ul>
            </div>
            <DepthDemo
              yaml={agentYaml(settlement, bp)}
              agent={{
                name: settlement.name,
                role: settlement.role,
                hue: settlement.avatarHue,
                plain: settlement.plain,
                supervision: `${SUPERVISION_LABEL[settlement.supervision].label}: ${SUPERVISION_LABEL[settlement.supervision].plain}`,
                rules: settlement.rules,
                tools: settlement.tools.map((t) => ({ name: t.name, where: connectionName(bp, t.connectionId), access: t.access, permission: PERMISSION_LABEL[t.permission] })),
              }}
            />
          </div>
        </section>

        {/* Frameworks */}
        <section id="frameworks" className="border-t border-hairline bg-panel/30">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-end">
              <div>
                <p className="micro-label text-amber">Any framework, honestly</p>
                <h2 className="mt-3 text-[34px] font-semibold leading-tight tracking-tight">The same agent in six frameworks — with a list of what doesn&apos;t translate.</h2>
              </div>
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                Agents are files in your repo (<span className="font-mono text-[13px] text-foreground/80">agent.yaml</span>, <span className="font-mono text-[13px] text-foreground/80">SOUL.md</span>, <span className="font-mono text-[13px] text-foreground/80">RULES.md</span>) plus runtime code for Lyzr ADK, LangGraph, CrewAI, OpenAI Agents SDK, Google ADK or Mastra. Permissions compile to each framework&apos;s own approval mechanism. Where one can&apos;t express something, we say so.
              </p>
            </div>
            <div className="mt-10">
              <FrameworkTabs items={frameworkItems} />
            </div>
          </div>
        </section>

        {/* Import + journey */}
        <section className="border-t border-hairline">
          <div className="mx-auto grid max-w-6xl gap-5 px-6 py-20 md:grid-cols-3">
            <Feature icon={FileSearch} title="Bring your existing project" body="Paste a GitHub URL. Architect reads the stack and any agents, shows what it understood and what it didn't, and signs House Rules — “never change the framework”, “never touch /legacy” — before it touches a file." />
            <Feature icon={GitPullRequest} title="Real repo, real review" body="Every Work Order lands on its own branch as a change for review. Two-way sync, CI rehearsals on every pull request, and “Open in Cursor or Claude Code” whenever you want the wheel." />
            <Feature icon={Undo2} title="Save points, not fear" body="Every change is a save point. Going back is always free, and your previous state is kept — so trying things costs nothing." />
            <Feature icon={Coins} title="Budgets, not surprises" body="A spending cap per project. Agents pause and tell you before passing it, and the live app shows what one conversation costs." />
            <Feature icon={ShieldCheck} title="Preflight before going live" body="Sign-in on, irreversible actions gated, rehearsals passing, keys in place, cap set, data region chosen. Warnings don't block; real risks do." />
            <Feature icon={UsersRound} title="Built for the handoff" body="Comments pinned on the preview. Requests that carry context. A plain-English changelog of what teammates changed, and why." />
          </div>
        </section>

        {/* Real vs simulated */}
        <section id="real" className="border-t border-hairline bg-panel/30">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <p className="micro-label text-amber">What&apos;s real in this prototype</p>
            <h2 className="mt-3 text-[34px] font-semibold leading-tight tracking-tight">Honest about the seams.</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <RealList
                title="Real"
                real
                items={[
                  "Google, GitHub and email sign-in; guest sessions you can keep",
                  "A Postgres database with row-level security on every table",
                  "Planning with Claude, streamed as it decides (starter plans offline)",
                  "Agent playground on Claude with a real approval gate",
                  "Work Orders, save points, restore, and diffs between them",
                  "Reading public GitHub repos and detecting stacks and agent frameworks",
                  "Generated code for six agent frameworks, and a public live URL",
                  "Spend meter from real token counts; budget caps",
                ]}
              />
              <RealList
                title="Simulated, and labelled in the product"
                items={[
                  "The build itself is a scripted timeline (the plan, code and data are real)",
                  "Rehearsal results and the repair moment follow a deterministic script",
                  "GitHub pushes, pull requests and CI are sandboxed",
                  "Vercel, VPC and custom-domain deploys; the live URL is real",
                  "Teammates resolving handoffs are simulated",
                  "Third-party connections run in sandbox mode",
                ]}
              />
            </div>
          </div>
        </section>

        <section className="border-t border-hairline">
          <div className="mx-auto flex max-w-6xl flex-col items-center px-6 py-24 text-center">
            <h2 className="font-display text-[44px] leading-tight">See it on a real project.</h2>
            <p className="mt-3 max-w-lg text-[15px] text-muted-foreground">A claims desk with three agents, a live URL, a caught mistake and a pending handoff. No account needed.</p>
            <Button asChild size="lg" className="mt-8 h-11 px-6 text-[14px]"><Link href="/demo">Open the demo <ArrowRight /></Link></Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-8 text-[12.5px] text-muted-foreground">
          <Logo />
          <span>Built by Aryan Saharan for Lyzr&apos;s Architect 2.0 brief.</span>
          <a href={REPO_URL} className="ml-auto inline-flex items-center gap-1.5 hover:text-foreground" target="_blank" rel="noreferrer"><GitHubMark /> Source &amp; product notes</a>
        </div>
      </footer>
    </div>
  );
}

function PromiseCard({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="panel flex flex-col rounded-2xl p-6">
      <h3 className="text-[17px] font-semibold leading-snug">{title}</h3>
      <p className="mt-2 flex-1 text-[14px] leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Feature({ icon: I, title, body }: { icon: typeof Check; title: string; body: string }) {
  return (
    <div className="panel rounded-2xl p-5">
      <I className="size-4 text-amber" />
      <h3 className="mt-3 text-[15px] font-semibold">{title}</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function RealList({ title, items, real }: { title: string; items: string[]; real?: boolean }) {
  return (
    <div className="panel rounded-2xl p-6">
      <p className={`flex items-center gap-2 text-[14px] font-semibold ${real ? "text-read" : "text-muted-foreground"}`}>
        {real ? <CircleDot className="size-4" /> : <X className="size-4" />}
        {title}
      </p>
      <ul className="mt-4 space-y-2.5">
        {items.map((i) => (
          <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed">
            <span className={`mt-2 size-1.5 shrink-0 rounded-full ${real ? "bg-read" : "bg-faint"}`} />
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}
