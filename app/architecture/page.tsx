import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Download, FileText, RotateCcw, ShieldAlert, Square } from "lucide-react";
import { Logo, GitHubMark } from "@/components/brand/logo";
import { ArchitectureDiagram, FLOWS } from "@/components/architecture/diagram";

export const metadata = {
  title: "Architecture",
  description: "How Prod AI runs in production: sandboxes, the agent harness, the model gateway, the preview proxy, GitHub, deployment and scale.",
};

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/aryansaharan/architect-2";

const SANDBOXES = [
  { name: "Firecracker microVMs", verdict: "Chosen", isolation: "Own kernel per project", boot: "~150 ms from snapshot", fit: "Runs Node and Python agents, real ports, persistent disk" },
  { name: "gVisor containers", verdict: "Fallback", isolation: "User-space kernel", boot: "~1 s", fit: "Good isolation, some syscall and I/O overhead" },
  { name: "Plain Docker", verdict: "Rejected", isolation: "Shared host kernel", boot: "~1 s", fit: "One escape reaches every tenant" },
  { name: "Browser WebContainers", verdict: "Rejected", isolation: "Browser tab", boot: "Instant", fit: "Node only: no Python agents, no long-running jobs" },
];

const TODAY: { part: string; today: string; prod: string; real: boolean }[] = [
  { part: "Studio, auth, data", today: "Next.js 16 on Vercel, Supabase Auth (Google, email, guest sessions you can keep), Postgres with row-level security on every table", prod: "The studio backend runs in each regional cell (service identities, residency, long-lived streams); Vercel keeps the marketing site. Plus SAML SSO, SCIM and regional data residency", real: true },
  { part: "Planner", today: "Claude plans a structured Blueprint, streamed live; code expands it deterministically and validates every reference", prod: "Same contract, routed through the model gateway", real: true },
  { part: "Model gateway", today: "One getModel() seam, provider switch by env, per-call token and cost metering, daily budgets per person", prod: "Multi-provider routing, failover, BYOK, prompt caching", real: true },
  { part: "Agent gateway", today: "Real approval gates in the playground: tools marked “Ask first” pause for a person before running", prod: "Every production tool call, with caps, audit and traces", real: true },
  { part: "Build + repair", today: "Deterministic build timeline with a real repair decision that changes the Blueprint and creates a save point", prod: "Full tool loop inside microVMs with verifier and budgets", real: false },
  { part: "Sandbox + preview", today: "Preview renders the Blueprint with a spec renderer inside the studio; no untrusted code runs", prod: "Firecracker microVM per project behind the preview proxy", real: false },
  { part: "GitHub", today: "Reads any public repo, detects stack and agent frameworks, writes House Rules; pushes and PRs are sandboxed", prod: "GitHub App with branch per Work Order and two-way sync", real: false },
  { part: "Deploy", today: "Prod Cloud live URL is real (/live/…) with rollback; Vercel and VPC targets are sandboxed", prod: "Immutable releases, canary rollout, instant rollback", real: true },
];

const NUMBERS = [
  { k: "5,000", v: "people in the studio at once" },
  { k: "~1,500", v: "sandboxes awake (30% active, the rest snapshotted)" },
  { k: "~150 ms", v: "resume from a warm snapshot" },
  { k: "≤ 3", v: "repair attempts before a person is asked" },
];

