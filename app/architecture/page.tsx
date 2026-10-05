import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Download, ExternalLink, FileText, RotateCcw, ShieldAlert, Square } from "lucide-react";
import { Logo, GitHubMark } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { Pill, type PillTone } from "@/components/ui/pill";
import { ArchitectureDiagram, FLOWS, W as DIAGRAM_W } from "@/components/architecture/diagram";
import { cn } from "@/lib/utils";

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
/** Real is live, so it takes ok; a stand-in is plain ink; designed is not built yet, so it is drawn in dashed pencil. */
const STATUS_PILL: Record<Status, { tone: PillTone; className?: string }> = {
  real: { tone: "ok" },
  "stand-in": { tone: "neutral", className: "text-foreground" },
  designed: { tone: "neutral", className: "border-dashed bg-transparent" },
};

/** The chosen option is the selection, so it takes brand; the rest are neutral. */
const VERDICT_PILL: Record<string, { tone: PillTone; className?: string }> = {
  Chosen: { tone: "brand" },
  Fallback: { tone: "neutral", className: "text-foreground" },
  Rejected: { tone: "neutral" },
};

/* The wrapping span carries the pill's size: cn() currently drops Pill's own text-badge when a text colour follows it. */
function StatusPill({ kind, children }: { kind: Status; children: React.ReactNode }) {
  return <span className="inline-flex align-middle text-badge"><Pill tone={STATUS_PILL[kind].tone} className={STATUS_PILL[kind].className}>{children}</Pill></span>;
}

function VerdictPill({ verdict }: { verdict: string }) {
  return <span className="inline-flex text-badge"><Pill tone={VERDICT_PILL[verdict].tone} className={VERDICT_PILL[verdict].className}>{verdict}</Pill></span>;
}

const TODAY: { part: string; status: { label: string; kind: Status }[]; today: string; prod: string }[] = [
  {
    part: "Studio, auth, data",
    status: [{ label: "Real", kind: "real" }],
    today: "Next.js 16 on Vercel Hobby, Supabase Auth (Google, email link, guest sessions you can keep), Postgres with row-level security on every table. One server-only admin connection writes only the rows people must not: the spend meter, rate limits, budget holds, published sites, abuse reports and published apps' records",
    prod: "The studio backend runs in each regional cell (service identities, residency, long-lived streams); Vercel keeps the marketing site. Plus SAML SSO, SCIM and regional data residency",
  },
  {
    part: "Planner",
    status: [{ label: "Real", kind: "real" }],
    today: "Claude plans a structured Blueprint, streamed live; code expands it deterministically and validates every reference. Guests start from a starter plan",
    prod: "Same contract, routed through the model gateway",
  },
  {
    part: "Change requests",
    status: [{ label: "Real", kind: "real" }],
    today: "Claude returns typed edits; code resolves names and emits validated operations, with one self-repair retry; each change has a fixed price, Apply and Undo, and makes a new version",
    prod: "Same, executed by the harness in a sandbox; parallel Work Orders rebase onto a versioned Blueprint",
  },
  {
    part: "Model gateway",
    status: [
      { label: "Model switch and budgets: real", kind: "real" },
      { label: "Routing gateway: designed", kind: "designed" },
    ],
    today: "One getModel() seam that picks the model from the environment. Every call passes a rate limit and holds its cost against per-person and site-wide 24-hour budgets; failed calls are metered too. One provider (Anthropic) and no gateway service",
    prod: "A gateway service: routing by task, eval-gated switches, failover in the middle of a tool loop, prompt caching, BYOK, and a separate deployment for live apps",
  },
  {
    part: "Approvals and the agent gateway",
    status: [
      { label: "Approval gates: real", kind: "real" },
      { label: "Production gateway: designed", kind: "designed" },
    ],
    today: "Claude + AI SDK tool approval, signed by the server: tools marked “Ask first” pause for a person. Try it runs on sample data; helpers in published apps work on that app's records and send email only after a person says yes. Other outside connections aren't real yet, and nothing holds credentials or controls egress",
    prod: "Every production tool call passes an egress gateway that holds the credentials, enforces approvals and caps, tracks untrusted content per run, and traces the call",
  },
  {
    part: "Build + repair",
    status: [
      { label: "Build: simulated, labelled", kind: "stand-in" },
      { label: "Repair decision: real", kind: "real" },
    ],
    today: "A deterministic build animation with a real repair decision that changes the Blueprint and makes a new version. No generated code runs",
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
    part: "Deploy and published apps",
    status: [
      { label: "Public /live URL, records, rollback: real", kind: "real" },
      { label: "Builds and releases: designed", kind: "designed" },
    ],
    today: "A public /live/… URL renders a published Blueprint snapshot, with rollback, real records (up to 2,000 per app, with undo) and team screens for invited people. No build runs; Vercel and VPC targets are sandboxed",
    prod: "Immutable releases, canary rollout, instant rollback, and a database per app",
  },
];

