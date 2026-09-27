import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Download, ExternalLink, FileText, RotateCcw, ShieldAlert, Square } from "lucide-react";
import { Logo, GitHubMark } from "@/components/brand/logo";
import { ArchitectureDiagram, FLOWS, W as DIAGRAM_W } from "@/components/architecture/diagram";

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

/** How much of each part runs in the live prototype. "Stand-in" is simulated or sandboxed and labelled in the product; "designed" is specified in ARCHITECTURE.md and not built. */
type Status = "real" | "stand-in" | "designed";
const STATUS_STYLE: Record<Status, string> = {
  real: "border-read/30 bg-read/[0.08] text-read",
  "stand-in": "border-hairline-hi bg-deep text-foreground/80",
  designed: "border-dashed border-[#bdb5a5] bg-transparent text-muted-foreground",
};

const VERDICT_STYLE: Record<string, string> = {
  Chosen: "border-read/30 bg-read/[0.08] text-read",
  Fallback: "border-hairline-hi bg-deep text-foreground/80",
  Rejected: "border-hairline text-muted-foreground",
};

const CHIP = "inline-block whitespace-nowrap rounded-full border px-2 py-px text-[11px] font-medium";
const LINK_CHIP = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline-hi bg-raised px-3 text-[12.5px] text-foreground transition-colors hover:border-[#c9c1b1] hover:bg-secondary";

const TODAY: { part: string; status: { label: string; kind: Status }[]; today: string; prod: string }[] = [
  {
    part: "Studio, auth, data",
    status: [{ label: "Real", kind: "real" }],
    today: "Next.js 16 on Vercel, Supabase Auth (Google, email, guest sessions you can keep), Postgres with row-level security on every table",
    prod: "The studio backend runs in each regional cell (service identities, residency, long-lived streams); Vercel keeps the marketing site. Plus SAML SSO, SCIM and regional data residency",
  },
  {
    part: "Planner",
    status: [{ label: "Real", kind: "real" }],
    today: "Claude plans a structured Blueprint, streamed live; code expands it deterministically and validates every reference",
    prod: "Same contract, routed through the model gateway",
  },
  {
    part: "Change requests",
    status: [{ label: "Real", kind: "real" }],
    today: "Claude returns typed edits; code resolves names and emits validated operations, with one self-repair retry; each change is a priced Work Order and a save point",
    prod: "Same, executed by the harness in a sandbox; parallel Work Orders rebase onto a versioned Blueprint",
  },
  {
    part: "Model gateway",
    status: [
      { label: "Model switch by environment: real", kind: "real" },
      { label: "Routing gateway: designed", kind: "designed" },
    ],
    today: "One getModel() seam that picks the model from the environment, with per-call token and cost metering and daily budgets per person. One provider (Anthropic) and no gateway service",
    prod: "A gateway service: routing by task, eval-gated switches, failover in the middle of a tool loop, prompt caching, BYOK, and a separate deployment for live apps",
  },
  {
    part: "Approvals and the agent gateway",
    status: [
      { label: "Approval gate in the playground: real", kind: "real" },
      { label: "Production gateway: designed", kind: "designed" },
    ],
    today: "Claude + AI SDK tool approval: tools marked “Ask first” pause for a person before running. Tools run on sandboxed sample data; nothing holds credentials or controls egress yet",
    prod: "Every production tool call passes an egress gateway that holds the credentials, enforces approvals and caps, tracks untrusted content per run, and traces the call",
  },
  {
    part: "Build + repair",
    status: [
      { label: "Build: simulated, labelled", kind: "stand-in" },
      { label: "Repair decision: real", kind: "real" },
    ],
    today: "Deterministic build timeline with a real repair decision that changes the Blueprint and creates a save point",
    prod: "Full tool loop inside microVMs with verifier and budgets",
  },
  {
    part: "Sandbox + preview",
    status: [{ label: "Simulated, labelled", kind: "stand-in" }],
    today: "Preview renders the Blueprint with a spec renderer inside the studio; no generated or imported code runs",
    prod: "Firecracker microVM per project behind the preview proxy; imported repos run as themselves, with a preview per exposed port",
  },
  {
    part: "GitHub",
    status: [
      { label: "Public repo analysis: real", kind: "real" },
      { label: "Pushes, PRs, sync: sandboxed", kind: "stand-in" },
    ],
    today: "Reads any public repo, detects stack and agent frameworks, maps its agents, writes House Rules; pushes and PRs are sandboxed",
    prod: "GitHub App with a branch and worktree per Work Order, a merge queue and two-way sync",
  },
  {
    part: "Deploy",
    status: [
      { label: "Public /live URL + rollback: real", kind: "real" },
      { label: "Builds and releases: designed", kind: "designed" },
    ],
    today: "A public /live/… URL serves a published Blueprint snapshot through the spec renderer, with rollback. No build runs; Vercel and VPC targets are sandboxed",
    prod: "Immutable releases, canary rollout, instant rollback",
  },
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
          <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/95">
            <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-4 px-6">
              <Logo />
              <span className="text-[#c9c1b1]">/</span>
              <span className="font-sketch text-[14px] text-muted-foreground">Architecture</span>
              <div className="ml-auto flex items-center gap-2">
                <a href={`${REPO_URL}/blob/main/ARCHITECTURE.md`} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:text-foreground sm:inline-flex"><FileText className="size-3.5" /> ARCHITECTURE.md</a>
                <Link href="/" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Product</Link>
              </div>
            </div>
          </header>
        </>
      )}

      <main id="main" className="relative mx-auto max-w-[1320px] px-6 pb-24 pt-12">
        <p className="micro-label fade-up text-brand">Technical architecture · production design</p>
        <h1 className="fade-up mt-3 max-w-4xl font-display text-[48px] leading-[0.98] sm:text-[66px]" style={{ animationDelay: "80ms" }}>
          How Prod AI runs <em className="pencil-underline">in production.</em>
        </h1>
        <p className="fade-up mt-4 max-w-3xl text-[15px] leading-relaxed text-muted-foreground" style={{ animationDelay: "160ms" }}>
          Five planes with one job each. The control plane decides, sandboxes run untrusted code, the runtime serves live apps, and every model call and every agent action passes a
          gateway that can price it, cap it or ask a person first. The prototype you can click today implements the product surface of this design; the table at the end says exactly which parts are real.
        </p>

        <div className="fade-up mt-4 flex flex-wrap gap-2" style={{ animationDelay: "220ms" }}>
          <a href="/docs/architecture-diagram.png" download className={LINK_CHIP}><Download className="size-3.5" /> Diagram (PNG)</a>
          <a href="/docs/architecture.pdf" download className={LINK_CHIP}><Download className="size-3.5" /> Diagram + notes (PDF)</a>
          <a href={`${REPO_URL}/blob/main/ARCHITECTURE.md`} target="_blank" rel="noreferrer" className={LINK_CHIP}><GitHubMark className="size-3.5" /> Full write-up</a>
        </div>

        {/* Shown at its native width so every label stays readable: it breaks out of the page column on wide screens and scrolls sideways on narrower ones. */}
        <div className="relative left-1/2 mt-8 -translate-x-1/2" style={{ width: `min(100vw - 3rem, ${DIAGRAM_W + 18}px)` }}>
          {!print && (
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12.5px] text-muted-foreground">
              <p>Shown at native size ({DIAGRAM_W.toLocaleString("en-US")} px wide). On a narrower screen, scroll sideways.</p>
              <a href="/docs/architecture-diagram.png" target="_blank" rel="noreferrer" className={`ml-auto ${LINK_CHIP}`}>
                <ExternalLink className="size-3.5" /> Open full size
              </a>
            </div>
          )}
          {/* The diagram stays a dark blueprint plate: mounted on white card like a figure in a report, with its caption underneath. */}
          <figure aria-label="Architecture diagram" className="fade-up rounded-2xl border border-hairline-hi bg-raised p-2.5 shadow-[0_1px_2px_rgb(26_26_23/0.05),0_28px_60px_-34px_rgb(26_26_23/0.30)]" style={{ animationDelay: "280ms" }}>
            <div className="overflow-x-auto rounded-xl bg-[#060a09] ring-1 ring-[#1a1a17]/15">
              <div style={{ width: DIAGRAM_W }}>
                <ArchitectureDiagram animated={!print} />
              </div>
            </div>
            <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2 pb-1 pt-3">
              <span className="font-pencil text-[24px] leading-none text-foreground">Fig. 1</span>
              <span className="text-[13px] text-muted-foreground">Five planes, one job each: control, sandboxes, runtime, data and the gateways every model call and agent action passes. Numbers mark the eight flows below.</span>
            </figcaption>
          </figure>
        </div>

        <section aria-labelledby="flows" className="mt-10">
          <h2 id="flows" className="font-display text-[36px] leading-none">The eight flows on the diagram</h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FLOWS.map((f) => (
              <li key={f.n} className="panel rounded-xl p-4">
                <p className="flex items-center gap-2 text-[13.5px] font-semibold">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-[12px] font-bold text-primary-foreground">{f.n}</span>
                  {f.title}
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{f.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="harness" className="mt-14 grid gap-8 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <p className="micro-label text-brand">The agent harness</p>
            <h2 id="harness" className="mt-2 font-display text-[40px] leading-[1.02]">Plan, act, verify, repair. With a budget and a way out.</h2>
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
                  <div className="h-full rounded-xl border border-hairline bg-canvas p-3">
                    <p className="font-sketch text-[14px] font-semibold">{x.t}</p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{x.s}</p>
                  </div>
                  {i < 3 && <ArrowRight className="absolute -right-2.5 top-1/2 z-[1] size-4 -translate-y-1/2 rounded-full bg-raised text-brand" />}
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-fix/25 bg-fix/[0.05] p-3">
                <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-fix"><RotateCcw className="size-3.5" /> Repair</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Verifier fails: propose a fix with its blast radius. Free, labelled “Our fix”.</p>
              </div>
              <div className="rounded-xl border border-ask/25 bg-ask/[0.05] p-3">
                <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ask"><ShieldAlert className="size-3.5" /> Doom-loop stop</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Same error signature twice, or 3 attempts: stop, roll back, ask a person.</p>
              </div>
              <div className="rounded-xl border border-hairline bg-canvas p-3">
                <p className="flex items-center gap-1.5 text-[12.5px] font-medium"><Square className="size-3.5" /> Stop any time</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">A person can stop a run; unused credits are refunded automatically.</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="sandbox" className="mt-14">
          <p className="micro-label text-brand">Sandboxing</p>
          <h2 id="sandbox" className="mt-2 font-display text-[40px] leading-[1.02]">One microVM per project, because the code is untrusted.</h2>
          <div className="panel mt-5 overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="border-b border-hairline bg-canvas/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-4 py-3 font-medium">Option</th><th className="px-4 py-3 font-medium">Verdict</th><th className="px-4 py-3 font-medium">Isolation</th><th className="px-4 py-3 font-medium">Start</th><th className="px-4 py-3 font-medium">Fit for agentic apps</th></tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {SANDBOXES.map((s) => (
                  <tr key={s.name}>
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3"><span className={`${CHIP} ${VERDICT_STYLE[s.verdict]}`}>{s.verdict}</span></td>
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
          <p className="micro-label text-brand">Scale</p>
          <h2 id="scale" className="mt-2 font-display text-[40px] leading-[1.02]">Thousands of people at once, without thousands of idle machines.</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {NUMBERS.map((n) => (
              <div key={n.k} className="panel rounded-xl p-4">
                <p className="font-display text-[40px] leading-none text-brand">{n.k}</p>
                <p className="mt-2 text-[12.5px] text-muted-foreground">{n.v}</p>
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
          <p className="micro-label text-brand">Honest about the seams</p>
          <h2 id="today" className="mt-2 font-display text-[40px] leading-[1.02]">What the prototype runs today, and what production adds.</h2>
          <p className="mt-3 max-w-3xl text-[13.5px] leading-relaxed text-muted-foreground">
            <span className={`${CHIP} ${STATUS_STYLE.real}`}>Real</span> runs in the live prototype. <span className={`${CHIP} ${STATUS_STYLE["stand-in"]}`}>Stand-in</span> is simulated or sandboxed, and
            labelled in the product. <span className={`${CHIP} ${STATUS_STYLE.designed}`}>Designed</span> is specified in ARCHITECTURE.md and not built yet.
          </p>
          <div className="panel mt-5 overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead className="border-b border-hairline bg-canvas/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="w-[272px] px-4 py-3 font-medium">Part</th><th className="px-4 py-3 font-medium">In the live prototype</th><th className="px-4 py-3 font-medium">In production</th></tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {TODAY.map((r) => (
                  <tr key={r.part} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.part}</p>
                      <div className="mt-1.5 flex flex-col items-start gap-1">
                        {r.status.map((st) => (
                          <span key={st.label} className={`${CHIP} ${STATUS_STYLE[st.kind]}`}>{st.label}</span>
                        ))}
                      </div>
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
