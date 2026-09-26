import {
  Activity, Bot, BrainCircuit, Building2, CalendarClock, Cloud, Coins, Container, CreditCard, Database, FileSearch, FlaskConical, FolderKanban, GitBranch, Globe,
  HardDrive, KeyRound, LayoutDashboard, Laptop, MessageSquare, Network, Radio, Rocket, Router, Search, Server, Shield, ShieldCheck, UserRound, Users, Workflow, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * The production architecture of Wonderwork, drawn as one SVG so it scales
 * crisply on screen and exports cleanly to PNG and PDF.
 * Coordinates live on a 1824 × 1116 canvas.
 */

type Tone = "people" | "edge" | "control" | "sandbox" | "runtime" | "data" | "outside";
type Card = { id: string; x: number; y: number; w: number; h: number; title: string; sub: string; icon: LucideIcon; tone: Tone; tags?: string[]; rows?: string[]; step?: number[] };
type Zone = { x: number; y: number; w: number; h: number; label: string; hint?: string; tone: Tone };

const TONE: Record<Tone, string> = {
  outside: "#a19dae",
  people: "#ffd27a",
  edge: "#ff9a4d",
  control: "#ff4f8b",
  sandbox: "#b06bff",
  runtime: "#3dd68c",
  data: "#5b9cff",
};

export const W = 1824;
export const H = 1116;

const ZONES: Zone[] = [
  { x: 300, y: 20, w: 1500, h: 112, label: "Outside services", tone: "outside" },
  { x: 24, y: 156, w: 236, h: 720, label: "People", tone: "people" },
  { x: 300, y: 156, w: 236, h: 720, label: "Edge", hint: "global", tone: "edge" },
  { x: 576, y: 156, w: 560, h: 720, label: "Control plane", hint: "stateless · Kubernetes", tone: "control" },
  { x: 1176, y: 156, w: 292, h: 720, label: "Sandbox plane", hint: "untrusted code", tone: "sandbox" },
  { x: 1508, y: 156, w: 292, h: 720, label: "Runtime plane", hint: "live apps", tone: "runtime" },
  { x: 24, y: 900, w: 1776, h: 196, label: "Data + platform", hint: "shared, multi-tenant", tone: "data" },
];

const DATA_W = 235;
const dataX = (i: number) => 40 + i * (DATA_W + 16);

export const CARDS: Card[] = [
  // outside
  { id: "identity", x: 316, y: 48, w: 204, h: 72, title: "Identity", sub: "Google, GitHub, SAML SSO", icon: UserRound, tone: "outside" },
  { id: "stripe", x: 592, y: 48, w: 176, h: 72, title: "Stripe", sub: "Plans and invoices", icon: CreditCard, tone: "outside" },
  { id: "providers", x: 784, y: 48, w: 336, h: 72, title: "Model providers", sub: "Anthropic · OpenAI · Google · open models (vLLM, Bedrock)", icon: BrainCircuit, tone: "outside", step: [2] },
  { id: "github", x: 1192, y: 48, w: 260, h: 72, title: "GitHub", sub: "Repos, pull requests, checks, webhooks", icon: GitBranch, tone: "outside", step: [6] },
  { id: "vercel", x: 1524, y: 48, w: 124, h: 72, title: "Vercel", sub: "Deploy target", icon: Rocket, tone: "outside" },
  { id: "slack", x: 1660, y: 48, w: 124, h: 72, title: "Notify", sub: "Slack, email pings", icon: MessageSquare, tone: "outside" },
  // people
  { id: "studio", x: 40, y: 196, w: 204, h: 184, title: "Builder studio", sub: "One project for the people who describe apps and the people who code them", icon: LayoutDashboard, tone: "people", tags: ["Plain", "Spec", "Code"], step: [1] },
  { id: "endusers", x: 40, y: 396, w: 204, h: 96, title: "People using live apps", sub: "Public URLs and custom domains", icon: Users, tone: "people", step: [8] },
  { id: "editor", x: 40, y: 508, w: 204, h: 96, title: "Your editor", sub: "Cursor, Claude Code or VS Code on the same repo", icon: Laptop, tone: "people" },
  { id: "teammates", x: 40, y: 620, w: 204, h: 96, title: "Teammates", sub: "Handoffs arrive with the object, history and diff", icon: Users, tone: "people" },
  // edge
  { id: "cdn", x: 316, y: 196, w: 204, h: 88, title: "CDN + WAF", sub: "Static assets, bot and DDoS protection", icon: Shield, tone: "edge" },
  { id: "api", x: 316, y: 300, w: 204, h: 100, title: "API gateway", sub: "Sessions, JWT, per-user rate limits and quotas", icon: Network, tone: "edge" },
  { id: "preview", x: 316, y: 416, w: 204, h: 136, title: "Preview proxy", sub: "{project}.preview → sandbox port. WebSockets and HMR, signed cookie, wakes sleeping sandboxes", icon: Globe, tone: "edge", step: [4] },
  { id: "realtime", x: 316, y: 568, w: 204, h: 108, title: "Realtime hub", sub: "SSE and WebSocket fan-out over NATS: build steps, logs, presence", icon: Radio, tone: "edge", step: [5] },
  { id: "approuter", x: 316, y: 692, w: 204, h: 108, title: "App router", sub: "Custom domains, automatic TLS, live traffic to the runtime", icon: Router, tone: "edge", step: [8] },
  // control plane
  { id: "bff", x: 592, y: 196, w: 256, h: 96, title: "Web app + BFF", sub: "Next.js, server actions, Supabase Auth", icon: LayoutDashboard, tone: "control" },
  { id: "project", x: 592, y: 308, w: 256, h: 96, title: "Project service", sub: "Blueprints, save points, Work Orders, diffs", icon: FolderKanban, tone: "control" },
  { id: "orchestrator", x: 592, y: 420, w: 256, h: 124, title: "Orchestrator", sub: "Temporal workflows for plan, build, repair, deploy and import. Durable, resumable, retried", icon: Workflow, tone: "control", step: [2] },
  { id: "budget", x: 592, y: 560, w: 256, h: 96, title: "Budget + billing", sub: "Quote before work, meter after, caps, refunds", icon: Coins, tone: "control" },
  { id: "policy", x: 592, y: 672, w: 256, h: 112, title: "Policy + approvals", sub: "Tool permissions, House Rules, approval inbox, audit log", icon: ShieldCheck, tone: "control" },
  { id: "gateway", x: 864, y: 196, w: 256, h: 112, title: "Model gateway", sub: "One API for every model: routing by task, fallbacks, prompt caching, BYOK, cost per call", icon: Zap, tone: "control", step: [2] },
  { id: "harness", x: 864, y: 324, w: 256, h: 172, title: "Agent harness", sub: "Planner, coder, verifier and repairer share one tool loop with step budgets and doom-loop detection", icon: Bot, tone: "control", tags: ["plan", "act", "verify", "repair"], step: [2, 3] },
  { id: "githubsvc", x: 864, y: 512, w: 256, h: 92, title: "GitHub service", sub: "GitHub App: a branch per Work Order, PRs, two-way sync", icon: GitBranch, tone: "control", step: [6] },
  { id: "deploy", x: 864, y: 620, w: 256, h: 92, title: "Deploy service", sub: "Immutable releases, preflight gates, instant rollback", icon: Rocket, tone: "control", step: [7] },
  { id: "import", x: 864, y: 728, w: 256, h: 96, title: "Import + analysis", sub: "Clone, detect stack and agents, coverage map, House Rules", icon: FileSearch, tone: "control" },
  // sandbox plane
  { id: "manager", x: 1192, y: 196, w: 260, h: 108, title: "Sandbox manager", sub: "Schedules microVMs, warm pool, snapshot and restore, idle suspend", icon: Server, tone: "sandbox" },
  {
    id: "vm", x: 1192, y: 320, w: 260, h: 340, title: "Project sandbox", sub: "Firecracker microVM per project · 2 vCPU · 4 GB · persistent disk", icon: Container, tone: "sandbox", step: [3],
    rows: ["Dev server · Next.js or Vite :3000", "Agent runtime · Python + Node", "Tests + rehearsal runner", "Language servers + repo map", "File watcher → events"],
  },
  { id: "egress", x: 1192, y: 676, w: 260, h: 112, title: "Egress proxy", sub: "Allow-listed network. Secrets are added on the way out and never live in the VM", icon: KeyRound, tone: "sandbox" },
  // runtime plane
  { id: "cloud", x: 1524, y: 196, w: 260, h: 116, title: "Wonderwork Cloud", sub: "Live apps on Knative or Fly Machines. Scale to zero, a Postgres branch per app", icon: Cloud, tone: "runtime", step: [7, 8] },
  { id: "agentgw", x: 1524, y: 328, w: 260, h: 164, title: "Agent gateway", sub: "Every production tool call passes here: permissions, approval gates, budget caps, traces", icon: ShieldCheck, tone: "runtime", tags: ["Read", "Change", "Ask first"], step: [8] },
  { id: "jobs", x: 1524, y: 508, w: 260, h: 88, title: "Queues + schedules", sub: "Triggers, retries, long-running agent tasks", icon: CalendarClock, tone: "runtime" },
  { id: "evals", x: 1524, y: 612, w: 260, h: 88, title: "Evals in production", sub: "Rehearsals replayed on real traces, drift alerts", icon: FlaskConical, tone: "runtime" },
  { id: "selfhost", x: 1524, y: 716, w: 260, h: 108, title: "Your VPC or on-prem", sub: "Same runtime via Helm or Terraform, outbound-only tunnel", icon: Building2, tone: "runtime", step: [7] },
  // data
  { id: "postgres", x: dataX(0), y: 936, w: DATA_W, h: 128, title: "Postgres (Supabase)", sub: "Users, projects, blueprints, events. Row-level security on every table", icon: Database, tone: "data" },
  { id: "redis", x: dataX(1), y: 936, w: DATA_W, h: 128, title: "Redis", sub: "Sessions, rate limits, locks, short queues", icon: Zap, tone: "data" },
  { id: "objects", x: dataX(2), y: 936, w: DATA_W, h: 128, title: "Object storage", sub: "Sandbox snapshots, build artefacts, repo archives", icon: HardDrive, tone: "data" },
  { id: "vectors", x: dataX(3), y: 936, w: DATA_W, h: 128, title: "Vector index", sub: "Repo maps, docs and agent knowledge (pgvector)", icon: Search, tone: "data" },
  { id: "vault", x: dataX(4), y: 936, w: DATA_W, h: 128, title: "Secrets vault", sub: "KMS-encrypted keys, short-lived tokens", icon: KeyRound, tone: "data" },
  { id: "warehouse", x: dataX(5), y: 936, w: DATA_W, h: 128, title: "Usage warehouse", sub: "Tokens, credits and traces (ClickHouse)", icon: Activity, tone: "data" },
  { id: "otel", x: dataX(6), y: 936, w: DATA_W, h: 128, title: "Observability", sub: "OpenTelemetry traces, logs, LLM spans, SLOs", icon: Activity, tone: "data" },
];

const byId = Object.fromEntries(CARDS.map((c) => [c.id, c]));
type Side = "l" | "r" | "t" | "b";
function A(id: string, side: Side, t = 0.5): [number, number] {
  const c = byId[id];
  if (side === "l") return [c.x, c.y + c.h * t];
  if (side === "r") return [c.x + c.w, c.y + c.h * t];
  if (side === "t") return [c.x + c.w * t, c.y];
  return [c.x + c.w * t, c.y + c.h];
}
/** Smooth horizontal S-curve between two points. */
function curve(a: [number, number], b: [number, number]) {
  const dx = Math.max(18, Math.abs(b[0] - a[0]) * 0.5);
  return `M ${a[0]} ${a[1]} C ${a[0] + dx} ${a[1]}, ${b[0] - dx} ${b[1]}, ${b[0]} ${b[1]}`;
}
/** Orthogonal route with rounded corners. */
function orth(pts: [number, number][], r = 12) {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const d1 = Math.hypot(x1 - x0, y1 - y0);
    const d2 = Math.hypot(x2 - x1, y2 - y1);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const p1: [number, number] = [x1 - ((x1 - x0) / d1) * rr, y1 - ((y1 - y0) / d1) * rr];
    const p2: [number, number] = [x1 + ((x2 - x1) / d2) * rr, y1 + ((y2 - y1) / d2) * rr];
    d += ` L ${p1[0]} ${p1[1]} Q ${x1} ${y1}, ${p2[0]} ${p2[1]}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L ${last[0]} ${last[1]}`;
}

type Edge = { d: string; tone: Tone; live?: boolean; dashed?: boolean };
const pv = A("preview", "r", 0.5);
const vmIn = A("vm", "l", 0.83);
const vmOut = A("vm", "l", 0.92);
const rt = A("realtime", "r", 0.5);
const gh = A("githubsvc", "r", 0.5);
const dep = A("deploy", "r", 0.5);
const ag = A("agentgw", "l", 0.3);

const EDGES: Edge[] = [
  { d: curve(A("studio", "r", 0.3), A("api", "l")), tone: "people", live: true },
  { d: curve(A("studio", "r", 0.6), A("preview", "l", 0.4)), tone: "people", live: true },
  { d: curve(A("realtime", "l", 0.5), A("studio", "r", 0.86)), tone: "edge", live: true },
  { d: curve(A("endusers", "r", 0.5), A("approuter", "l", 0.5)), tone: "people" },
  { d: curve(A("api", "r", 0.5), A("bff", "l", 0.5)), tone: "edge", live: true },
  { d: curve(A("orchestrator", "r", 0.5), A("harness", "l", 0.5)), tone: "control", live: true },
  { d: `M ${A("gateway", "t", 0.53)[0]} ${A("gateway", "t")[1]} L ${A("gateway", "t", 0.53)[0]} ${A("providers", "b")[1]}`, tone: "control", live: true },
  { d: curve(A("harness", "r", 0.2), A("manager", "l", 0.6)), tone: "sandbox" },
  { d: curve(A("harness", "r", 0.72), A("vm", "l", 0.45)), tone: "sandbox", live: true },
  // live preview: proxy → bus below the planes → sandbox dev server
  { d: orth([pv, [566, pv[1]], [566, 888], [1156, 888], [1156, vmIn[1]], vmIn]), tone: "edge", live: true },
  // events: sandbox → realtime hub
  { d: orth([vmOut, [1146, vmOut[1]], [1146, 882], [548, 882], [548, rt[1]], rt]), tone: "sandbox", live: true, dashed: true },
  // GitHub: branch + PR
  { d: orth([gh, [1166, gh[1]], [1166, 140], [1322, 140], [1322, 120]]), tone: "control" },
  // deploy trunk → cloud and VPC
  { d: orth([dep, [1162, dep[1]], [1162, 894], [1496, 894], [1496, A("cloud", "l", 0.5)[1]], A("cloud", "l", 0.5)]), tone: "runtime" },
  { d: orth([[1496, 894], [1496, A("selfhost", "l", 0.5)[1]], A("selfhost", "l", 0.5)]), tone: "runtime" },
  // production agents call models only through the gateway (metering, caps)
  { d: orth([ag, [1484, ag[1]], [1484, 148], [1080, 148], [1080, 196]]), tone: "runtime", dashed: true },
];

const BADGES: { n: number; x: number; y: number }[] = [
  { n: 1, x: 272, y: 300 },
  { n: 2, x: 856, y: 470 },
  { n: 3, x: 1156, y: 438 },
  { n: 4, x: 860, y: 888 },
  { n: 5, x: 548, y: 780 },
  { n: 6, x: 1244, y: 140 },
  { n: 7, x: 1330, y: 894 },
  { n: 8, x: 272, y: 600 },
];

export const FLOWS: { n: number; title: string; body: string }[] = [
  { n: 1, title: "Describe", body: "The studio sends the brief through the API gateway. Nothing runs yet: the planner returns a Blueprint and a priced Work Order." },
  { n: 2, title: "Plan", body: "The orchestrator starts a durable workflow. The harness asks the model gateway, which picks a model per task and meters every call." },
  { n: 3, title: "Build in a sandbox", body: "Approved work runs inside the project's microVM: write files, install, run, test, rehearse agents. Every step is checkpointed." },
  { n: 4, title: "Live preview", body: "The preview proxy maps the project's subdomain to the sandbox dev server, including WebSockets for hot reload." },
  { n: 5, title: "Show the work", body: "File, test and step events stream back through the realtime hub, so people see progress in plain English, not a spinner." },
  { n: 6, title: "Branch + PR", body: "Each Work Order becomes a branch and a pull request through the GitHub App. Pushes from engineers sync back into the Blueprint." },
  { n: 7, title: "Ship", body: "Preflight passes, the deploy service builds one immutable release and rolls it out to Wonderwork Cloud, Vercel or your VPC." },
  { n: 8, title: "Governed agents", body: "In production every tool call goes through the agent gateway: permissions, approval gates, budget caps and traces." },
];

function CardView({ c }: { c: Card }) {
  const tone = TONE[c.tone];
  const I = c.icon;
  return (
    <foreignObject x={c.x} y={c.y} width={c.w} height={c.h}>
      <div
        className="flex h-full flex-col rounded-[12px] border p-2.5"
        style={{
          borderColor: `color-mix(in srgb, ${tone} 28%, #2c2938)`,
          background: `linear-gradient(180deg, color-mix(in srgb, ${tone} 7%, #1a1824), #13121b)`,
          boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.05), 0 8px 24px -12px rgb(0 0 0 / 0.8)`,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-md" style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}>
            <I className="size-3.5" />
          </span>
          <span className="truncate text-[12.5px] font-semibold leading-tight text-[#efedf4]">{c.title}</span>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-[1.4] text-[#a19dae]">{c.sub}</p>
        {c.rows && (
          <ul className="mt-2 space-y-1.5">
            {c.rows.map((r) => (
              <li key={r} className="rounded-md border px-2 py-1.5 font-mono text-[10px] text-[#d9d5e3]" style={{ borderColor: "#34313f", background: "#0c0b13" }}>
                {r}
              </li>
            ))}
          </ul>
        )}
        {c.tags && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1.5">
            {c.tags.map((t) => (
              <span key={t} className="rounded-full border px-1.5 py-px font-mono text-[9.5px]" style={{ borderColor: `color-mix(in srgb, ${tone} 35%, transparent)`, color: tone }}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </foreignObject>
  );
}

export function ArchitectureDiagram({ id = "architecture-diagram", animated = true }: { id?: string; animated?: boolean }) {
  return (
    <svg id={id} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby={`${id}-title`}>
      <title id={`${id}-title`}>Wonderwork production architecture: people, edge, control plane, sandbox plane, runtime plane, and data platform, with eight numbered flows.</title>
      <defs>
        <linearGradient id="sol-stroke" x1="0" y1="0" x2={W} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd27a" />
          <stop offset="0.35" stopColor="#ff7438" />
          <stop offset="0.65" stopColor="#ff4f8b" />
          <stop offset="1" stopColor="#b06bff" />
        </linearGradient>
        <linearGradient id="sol-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd27a" />
          <stop offset="0.5" stopColor="#ff7438" />
          <stop offset="1" stopColor="#ff4f8b" />
        </linearGradient>
        <filter id="edge-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <pattern id="arch-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="rgb(255 255 255 / 0.05)" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="#09080f" />
      <rect width={W} height={H} fill="url(#arch-dots)" />

      {ZONES.map((z) => (
        <g key={z.label}>
          <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={18} fill={`color-mix(in srgb, ${TONE[z.tone]} 3%, transparent)`} stroke={`color-mix(in srgb, ${TONE[z.tone]} 30%, #24222f)`} strokeDasharray="4 5" />
          <text x={z.x + 16} y={z.y + 22} fill={TONE[z.tone]} style={{ font: "600 11px var(--font-geist-mono), monospace", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {z.label.toUpperCase()}
            {z.hint && <tspan fill="#716d80" style={{ letterSpacing: "0.04em" }}>{`  ·  ${z.hint}`}</tspan>}
          </text>
        </g>
      ))}

      {EDGES.map((e, i) => (
        <g key={i}>
          <path d={e.d} fill="none" stroke={TONE[e.tone]} strokeOpacity={0.25} strokeWidth={5} filter="url(#edge-soft)" />
          <path d={e.d} fill="none" stroke={TONE[e.tone]} strokeOpacity={0.75} strokeWidth={1.5} strokeDasharray={e.dashed ? "5 5" : undefined} />
          {animated && e.live && <path d={e.d} fill="none" stroke="#fff4ea" strokeOpacity={0.85} strokeWidth={1.4} strokeLinecap="round" className="flow" />}
        </g>
      ))}

      {CARDS.map((c) => <CardView key={c.id} c={c} />)}

      {BADGES.map((b) => (
        <g key={b.n}>
          <circle cx={b.x} cy={b.y} r={13} fill="#09080f" />
          <circle cx={b.x} cy={b.y} r={11} fill="url(#sol-badge)" />
          <text x={b.x} y={b.y + 4} textAnchor="middle" fill="#1a0b07" style={{ font: "700 12px var(--font-geist-sans), sans-serif" }}>{b.n}</text>
        </g>
      ))}
    </svg>
  );
}