const NUMBERS = [
  { k: "5,000", v: "people in the studio at once" },
  { k: "~1,500", v: "sandboxes awake (30% active, the rest snapshotted)" },
  { k: "~150 ms", v: "resume from a warm snapshot" },
  { k: "≤ 3", v: "repair attempts before a person is asked" },
];

const HARNESS_STEPS = [
  { t: "Plan", s: "Blueprint + Work Order, priced before anything runs" },
  { t: "Act", s: "Tools in the sandbox: edit, run, install, test, browse" },
  { t: "Verify", s: "Types, lint, tests, agent rehearsals, preview smoke" },
  { t: "Save point", s: "Checkpoint, branch commit, streamed to the studio" },
];

const SCALE_NOTES = [
  "The control plane is stateless; long work lives in durable workflows, so a pod restart never loses a build.",
  "Sandboxes suspend to a snapshot after 10 idle minutes and resume in about 150 ms from a warm pool.",
  "The model gateway queues by priority per provider and key, fails over between providers, and caches prompts.",
  "Events fan out over NATS; Postgres uses row-level security, read replicas and partitioned event tables.",
];

/** A section's eyebrow and pencil heading, the way the Sheet writes them. */
function SectionHead({ id, eyebrow, children }: { id: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <>
      {eyebrow && <p className="font-sketch text-sketch text-muted-foreground">{eyebrow}</p>}
      <h2 id={id} className={`font-pencil text-section text-foreground${eyebrow ? " mt-1" : ""}`}>{children}</h2>
    </>
  );
}

const TH = "px-4 py-2.5 font-semibold";