export default async function ArchitecturePage(props: PageProps<"/architecture">) {
  const sp = await props.searchParams;
  const print = sp.print === "1";
  return (
    <div className="relative min-h-screen overflow-x-clip">
      {!print && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[640px] overflow-hidden">
            <div className="solstice-orb -left-[8%] -top-[70%] h-[720px] w-[720px] opacity-[0.26]" />
            <div className="solstice-orb -right-[10%] -top-[60%] h-[560px] w-[560px] opacity-[0.16] [animation-direction:reverse] [animation-duration:40s]" />
          </div>
          <header className="sticky top-0 z-30 bg-canvas/75 backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-4 px-6">
              <Logo />
              <span className="text-hairline-hi">/</span>
              <span className="text-[13px] text-muted-foreground">Architecture</span>
              <div className="ml-auto flex items-center gap-2">
                <a href={`${REPO_URL}/blob/main/ARCHITECTURE.md`} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:text-foreground sm:inline-flex"><FileText className="size-3.5" /> ARCHITECTURE.md</a>
                <Link href="/" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Product</Link>
              </div>
            </div>
            <div className="solstice-line" aria-hidden />
          </header>
        </>
      )}

      <main id="main" className="relative mx-auto max-w-[1320px] px-6 pb-24 pt-12">
        <p className="micro-label fade-up text-amber">Technical architecture · production design</p>
        <h1 className="fade-up mt-3 max-w-4xl font-display text-[52px] leading-[1.02] tracking-tight" style={{ animationDelay: "80ms" }}>
          How Prod AI runs <em className="text-solstice">in production.</em>
        </h1>
        <p className="fade-up mt-4 max-w-3xl text-[15px] leading-relaxed text-muted-foreground" style={{ animationDelay: "160ms" }}>
          Five planes with one job each. The control plane decides, sandboxes run untrusted code, the runtime serves live apps, and every model call and every agent action passes a
          gateway that can price it, cap it or ask a person first. The prototype you can click today implements the product surface of this design; the table at the end says exactly which parts are real.
        </p>

        <div className="fade-up mt-4 flex flex-wrap gap-2" style={{ animationDelay: "220ms" }}>
          <a href="/docs/architecture-diagram.png" download className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline bg-panel px-3 text-[12.5px] hover:border-hairline-hi"><Download className="size-3.5" /> Diagram (PNG)</a>
          <a href="/docs/architecture.pdf" download className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline bg-panel px-3 text-[12.5px] hover:border-hairline-hi"><Download className="size-3.5" /> Diagram + notes (PDF)</a>
          <a href={`${REPO_URL}/blob/main/ARCHITECTURE.md`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline bg-panel px-3 text-[12.5px] hover:border-hairline-hi"><GitHubMark className="size-3.5" /> Full write-up</a>
        </div>

        <section aria-label="Architecture diagram" className="fade-up mt-8 overflow-x-auto rounded-2xl border border-hairline bg-canvas p-2 shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9),0_0_90px_-50px_rgb(63_224_197/0.35)]" style={{ animationDelay: "280ms" }}>
          <div className="min-w-[1100px]">
            <ArchitectureDiagram animated={!print} />
          </div>
        </section>

        <section aria-labelledby="flows" className="mt-10">
          <h2 id="flows" className="micro-label">The eight flows on the diagram</h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FLOWS.map((f) => (
              <li key={f.n} className="panel rounded-xl p-4">
                <p className="flex items-center gap-2 text-[13.5px] font-semibold">
                  <span className="bg-solstice grid size-6 place-items-center rounded-full text-[12px] font-bold text-[#0b1402]">{f.n}</span>
                  {f.title}
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{f.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="harness" className="mt-14 grid gap-8 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <p className="micro-label text-amber">The agent harness</p>
            <h2 id="harness" className="mt-2 text-[28px] font-semibold leading-tight tracking-tight">Plan, act, verify, repair. With a budget and a way out.</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
              The model decides; deterministic code does the rest. The planner writes a Blueprint (structured JSON), code generation turns it into files, and a tool loop edits, runs and
              tests inside the sandbox. A verifier gates every step. When a check fails, the repairer tries a fix, but only within a step and cost budget. The same error twice means a doom
              loop: it stops, rolls back to the last save point and hands the problem to a person with the full context. Our own fixes are never billed.
            </p>
          </div>
          <div className="panel rounded-2xl p-5">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { t: "Plan", s: "Blueprint + Work Order, priced before anything runs" },
                { t: "Act", s: "Tools in the sandbox: edit, run, install, test, browse" },
                { t: "Verify", s: "Types, lint, tests, agent rehearsals, preview smoke" },
                { t: "Save point", s: "Checkpoint, branch commit, streamed to the studio" },
              ].map((x, i) => (
                <div key={x.t} className="relative">
                  <div className="rounded-xl border border-hairline bg-deep p-3">
                    <p className="text-[13px] font-semibold">{x.t}</p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{x.s}</p>
                  </div>
                  {i < 3 && <ArrowRight className="absolute -right-2.5 top-1/2 z-[1] size-4 -translate-y-1/2 text-sol-ember" />}
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-fix/30 bg-fix/[0.06] p-3">
                <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-fix"><RotateCcw className="size-3.5" /> Repair</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Verifier fails: propose a fix with its blast radius. Free, labelled “Our fix”.</p>
              </div>
              <div className="rounded-xl border border-ask/30 bg-ask/[0.06] p-3">
                <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ask"><ShieldAlert className="size-3.5" /> Doom-loop stop</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Same error signature twice, or 3 attempts: stop, roll back, ask a person.</p>
              </div>
              <div className="rounded-xl border border-hairline bg-deep p-3">
                <p className="flex items-center gap-1.5 text-[12.5px] font-medium"><Square className="size-3.5" /> Stop any time</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">A person can stop a run; unused credits are refunded automatically.</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="sandbox" className="mt-14">
          <p className="micro-label text-amber">Sandboxing</p>
          <h2 id="sandbox" className="mt-2 text-[28px] font-semibold tracking-tight">One microVM per project, because the code is untrusted.</h2>
          <div className="panel mt-5 overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="border-b border-hairline text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-4 py-3 font-medium">Option</th><th className="px-4 py-3 font-medium">Verdict</th><th className="px-4 py-3 font-medium">Isolation</th><th className="px-4 py-3 font-medium">Start</th><th className="px-4 py-3 font-medium">Fit for agentic apps</th></tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {SANDBOXES.map((s) => (
                  <tr key={s.name}>
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3"><span className={s.verdict === "Chosen" ? "rounded-full border border-read/30 bg-read/10 px-2 py-0.5 text-[11.5px] text-read" : s.verdict === "Fallback" ? "rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-[11.5px] text-amber" : "rounded-full border border-hairline px-2 py-0.5 text-[11.5px] text-muted-foreground"}>{s.verdict}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{s.isolation}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.boot}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.fit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="scale" className="mt-14">
          <p className="micro-label text-amber">Scale</p>
          <h2 id="scale" className="mt-2 text-[28px] font-semibold tracking-tight">Thousands of people at once, without thousands of idle machines.</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {NUMBERS.map((n) => (
              <div key={n.k} className="panel rounded-xl p-4">
                <p className="text-solstice text-[30px] font-semibold tabular-nums tracking-tight">{n.k}</p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">{n.v}</p>
              </div>
            ))}
          </div>
          <ul className="mt-5 grid gap-2 text-[13.5px] text-muted-foreground md:grid-cols-2">
            {[
              "The control plane is stateless; long work lives in durable workflows, so a pod restart never loses a build.",
              "Sandboxes suspend to a snapshot after 10 idle minutes and resume in about 150 ms from a warm pool.",
              "The model gateway queues by priority per provider and key, fails over between providers, and caches prompts.",
              "Events fan out over NATS; Postgres uses row-level security, read replicas and partitioned event tables.",
            ].map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-read" />{t}</li>)}
          </ul>
        </section>

        <section aria-labelledby="today" className="mt-14">
          <p className="micro-label text-amber">Honest about the seams</p>
          <h2 id="today" className="mt-2 text-[28px] font-semibold tracking-tight">What the prototype runs today, and what production adds.</h2>
          <div className="panel mt-5 overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead className="border-b border-hairline text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-4 py-3 font-medium">Part</th><th className="px-4 py-3 font-medium">In the live prototype</th><th className="px-4 py-3 font-medium">In production</th></tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {TODAY.map((r) => (
                  <tr key={r.part} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.part}</p>
                      <span className={r.real ? "mt-1 inline-block rounded-full border border-read/30 bg-read/10 px-2 py-px text-[11px] text-read" : "mt-1 inline-block rounded-full border border-hairline px-2 py-px text-[11px] text-muted-foreground"}>{r.real ? "Real" : "Simulated, labelled"}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.today}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.prod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-14 text-[13px] text-muted-foreground">
          Service by service reasoning, the sequence diagrams and the prototype-to-production map are in{" "}
          <a className="text-foreground underline decoration-dotted underline-offset-4" href={`${REPO_URL}/blob/main/ARCHITECTURE.md`} target="_blank" rel="noreferrer">ARCHITECTURE.md</a>.
        </p>
      </main>
    </div>
  );
}