export default async function ArchitecturePage(props: PageProps<"/architecture">) {
  const sp = await props.searchParams;
  const print = sp.print === "1";
  return (
    <div className="relative min-h-screen overflow-x-clip">
      {!print && (
        <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/95">
          <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-3 px-4 sm:gap-4 sm:px-6">
            <Logo />
            <span aria-hidden className="text-line-strong">/</span>
            <span className="font-sketch text-sketch text-muted-foreground">Architecture</span>
            <nav aria-label="Page links" className="ml-auto flex items-center gap-1">
              <a href={`${REPO_URL}/blob/main/ARCHITECTURE.md`} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground max-sm:hidden")}>
                <FileText aria-hidden /> ARCHITECTURE.md
              </a>
              <Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}>
                <ArrowLeft aria-hidden /> Product
              </Link>
            </nav>
          </div>
        </header>
      )}

      <main id="main" className="relative mx-auto max-w-[1320px] px-4 pb-24 pt-10 sm:px-6 sm:pt-12">
        <p className="fade-up font-sketch text-sketch text-muted-foreground">Technical architecture · production design</p>
        <h1 className="fade-up mt-1 max-w-4xl font-pencil text-title text-foreground" style={{ animationDelay: "80ms" }}>
          How Prod AI runs in <em className="pencil-underline">production.</em>
        </h1>
        <p className="fade-up mt-4 max-w-3xl text-lead text-muted-foreground" style={{ animationDelay: "160ms" }}>
          Five planes with one job each. The control plane decides, sandboxes run untrusted code, the runtime serves live apps, and every model call and every agent action passes a
          gateway that can price it, cap it or ask a person first. The prototype you can click today implements the product surface of this design; the table at the end says exactly which parts are real.
        </p>

        <div className="fade-up mt-5 flex flex-wrap gap-2" style={{ animationDelay: "220ms" }}>
          <a href="/docs/architecture-diagram.png" download className={buttonVariants({ variant: "outline" })}><Download aria-hidden /> Diagram (PNG)</a>
          <a href="/docs/architecture.pdf" download className={buttonVariants({ variant: "outline" })}><Download aria-hidden /> Diagram + notes (PDF)</a>
          <a href={`${REPO_URL}/blob/main/ARCHITECTURE.md`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}><GitHubMark className="size-3.5" /> Full write-up</a>
        </div>

        {/* Shown at its native width so every label stays readable: it breaks out of the page column on wide screens and scrolls sideways inside its frame on narrower ones. */}
        <div className="relative left-1/2 mt-8 -translate-x-1/2 [--gutter:2rem] sm:[--gutter:3rem]" style={{ width: `min(100vw - var(--gutter), ${DIAGRAM_W + 2}px)` }}>
          {!print && (
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
              <p className="text-meta text-muted-foreground">Shown at native size ({DIAGRAM_W.toLocaleString("en-US")} px wide). On a narrower screen, scroll sideways.</p>
              <a href="/docs/architecture-diagram.png" target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-auto")}>
                <ExternalLink aria-hidden /> Open full size
              </a>
            </div>
          )}
          {/* A figure in a report: the pencil drawing on its own sheet, with its caption underneath. */}
          <figure aria-label="Architecture diagram" className="fade-up panel overflow-hidden rounded-md" style={{ animationDelay: "280ms" }}>
            <div className="overflow-x-auto">
              <div style={{ width: DIAGRAM_W }}>
                <ArchitectureDiagram animated={!print} />
              </div>
            </div>
            <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-hairline px-4 py-3">
              <span className="font-pencil text-note text-foreground">Fig. 1</span>
              <span className="text-meta text-muted-foreground">Five planes, one job each: control, sandboxes, runtime, data and the gateways every model call and agent action passes. Numbers mark the eight flows below.</span>
            </figcaption>
          </figure>
        </div>

        <section aria-labelledby="flows" className="mt-12">
          <SectionHead id="flows">The eight flows on the diagram</SectionHead>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FLOWS.map((f) => (
              <li key={f.n} className="panel rounded-md p-4">
                <p className="flex items-center gap-2 text-body font-semibold text-foreground">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] border-foreground bg-raised text-meta font-bold tabular-nums">{f.n}</span>
                  {f.title}
                </p>
                <p className="mt-2 text-body text-muted-foreground">{f.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="harness" className="mt-14 grid gap-6 lg:grid-cols-[1fr_1.3fr] lg:gap-8">
          <div>
            <SectionHead id="harness" eyebrow="The agent harness">Plan, act, verify, repair. With a budget and a way out.</SectionHead>
            <p className="mt-3 text-body text-muted-foreground">
              The model decides; deterministic code does the rest. The planner writes a Blueprint (structured JSON), code generation turns it into files, and a tool loop edits, runs and
              tests inside the sandbox. A verifier gates every step. When a check fails, the repairer tries a fix, but only within a step and cost budget. The same error twice means a doom
              loop: it stops, rolls back to the last save point and hands the problem to a person with the full context. Our own fixes are never billed.
            </p>
          </div>
          <div className="panel rounded-md p-4 sm:p-5">
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {HARNESS_STEPS.map((x, i) => (
                <li key={x.t} className="relative">
                  <div className="sketch h-full border bg-raised p-3">
                    <p className="font-sketch text-sketch text-foreground">{x.t}</p>
                    <p className="mt-1 text-meta text-muted-foreground">{x.s}</p>
                  </div>
                  {i < HARNESS_STEPS.length - 1 && <ArrowRight aria-hidden className="absolute -right-2.5 top-1/2 z-[1] size-4 -translate-y-1/2 rounded-full bg-panel text-foreground max-sm:hidden" />}
                </li>
              ))}
            </ol>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-fix/30 bg-panel p-3">
                <p className="flex items-center gap-1.5 text-ui font-semibold text-fix"><RotateCcw aria-hidden className="size-3.5" /> Repair</p>
                <p className="mt-1 text-meta text-muted-foreground">Verifier fails: propose a fix with its blast radius. Free, labelled “Our fix”.</p>
              </div>
              <div className="rounded-md border border-hairline-hi bg-panel p-3">
                <p className="flex items-center gap-1.5 text-ui font-semibold text-foreground"><ShieldAlert aria-hidden className="size-3.5" /> Doom-loop stop</p>
                <p className="mt-1 text-meta text-muted-foreground">Same error signature twice, or 3 attempts: stop, roll back, ask a person.</p>
              </div>
              <div className="rounded-md border border-hairline-hi bg-panel p-3">
                <p className="flex items-center gap-1.5 text-ui font-semibold text-foreground"><Square aria-hidden className="size-3.5" /> Stop any time</p>
                <p className="mt-1 text-meta text-muted-foreground">A person can stop a run; unused credits are refunded automatically.</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="sandbox" className="mt-14">
          <SectionHead id="sandbox" eyebrow="Sandboxing">One microVM per project, because the code is untrusted.</SectionHead>
          <div className="panel mt-5 hidden overflow-x-auto rounded-md md:block">
            <table className="w-full text-left text-body">
              <thead className="border-b border-hairline bg-deep/50 text-meta text-muted-foreground">
                <tr><th className={TH}>Option</th><th className={TH}>Verdict</th><th className={TH}>Isolation</th><th className={TH}>Start</th><th className={TH}>Fit for agentic apps</th></tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {SANDBOXES.map((s) => (
                  <tr key={s.name} className="align-top">
                    <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                    <td className="px-4 py-3"><VerdictPill verdict={s.verdict} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{s.isolation}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{s.boot}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.fit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* On a phone the table becomes one short card per option, so nothing needs sideways scrolling. */}
          <ul className="panel mt-5 divide-y divide-hairline rounded-md md:hidden">
            {SANDBOXES.map((s) => (
              <li key={s.name} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-body font-semibold text-foreground">{s.name}</p>
                  <VerdictPill verdict={s.verdict} />
                </div>
                <dl className="mt-2 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5">
                  <dt className="text-meta text-muted-foreground">Isolation</dt><dd className="text-body text-foreground">{s.isolation}</dd>
                  <dt className="text-meta text-muted-foreground">Start</dt><dd className="text-body text-foreground">{s.boot}</dd>
                  <dt className="text-meta text-muted-foreground">Fit for agentic apps</dt><dd className="text-body text-foreground">{s.fit}</dd>
                </dl>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="scale" className="mt-14">
          <SectionHead id="scale" eyebrow="Scale">Thousands of people at once, without thousands of idle machines.</SectionHead>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {NUMBERS.map((n) => (
              <div key={n.k} className="panel rounded-md p-4">
                <p className="text-note font-semibold tabular-nums tracking-tight text-foreground">{n.k}</p>
                <p className="mt-1 text-meta text-muted-foreground">{n.v}</p>
              </div>
            ))}
          </div>
          <ul className="mt-5 grid gap-2 text-body text-muted-foreground md:grid-cols-2">
            {SCALE_NOTES.map((t) => (
              <li key={t} className="flex gap-2"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-foreground" />{t}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="today" className="mt-14">
          <SectionHead id="today" eyebrow="Honest about the seams">What the prototype runs today, and what production adds.</SectionHead>
          <p className="mt-3 max-w-3xl text-body text-muted-foreground">
            <StatusPill kind="real">Real</StatusPill> runs in the live prototype. <StatusPill kind="stand-in">Stand-in</StatusPill> is simulated or sandboxed, and
            labelled in the product. <StatusPill kind="designed">Designed</StatusPill> is specified in ARCHITECTURE.md and not built yet.
          </p>
          <div className="panel mt-5 hidden overflow-x-auto rounded-md md:block">
            <table className="w-full min-w-[760px] text-left text-body">
              <thead className="border-b border-hairline bg-deep/50 text-meta text-muted-foreground">
                <tr><th className={cn(TH, "w-[272px]")}>Part</th><th className={TH}>In the live prototype</th><th className={TH}>In production</th></tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {TODAY.map((r) => (
                  <tr key={r.part} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{r.part}</p>
                      <div className="mt-1.5 flex flex-col items-start gap-1">
                        {r.status.map((st) => <StatusPill key={st.label} kind={st.kind}>{st.label}</StatusPill>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.today}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.prod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="panel mt-5 divide-y divide-hairline rounded-md md:hidden">
            {TODAY.map((r) => (
              <li key={r.part} className="p-4">
                <p className="text-body font-semibold text-foreground">{r.part}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.status.map((st) => <StatusPill key={st.label} kind={st.kind}>{st.label}</StatusPill>)}
                </div>
                <p className="micro-label mt-3">In the live prototype</p>
                <p className="mt-0.5 text-body text-muted-foreground">{r.today}</p>
                <p className="micro-label mt-3">In production</p>
                <p className="mt-0.5 text-body text-muted-foreground">{r.prod}</p>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-14 text-body text-muted-foreground">
          Service-by-service reasoning, the sequence diagrams and the prototype-to-production map are in{" "}
          <a className="text-foreground underline decoration-dotted underline-offset-4" href={`${REPO_URL}/blob/main/ARCHITECTURE.md`} target="_blank" rel="noreferrer">ARCHITECTURE.md</a>.
        </p>
      </main>
    </div>
  );
}
