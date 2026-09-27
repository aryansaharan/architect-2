import {
  Activity, Bot, BrainCircuit, Building2, CalendarClock, Cloud, Coins, Container, CreditCard, Database, DatabaseZap, FileSearch, FlaskConical, FolderKanban, GitBranch, Globe,
  HardDrive, History, IdCard, KeyRound, LayoutDashboard, Laptop, Mail, MessageSquare, Network, Package, Radio, Rocket, Router, Server, Shield, ShieldCheck, UserRound, Users, Waypoints, Workflow, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * The production architecture of Prod AI, drawn as one SVG so it scales
 * crisply on screen and exports cleanly to PNG and PDF.
 * Coordinates live on a 1824 × 1336 canvas: the planes, the data platform, then a legend band.
 *
 * Scope: the gradient outline is one cell (control, sandbox and runtime planes plus the per-cell
 * data). Everything outside it is shared by a region's cells (edge, identity, warehouse,
 * observability) or global (Cloudflare, outside services). Regional cards inside it say "Regional".
 *
 * Routing rules, so the picture stays readable as edges are added:
 * - Short verticals join neighbours inside a column (for example BFF → Orchestrator).
 * - Gutters between planes carry vertical lanes; the band above the planes (y ≈ 134-144)
 *   and the band below them (y ≈ 882-900) carry horizontal lanes. The cell outline runs just
 *   outside those lanes at y = 150 and x = 556, and its label sits on its bottom edge.
 * - Every plane reaches the data platform through one labelled trunk into the data bus.
 * - Solid lines are request and response, dashed lines are asynchronous, and a line's colour is
 *   the plane it belongs to. The legend at the bottom tells readers the same thing.
 *
 * Interactive mode (the /architecture page): every numbered badge is focusable. Hovering or
 * focusing one highlights the edges of its flow and shows the step in the readout panel at the
 * top left, which is also the badge's aria-describedby target. It is pure CSS (:has), so this
 * file stays a server component and the page can keep importing FLOWS as plain data.
 */

type Tone = "people" | "edge" | "control" | "sandbox" | "runtime" | "data" | "outside";
type Card = { id: string; x: number; y: number; w: number; h: number; title: string; sub: string; icon: LucideIcon; tone: Tone; tags?: string[]; rows?: string[]; step?: number[] };
type Zone = { x: number; y: number; w: number; h: number; label: string; hint?: string; tone: Tone };

const TONE: Record<Tone, string> = {
  outside: "#9baaa2",
  people: "#fff2a6",
  edge: "#dfff4f",
  control: "#8dff9e",
  sandbox: "#3fe0c5",
  runtime: "#6fb7ff",
  data: "#ffb86b",
};
const BADGE_BG = "linear-gradient(135deg, #fff2a6, #dfff4f 50%, #8dff9e)";

export const W = 1824;
const LEGEND_Y = 1158;
const LEGEND_H = 160;
export const H = LEGEND_Y + LEGEND_H + 18;

const ZONES: Zone[] = [
  { x: 300, y: 20, w: 1500, h: 108, label: "Outside services", tone: "outside" },
  { x: 24, y: 156, w: 236, h: 720, label: "People", tone: "people" },
  { x: 300, y: 156, w: 236, h: 720, label: "Edge", hint: "regional · ingress", tone: "edge" },
  { x: 576, y: 156, w: 560, h: 720, label: "Control plane", hint: "stateless · Kubernetes", tone: "control" },
  { x: 1176, y: 156, w: 292, h: 720, label: "Sandbox plane", hint: "untrusted code", tone: "sandbox" },
  { x: 1508, y: 156, w: 292, h: 720, label: "Runtime plane", hint: "live apps", tone: "runtime" },
  { x: 24, y: 916, w: 512, h: 206, label: "Regional", hint: "shared by its cells", tone: "data" },
  { x: 576, y: 916, w: 1224, h: 206, label: "Data + platform", hint: "per cell", tone: "data" },
  { x: 24, y: LEGEND_Y, w: 1776, h: LEGEND_H, label: "Legend", hint: "how to read this diagram", tone: "outside" },
];

/** Data platform: ten cards in one row, each with a drop from the data bus. Three regional cards
 * sit under the people and edge columns, outside the cell; seven per-cell cards sit inside it. */
const DATA_Y = 978;
const REGION = [
  { x: 40, w: 140 },
  { x: 192, w: 164 },
  { x: 368, w: 152 },
];
const DATA_W = 160;
const dataX = (i: number) => 592 + i * (DATA_W + 12);
/** The cell boundary: control, sandbox and runtime planes plus the per-cell data. */
const CELL = { x: 556, y: 150, w: 1256, h: 984 };
/** Control plane: two columns with a 48 px gap between them for rails. */
const C1 = 592;
const C2 = 880;
const CW = 240;

export const CARDS: Card[] = [
  // outside
  { id: "identity", x: 316, y: 48, w: 204, h: 72, title: "Identity providers", sub: "Google, GitHub, SAML SSO", icon: UserRound, tone: "outside" },
  { id: "stripe", x: 592, y: 48, w: 176, h: 72, title: "Stripe", sub: "Plans and invoices", icon: CreditCard, tone: "outside" },
  { id: "providers", x: 784, y: 48, w: 336, h: 72, title: "Model providers", sub: "Anthropic · OpenAI · Google · open models (vLLM, Bedrock)", icon: BrainCircuit, tone: "outside", step: [2] },
  { id: "github", x: 1192, y: 48, w: 260, h: 72, title: "GitHub", sub: "Repos, pull requests, checks, webhooks", icon: GitBranch, tone: "outside", step: [6] },
  { id: "vercel", x: 1524, y: 48, w: 112, h: 72, title: "Vercel", sub: "Deploy target", icon: Rocket, tone: "outside" },
  { id: "slack", x: 1648, y: 48, w: 136, h: 72, title: "Slack + email", sub: "Approval messages", icon: Mail, tone: "outside" },
  // people
  { id: "studio", x: 40, y: 196, w: 204, h: 184, title: "Builder studio", sub: "One project for the people who describe apps and the people who code them", icon: LayoutDashboard, tone: "people", tags: ["Plain", "Settings", "Code"], step: [1] },
  { id: "teammates", x: 40, y: 396, w: 204, h: 96, title: "Teammates", sub: "Handoffs arrive with the object, history and diff", icon: Users, tone: "people" },
  { id: "editor", x: 40, y: 508, w: 204, h: 96, title: "Your editor", sub: "Cursor, Claude Code or VS Code on the same repo", icon: Laptop, tone: "people" },
  { id: "endusers", x: 40, y: 620, w: 204, h: 96, title: "People using live apps", sub: "Public URLs and custom domains", icon: Users, tone: "people", step: [8] },
  // edge
  { id: "cdn", x: 316, y: 196, w: 204, h: 88, title: "CDN + WAF", sub: "Cloudflare: static assets, WAF, bot and DDoS protection", icon: Shield, tone: "edge" },
  { id: "api", x: 316, y: 304, w: 204, h: 96, title: "API gateway", sub: "Regional Envoy: JWT, rate limits, quotas, cell routing", icon: Network, tone: "edge" },
  { id: "preview", x: 316, y: 416, w: 204, h: 136, title: "Preview proxy", sub: "{project}.preview → sandbox port. WebSockets and HMR, signed cookie, wakes sleeping sandboxes", icon: Globe, tone: "edge", step: [4] },
  { id: "realtime", x: 316, y: 568, w: 204, h: 108, title: "Realtime hub", sub: "SSE and WebSocket fan-out over NATS: build steps, logs, presence", icon: Radio, tone: "edge", step: [5] },
  { id: "approuter", x: 316, y: 692, w: 204, h: 108, title: "App router", sub: "Custom domains, automatic TLS, live traffic to the runtime", icon: Router, tone: "edge", step: [8] },
  // control plane, column 1
  { id: "budget", x: C1, y: 196, w: CW, h: 96, title: "Budget + billing", sub: "Quote before work, meter after, caps, refunds", icon: Coins, tone: "control" },
  { id: "bff", x: C1, y: 308, w: CW, h: 88, title: "Web app + BFF", sub: "Next.js in each cell's cluster: server actions and sessions", icon: LayoutDashboard, tone: "control" },
  { id: "orchestrator", x: C1, y: 420, w: CW, h: 124, title: "Orchestrator", sub: "Temporal workflows for plan, build, repair, deploy and import. Durable, resumable, retried", icon: Workflow, tone: "control", step: [2] },
  { id: "project", x: C1, y: 560, w: CW, h: 96, title: "Project service", sub: "Blueprints, save points, Work Orders, diffs", icon: FolderKanban, tone: "control" },
  { id: "policy", x: C1, y: 672, w: CW, h: 112, title: "Policy + approvals", sub: "Tool permissions, House Rules, approvals, delegation grants, audit log", icon: ShieldCheck, tone: "control" },
  // control plane, column 2
  { id: "gateway", x: C2, y: 196, w: CW, h: 112, title: "Model gateway", sub: "The studio's gateway: routing by task, eval-gated switches, cache-affine failover, BYOK, cost per call", icon: Zap, tone: "control", step: [2] },
  { id: "harness", x: C2, y: 324, w: CW, h: 172, title: "Agent harness", sub: "Planner, coder, verifier and repairer share one tool loop with step budgets and doom-loop detection", icon: Bot, tone: "control", tags: ["plan", "act", "verify", "repair"], step: [2, 3] },
  { id: "githubsvc", x: C2, y: 512, w: CW, h: 92, title: "GitHub service", sub: "GitHub App: a branch per Work Order, PRs, two-way sync", icon: GitBranch, tone: "control", step: [6] },
  { id: "deploy", x: C2, y: 620, w: CW, h: 92, title: "Deploy service", sub: "Immutable releases, preflight gates, instant rollback", icon: Rocket, tone: "control", step: [7] },
  { id: "import", x: C2, y: 728, w: CW, h: 96, title: "Import + analysis", sub: "Clone, detect stack and agents, coverage map, House Rules", icon: FileSearch, tone: "control" },
  // sandbox plane
  { id: "manager", x: 1192, y: 196, w: 260, h: 108, title: "Sandbox manager", sub: "Schedules microVMs: warm pool, lazy snapshot restore, idle suspend. Eligible work can burst to E2B", icon: Server, tone: "sandbox" },
  {
    id: "vm", x: 1192, y: 320, w: 260, h: 340, title: "Project sandbox", sub: "Firecracker microVM per project · 2 vCPU · 4 GB · persistent disk", icon: Container, tone: "sandbox", step: [3],
    rows: ["Dev server · Next.js or Vite :3000", "Agent runtime · Python + Node", "Tests + rehearsal runner", "Language servers + repo map", "File watcher → events"],
  },
  { id: "egress", x: 1192, y: 676, w: 260, h: 96, title: "Egress proxy", sub: "Allow-listed network. Secrets are added on the way out and never live in the VM", icon: KeyRound, tone: "sandbox" },
  { id: "mirror", x: 1192, y: 788, w: 260, h: 76, title: "Package mirror", sub: "npm and PyPI pull-through cache, scanned. Regional", icon: Package, tone: "sandbox" },
  // runtime plane
  { id: "cloud", x: 1524, y: 196, w: 260, h: 100, title: "Prod Cloud", sub: "Live apps on Knative, each pod in its own microVM. Scale to zero, no secrets, no direct egress", icon: Cloud, tone: "runtime", step: [7, 8] },
  { id: "agentgw", x: 1524, y: 314, w: 260, h: 152, title: "Agent gateway", sub: "The only way out of a live app. Holds the credentials, checks permissions and approval gates, caps budgets, traces every call. Its own model gateway, apart from the studio's", icon: ShieldCheck, tone: "runtime", tags: ["Read", "Change", "Ask first"], step: [8] },
  { id: "notify", x: 1524, y: 480, w: 260, h: 72, title: "Notify", sub: "Approval and handoff pings, signed replies", icon: MessageSquare, tone: "runtime", step: [8] },
  { id: "jobs", x: 1524, y: 566, w: 260, h: 84, title: "Queues + schedules", sub: "Triggers, retries, long-running agent tasks", icon: CalendarClock, tone: "runtime" },
  { id: "evals", x: 1524, y: 664, w: 260, h: 84, title: "Evals in production", sub: "Rehearsals replayed on real traces, drift alerts", icon: FlaskConical, tone: "runtime" },
  { id: "selfhost", x: 1524, y: 762, w: 260, h: 90, title: "Your VPC or on-prem", sub: "Same runtime via Helm or Terraform, outbound-only tunnel", icon: Building2, tone: "runtime", step: [7] },
  // regional: shared by every cell in the region
  { id: "directory", ...REGION[0], y: DATA_Y, h: 128, title: "Identity", sub: "Supabase Auth, memberships, SSO and the workspace → cell directory", icon: IdCard, tone: "data" },
  { id: "warehouse", ...REGION[1], y: DATA_Y, h: 128, title: "Usage warehouse", sub: "Tokens, credits and trace summaries (ClickHouse)", icon: Activity, tone: "data" },
  { id: "otel", ...REGION[2], y: DATA_Y, h: 128, title: "Observability", sub: "OpenTelemetry traces, logs, LLM spans, SLOs", icon: Activity, tone: "data" },
  // data + platform, per cell
  { id: "postgres", x: dataX(0), y: DATA_Y, w: DATA_W, h: 128, title: "Postgres", sub: "Supabase, one per cell. Projects, Blueprints, ledger, grants, pgvector. RLS on every table", icon: Database, tone: "data" },
  { id: "redis", x: dataX(1), y: DATA_Y, w: DATA_W, h: 128, title: "Redis", sub: "Preview and app routes, locks, gateway pins. Rate limits are regional", icon: Zap, tone: "data" },
  { id: "nats", x: dataX(2), y: DATA_Y, w: DATA_W, h: 128, title: "NATS JetStream", sub: "Build events, usage, approvals. Replay from any sequence number", icon: Waypoints, tone: "data" },
  { id: "temporal", x: dataX(3), y: DATA_Y, w: DATA_W, h: 128, title: "Temporal Cloud", sub: "Workflow history, timers, task queues. Studio and runtime namespaces", icon: History, tone: "data" },
  { id: "objects", x: dataX(4), y: DATA_Y, w: DATA_W, h: 128, title: "Object storage", sub: "Sandbox snapshots, build artefacts, OCI images, repo archives", icon: HardDrive, tone: "data" },
  { id: "vault", x: dataX(5), y: DATA_Y, w: DATA_W, h: 128, title: "Secrets vault", sub: "KMS-encrypted, regional keys. Only the egress proxy and the gateways decrypt", icon: KeyRound, tone: "data" },
  { id: "appdb", x: dataX(6), y: DATA_Y, w: DATA_W, h: 128, title: "App databases", sub: "Neon Postgres for live apps: a branch per app and per test version", icon: DatabaseZap, tone: "data" },
];

const byId = Object.fromEntries(CARDS.map((c) => [c.id, c]));
type Side = "l" | "r" | "t" | "b";
type Pt = [number, number];
function A(id: string, side: Side, t = 0.5): Pt {
  const c = byId[id];
  if (side === "l") return [c.x, c.y + c.h * t];
  if (side === "r") return [c.x + c.w, c.y + c.h * t];
  if (side === "t") return [c.x + c.w * t, c.y];
  return [c.x + c.w * t, c.y + c.h];
}
/** Control points of the smooth horizontal S-curve between two points. */
function controls(a: Pt, b: Pt): [Pt, Pt] {
  const dx = Math.max(18, Math.abs(b[0] - a[0]) * 0.5);
  return [[a[0] + dx, a[1]], [b[0] - dx, b[1]]];
}
function curve(a: Pt, b: Pt) {
  const [p1, p2] = controls(a, b);
  return `M ${a[0]} ${a[1]} C ${p1[0]} ${p1[1]}, ${p2[0]} ${p2[1]}, ${b[0]} ${b[1]}`;
}
/** The point at parameter t on curve(a, b), so a badge sits exactly on its line. */
function curveAt(a: Pt, b: Pt, t: number): Pt {
  const [p1, p2] = controls(a, b);
  const u = 1 - t;
  const f = (i: 0 | 1) => u * u * u * a[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * b[i];
  return [f(0), f(1)];
}
/** Orthogonal route with rounded corners. */
function orth(pts: Pt[], r = 12) {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const d1 = Math.hypot(x1 - x0, y1 - y0);
    const d2 = Math.hypot(x2 - x1, y2 - y1);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const p1: Pt = [x1 - ((x1 - x0) / d1) * rr, y1 - ((y1 - y0) / d1) * rr];
    const p2: Pt = [x1 + ((x2 - x1) / d2) * rr, y1 + ((y2 - y1) / d2) * rr];
    d += ` L ${p1[0]} ${p1[1]} Q ${x1} ${y1}, ${p2[0]} ${p2[1]}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L ${last[0]} ${last[1]}`;
}
/** Straight segment, for neighbours in the same column or row. */
function line(a: Pt, b: Pt) {
  return `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`;
}
/** Short vertical join from the bottom of one card to the top of the card below it. */
function stack(upper: string, lower: string, t = 0.5) {
  return line(A(upper, "b", t), A(lower, "t", t));
}
/** Midpoint of a stack() join. */
function between(upper: string, lower: string, t = 0.5): Pt {
  return [A(upper, "b", t)[0], (A(upper, "b", t)[1] + A(lower, "t", t)[1]) / 2];
}

type Label = { x: number; y: number; text: string; anchor?: "start" | "middle" | "end" };
/** flows: the numbered steps this edge belongs to, highlighted when a badge is hovered or focused. */
type Edge = { d: string; tone: Tone; live?: boolean; dashed?: boolean; label?: Label; flows?: number[] };

// lane anchors
const pv = A("preview", "r", 0.5);
const vmIn = A("vm", "l", 0.83);
const vmOut = A("vm", "l", 0.92);
const rt = A("realtime", "r", 0.5);
const gh = A("githubsvc", "r", 0.5);
const dep = A("deploy", "r", 0.5);
const ag = A("agentgw", "l", 0.3);
const cloudIn = A("cloud", "l", 0.5);
// horizontal lanes above the planes
const LANE_GIT = 134;
const LANE_GH = 139;
const LANE_MODEL = 144;
// horizontal lanes below the planes
const LANE_EVENTS = 882;
const LANE_PREVIEW = 888;
const LANE_DEPLOY = 894;
const LANE_LIVE = 900;
// data bus and plane trunks
const BUS_Y = 962;
const PLANE_BOTTOM = 876;
const TRUNK_LABEL_Y = 952;
const dataCenters = CARDS.filter((c) => c.tone === "data").map((c) => c.x + c.w / 2);
const trunk = (x: number, tone: Tone, text: string, anchor: "start" | "end" = "start"): Edge => ({
  d: line([x, PLANE_BOTTOM], [x, BUS_Y]), tone, label: { x: anchor === "start" ? x + 7 : x - 7, y: TRUNK_LABEL_Y, text, anchor },
});

const EDGES: Edge[] = [
  // ── people ↔ edge ──────────────────────────────────────────────
  { d: curve(A("studio", "r", 0.1), A("cdn", "l")), tone: "people", flows: [1] },
  { d: curve(A("studio", "r", 0.3), A("api", "l")), tone: "people", live: true, flows: [1, 7] },
  { d: curve(A("studio", "r", 0.6), A("preview", "l", 0.4)), tone: "people", live: true, flows: [4] },
  { d: curve(A("realtime", "l", 0.5), A("studio", "r", 0.86)), tone: "edge", live: true, flows: [5] },
  { d: curve(A("endusers", "r", 0.5), A("approuter", "l", 0.5)), tone: "people", flows: [8] },
  // handoffs open in the same studio
  { d: stack("studio", "teammates"), tone: "people" },
  // an engineer's editor pushes to the same repo the GitHub App manages
  {
    d: orth([A("editor", "l"), [32, A("editor", "l")[1]], [32, LANE_GIT], [1150, LANE_GIT], [1150, A("github", "l")[1]], A("github", "l")]),
    tone: "people", label: { x: 44, y: LANE_GIT - 7, text: "git push / pull · same repo" }, flows: [6],
  },

  // ── outside → control ──────────────────────────────────────────
  // OIDC / SAML federation into Supabase Auth in the BFF
  { d: orth([A("identity", "r", 0.6), [544, A("identity", "r", 0.6)[1]], [544, A("bff", "l", 0.25)[1]], A("bff", "l", 0.25)]), tone: "outside", flows: [1] },
  // usage records and invoices out, signed webhooks back
  { d: orth([A("stripe", "l", 0.4), [564, A("stripe", "l", 0.4)[1]], [564, A("budget", "l")[1]], A("budget", "l")]), tone: "outside" },
  { d: line([A("gateway", "t", 0.53)[0], A("gateway", "t")[1]], [A("gateway", "t", 0.53)[0], A("providers", "b")[1]]), tone: "control", live: true, flows: [2, 3] },

  // ── edge → control ─────────────────────────────────────────────
  { d: curve(A("api", "r", 0.5), A("bff", "l", 0.5)), tone: "edge", live: true, flows: [1, 7] },

  // ── inside the control plane ───────────────────────────────────
  { d: stack("budget", "bff"), tone: "control", flows: [1, 2] }, // quotes and balances for the Work Order card
  { d: stack("bff", "orchestrator"), tone: "control", live: true, flows: [2, 7] }, // start and signal workflows
  { d: stack("orchestrator", "project"), tone: "control", flows: [2, 3] }, // Work Order state, save points
  { d: orth([A("bff", "l", 0.85), [584, A("bff", "l", 0.85)[1]], [584, A("project", "l")[1]], A("project", "l")]), tone: "control", flows: [1] }, // Blueprint reads and edits
  { d: line(A("gateway", "l", 0.43), [C1 + CW, A("gateway", "l", 0.43)[1]]), tone: "control", flows: [2, 3] }, // every model call is metered against the budget
  { d: curve(A("orchestrator", "r", 0.3), A("harness", "l", 0.5)), tone: "control", live: true, flows: [2, 3] },
  { d: line(A("harness", "t", 0.5), A("gateway", "b", 0.5)), tone: "control", live: true, flows: [2, 3] }, // model calls by task
  { d: stack("harness", "githubsvc"), tone: "control", flows: [6] }, // verified commits become a branch
  { d: stack("githubsvc", "deploy"), tone: "control", flows: [7] }, // merge to main deploys to test
  // every harness tool call is checked against permissions and House Rules
  { d: orth([A("harness", "l", 0.92), [844, A("harness", "l", 0.92)[1]], [844, A("policy", "r")[1]], A("policy", "r")]), tone: "control", flows: [3] },
  // import uses the GitHub App installation token to clone private repos
  { d: orth([A("githubsvc", "l", 0.8), [868, A("githubsvc", "l", 0.8)[1]], [868, A("import", "l")[1]], A("import", "l")]), tone: "control" },

  // ── control → sandbox ──────────────────────────────────────────
  { d: curve(A("harness", "r", 0.2), A("manager", "l", 0.6)), tone: "sandbox", flows: [3] },
  { d: curve(A("harness", "r", 0.72), A("vm", "l", 0.45)), tone: "sandbox", live: true, flows: [3] },
  { d: stack("manager", "vm"), tone: "sandbox", flows: [3] }, // boot, snapshot, resume
  { d: stack("vm", "egress"), tone: "sandbox", flows: [3] }, // all outbound traffic
  { d: stack("egress", "mirror"), tone: "sandbox", flows: [3] }, // npm and pip installs

  // ── lanes below the planes ─────────────────────────────────────
  // live preview: proxy → sandbox dev server (HTTP + HMR WebSocket)
  { d: orth([pv, [566, pv[1]], [566, LANE_PREVIEW], [1156, LANE_PREVIEW], [1156, vmIn[1]], vmIn]), tone: "edge", live: true, flows: [4] },
  // events: sandbox → realtime hub
  { d: orth([vmOut, [1146, vmOut[1]], [1146, LANE_EVENTS], [544, LANE_EVENTS], [544, rt[1]], rt]), tone: "sandbox", live: true, dashed: true, flows: [5] },
  // deploy trunk → Prod Cloud, your VPC, and up to Vercel
  { d: orth([dep, [1162, dep[1]], [1162, LANE_DEPLOY], [1496, LANE_DEPLOY], [1496, cloudIn[1]], cloudIn]), tone: "runtime", flows: [7] },
  { d: orth([[1496, LANE_DEPLOY], [1496, A("selfhost", "l", 0.5)[1]], A("selfhost", "l", 0.5)]), tone: "runtime", flows: [7] },
  { d: orth([[1496, cloudIn[1] + 40], [1496, LANE_GH], [A("vercel", "b")[0], LANE_GH], A("vercel", "b")]), tone: "runtime", flows: [7] },
  // live traffic: app router → Prod Cloud
  { d: orth([A("approuter", "b", 0.75), [A("approuter", "b", 0.75)[0], LANE_LIVE], [1502, LANE_LIVE], [1502, A("cloud", "l", 0.75)[1]], A("cloud", "l", 0.75)]), tone: "edge", live: true, flows: [8] },

  // ── lanes above the planes ─────────────────────────────────────
  // GitHub: branch + PR, webhooks back
  { d: orth([gh, [1166, gh[1]], [1166, LANE_GH], [1322, LANE_GH], [1322, A("github", "b")[1]]]), tone: "control", flows: [6] },
  // live apps' model calls leave through the runtime's own model gateway (inside the agent gateway tier), never the studio's
  { d: orth([ag, [1484, ag[1]], [1484, LANE_MODEL], [1100, LANE_MODEL], [1100, A("providers", "b")[1]]]), tone: "runtime", flows: [8] },

  // ── inside the runtime plane ───────────────────────────────────
  // every outbound call from a live app leaves through the agent gateway; the pod has no other route
  { d: stack("cloud", "agentgw"), tone: "runtime", flows: [8], label: { x: A("cloud", "b")[0] + 8, y: A("cloud", "b")[1] + 11.5, text: "all outbound calls" } },
  // "Ask first" approvals go to Notify (over NATS), which messages people on Slack and email
  { d: stack("agentgw", "notify"), tone: "runtime", dashed: true, flows: [8] },
  { d: orth([A("notify", "r"), [1792, A("notify", "r")[1]], [1792, A("slack", "r")[1]], A("slack", "r")]), tone: "runtime", dashed: true, flows: [8] },
  // long-running and scheduled agent work, routed down the plane's left margin past Notify
  { d: orth([A("agentgw", "l", 0.92), [1514, A("agentgw", "l", 0.92)[1]], [1514, A("jobs", "l")[1]], A("jobs", "l")]), tone: "runtime", flows: [8] },
  { d: stack("jobs", "evals"), tone: "runtime", flows: [8] }, // scheduled replays of real traces

  // ── data platform: one bus, one trunk per plane ────────────────
  { d: line([dataCenters[0], BUS_Y], [dataCenters[dataCenters.length - 1], BUS_Y]), tone: "data" },
  ...dataCenters.map((x): Edge => ({ d: line([x, BUS_Y], [x, DATA_Y]), tone: "data" })),
  trunk(520, "edge", "Redis routes · NATS fan-out", "end"),
  trunk(820, "control", "Postgres RLS · Temporal · S3 · vault · pgvector"),
  trunk(1290, "sandbox", "snapshots · egress secrets · events"),
  trunk(1662, "runtime", "Neon · vault · NATS"),
];

export const FLOWS: { n: number; title: string; body: string }[] = [
  { n: 1, title: "Describe", body: "The studio sends the brief through the API gateway. Nothing runs yet: the planner returns a Blueprint and a priced Work Order." },
  { n: 2, title: "Plan", body: "The orchestrator starts a durable workflow. The harness asks the model gateway, which picks a model per task and meters every call." },
  { n: 3, title: "Build in a sandbox", body: "Approved work runs inside the project's microVM: write files, install, run, test, rehearse agents. Every step is checkpointed." },
  { n: 4, title: "Live preview", body: "The preview proxy maps the project's subdomain to the sandbox dev server, including WebSockets for hot reload." },
  { n: 5, title: "Show the work", body: "File, test and step events stream back through the realtime hub, so people see progress in plain English, not a spinner." },
  { n: 6, title: "Branch + PR", body: "Each Work Order becomes a branch and a pull request through the GitHub App. Engineers' pushes sync back into the Blueprint or become code they own." },
  { n: 7, title: "Ship", body: "Preflight passes, the deploy service builds one immutable release and rolls it out to Prod Cloud, Vercel or your VPC." },
  { n: 8, title: "Governed agents", body: "The agent gateway is every live app's only way out: credentials, approval gates, caps and traces. Model calls use the runtime's own model gateway." },
];

/** Each numbered badge: where it sits, and the transport label beside it. */
type Step = { n: number; at: Pt; transport: string; tone: Tone; label: Omit<Label, "text"> };
const STEPS: Step[] = [
  { n: 1, at: curveAt(A("studio", "r", 0.3), A("api", "l"), 0.45), transport: "HTTPS + SSE", tone: "people", label: { x: 316, y: 297.5 } },
  { n: 2, at: between("bff", "orchestrator"), transport: "gRPC + Temporal", tone: "control", label: { x: 730, y: 411.5 } },
  { n: 3, at: curveAt(A("harness", "r", 0.72), A("vm", "l", 0.45), 0.5), transport: "vsock", tone: "sandbox", label: { x: 1156, y: 441, anchor: "middle" } },
  { n: 4, at: [860, LANE_PREVIEW], transport: "HTTPS + WebSocket (HMR)", tone: "edge", label: { x: 878, y: 911 } },
  { n: 5, at: [544, 836], transport: "vsock → NATS → WebSocket", tone: "sandbox", label: { x: 572, y: 839.5 } },
  { n: 6, at: [1290, LANE_GH], transport: "git + REST · webhooks back", tone: "control", label: { x: 1334, y: 137 } },
  { n: 7, at: [1410, LANE_DEPLOY], transport: "Knative · Vercel API · mTLS tunnel", tone: "runtime", label: { x: 1428, y: 911 } },
  { n: 8, at: curveAt(A("endusers", "r", 0.5), A("approuter", "l", 0.5), 0.3), transport: "HTTPS + WebSocket", tone: "people", label: { x: 316, y: 688 } },
];

const LEGEND_TONES: { tone: Tone; name: string; meaning: string }[] = [
  { tone: "people", name: "People", meaning: "browsers, editors and git" },
  { tone: "edge", name: "Edge", meaning: "traffic through a gateway or proxy" },
  { tone: "control", name: "Control plane", meaning: "service calls, model calls, GitHub" },
  { tone: "sandbox", name: "Sandbox", meaning: "microVM lifecycle, tool calls, events, installs" },
  { tone: "runtime", name: "Runtime", meaning: "releases going in, live agents' calls going out" },
  { tone: "data", name: "Data", meaning: "the shared bus; each trunk takes its plane's colour" },
  { tone: "outside", name: "Outside", meaning: "identity federation and billing" },
];

const LABEL_FONT = { font: "500 10.5px var(--font-code), monospace", letterSpacing: "0.04em" };

/** Hover and focus behaviour for the numbered badges, as scoped CSS. */
function interactionCss(id: string) {
  const root = `#${id}`;
  const on = (n?: number) => `${root}:has(.arch-badge${n ? `[data-flow="${n}"]` : ""}:is(:hover, :focus))`;
  return [
    `${root} .arch-edge, ${root} .arch-badge { transition: opacity 160ms ease; }`,
    `${root} .arch-badge { cursor: help; outline: none; }`,
    `${root} .arch-badge .arch-ring { stroke: transparent; }`,
    `${root} .arch-badge:is(:hover, :focus-visible) .arch-ring { stroke: #fbffe0; }`,
    `${root} .arch-readout { display: none; }`,
    `${on()} .arch-edge { opacity: 0.14; }`,
    `${on()} .arch-badge:not(:hover):not(:focus) { opacity: 0.45; }`,
    `${on()} .arch-readout-hint { display: none; }`,
    ...FLOWS.map((f) => `${on(f.n)} .arch-edge[data-flows~="${f.n}"] { opacity: 1; }\n${on(f.n)} .arch-readout[data-flow="${f.n}"] { display: block; }`),
    `@media (prefers-reduced-motion: reduce) { ${root} .arch-edge, ${root} .arch-badge { transition: none; } }`,
  ].join("\n");
}

function CardView({ c }: { c: Card }) {
  const tone = TONE[c.tone];
  const I = c.icon;
  return (
    <foreignObject x={c.x} y={c.y} width={c.w} height={c.h}>
      <div
        className="flex h-full flex-col rounded-[12px] border p-2.5"
        style={{
          borderColor: `color-mix(in srgb, ${tone} 28%, #22302c)`,
          background: `linear-gradient(180deg, color-mix(in srgb, ${tone} 7%, #121b18), #0c1311)`,
          boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.05), 0 8px 24px -12px rgb(0 0 0 / 0.8)`,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-md" style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}>
            <I className="size-3.5" />
          </span>
          <span className="truncate text-[12.5px] font-semibold leading-tight text-[#edf3ee]">{c.title}</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-[1.4] text-[#9baaa2]">{c.sub}</p>
        {c.rows && (
          <ul className="mt-2 space-y-1.5">
            {c.rows.map((r) => (
              <li key={r} className="rounded-md border px-2 py-1.5 font-mono text-[10.5px] text-[#d3dfd8]" style={{ borderColor: "#2c3b36", background: "#040706" }}>
                {r}
              </li>
            ))}
          </ul>
        )}
        {c.tags && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1.5">
            {c.tags.map((t) => (
              <span key={t} className="rounded-full border px-1.5 py-px font-mono text-[10.5px]" style={{ borderColor: `color-mix(in srgb, ${tone} 35%, transparent)`, color: tone }}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </foreignObject>
  );
}

/** A short line drawn the way edges are drawn, for the legend. */
function LineSample({ tone = "outside", dashed, pulse }: { tone?: Tone; dashed?: boolean; pulse?: boolean }) {
  return (
    <svg width="34" height="8" viewBox="0 0 34 8" aria-hidden className="shrink-0 overflow-visible">
      <line x1="1" y1="4" x2="33" y2="4" stroke={TONE[tone]} strokeOpacity={0.8} strokeWidth={1.5} strokeDasharray={dashed ? "5 5" : undefined} />
      {pulse && <line x1="1" y1="4" x2="33" y2="4" stroke="#fbffe0" strokeOpacity={0.85} strokeWidth={1.4} strokeLinecap="round" className="flow" />}
    </svg>
  );
}

function Legend({ animated, interactive }: { animated: boolean; interactive: boolean }) {
  const head = "mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#6c7c74]";
  const row = "flex items-center gap-2";
  const name = "text-[#edf3ee]";
  return (
    <foreignObject x={40} y={LEGEND_Y + 34} width={W - 80} height={LEGEND_H - 42}>
      <div className="grid h-full grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)_minmax(0,1.25fr)] gap-x-10 text-[11px] leading-[1.3] text-[#9baaa2]">
        <div>
          <p className={head}>Line style</p>
          <ul className="space-y-[3px]">
            <li className={row}><LineSample /><span><span className={name}>Solid</span>: request and response over HTTPS, gRPC or vsock</span></li>
            <li className={row}><LineSample dashed /><span><span className={name}>Dashed</span>: asynchronous events, webhooks, approval messages</span></li>
            {animated && <li className={row}><LineSample tone="edge" pulse /><span><span className={name}>Moving light</span>: the hot path of a request</span></li>}
            <li className={row}><span className="w-[34px] shrink-0 font-mono text-[10.5px] text-[#d3dfd8]">gRPC</span><span><span className={name}>Mono label</span>: the transport, or what a trunk carries</span></li>
          </ul>
        </div>
        <div>
          <p className={head}>Colour: the plane a line belongs to</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-[3px]">
            {LEGEND_TONES.map((t) => (
              <li key={t.tone} className={row}><LineSample tone={t.tone} /><span><span className={name}>{t.name}</span>{`: ${t.meaning}`}</span></li>
            ))}
            <li className={row}>
              <svg width="34" height="12" viewBox="0 0 34 12" aria-hidden className="shrink-0"><rect x="1" y="1" width="32" height="10" rx="4" fill="none" stroke="#6c7c74" strokeDasharray="3 3" /></svg>
              <span><span className={name}>Dashed box</span>: a plane, its own trust and scaling boundary</span>
            </li>
            <li className={row}>
              <svg width="34" height="12" viewBox="0 0 34 12" aria-hidden className="shrink-0"><rect x="1" y="1" width="32" height="10" rx="4" fill="none" stroke="url(#cell-stroke)" strokeWidth="1.4" strokeDasharray="7 3" /></svg>
              <span><span className={name}>Gradient outline</span>: one cell, the blast-radius unit</span>
            </li>
          </ul>
        </div>
        <div>
          <p className={head}>Numbered badges</p>
          <div className="flex items-start gap-2.5">
            <span className="grid size-[22px] shrink-0 place-items-center rounded-full text-[12px] font-bold text-[#0b1402]" style={{ background: BADGE_BG }}>1</span>
            <p>
              The eight steps of one request, prompt to production (section 3 of ARCHITECTURE.md). The mono label beside each badge names its transport.
              {interactive && " Hover or focus a badge to light up its path; the step appears at the top left."}
            </p>
          </div>
        </div>
      </div>
    </foreignObject>
  );
}

/** One cell: a gradient outline around the control, sandbox and runtime planes and the per-cell data, labelled on its bottom edge. */
function CellOutline() {
  return (
    <g aria-hidden>
      <rect x={CELL.x} y={CELL.y} width={CELL.w} height={CELL.h} rx={24} fill="rgb(255 255 255 / 0.012)" stroke="url(#cell-stroke)" strokeOpacity={0.6} strokeWidth={1.4} strokeDasharray="14 7" />
      <foreignObject x={CELL.x + 20} y={CELL.y + CELL.h - 12} width={760} height={24}>
        <div className="flex h-full items-center">
          <span
            className="inline-flex h-[22px] items-center gap-2 whitespace-nowrap rounded-full border px-2.5 font-mono text-[10.5px] tracking-[0.04em] text-[#9baaa2]"
            style={{ borderColor: "color-mix(in srgb, #8dff9e 38%, #22302c)", background: "#060a09" }}
          >
            <span className="font-semibold uppercase tracking-[0.12em] text-[#edf3ee]">One cell</span>
            <span>about 1,000 active builders · N cells per region · outside the line: regional or global</span>
          </span>
        </div>
      </foreignObject>
    </g>
  );
}

/** Top-left panel that shows the hovered or focused step. Its transport and body lines are the badge's description. */
function Readout({ id }: { id: string }) {
  return (
    <foreignObject x={24} y={4} width={264} height={116}>
      <div
        className="h-full rounded-[12px] border p-2.5"
        style={{
          borderColor: `color-mix(in srgb, ${TONE.outside} 28%, #22302c)`,
          background: `linear-gradient(180deg, color-mix(in srgb, ${TONE.outside} 7%, #121b18), #0c1311)`,
          boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.05), 0 8px 24px -12px rgb(0 0 0 / 0.8)`,
        }}
      >
        <div className="arch-readout-hint">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#6c7c74]">Trace a flow</p>
          <p className="mt-1.5 text-[11px] leading-[1.4] text-[#9baaa2]">Hover or focus a numbered badge (Tab works) to light up its path through the system. The step appears here.</p>
        </div>
        {STEPS.map((s) => {
          const f = FLOWS[s.n - 1];
          return (
            <div key={s.n} className="arch-readout" data-flow={s.n} aria-hidden="true">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold leading-tight text-[#edf3ee]">
                <span className="grid size-[18px] shrink-0 place-items-center rounded-full text-[10.5px] font-bold text-[#0b1402]" style={{ background: BADGE_BG }}>{s.n}</span>
                {f.title}
              </p>
              <p id={`${id}-flow-${s.n}-via`} className="mt-1 font-mono text-[10.5px] leading-tight" style={{ color: TONE[s.tone] }}>{s.transport}</p>
              <p id={`${id}-flow-${s.n}-text`} className="mt-1 text-[10.5px] leading-[1.35] text-[#9baaa2]">{f.body}</p>
            </div>
          );
        })}
      </div>
    </foreignObject>
  );
}

export function ArchitectureDiagram({ id = "architecture-diagram", animated = true, interactive = animated }: { id?: string; animated?: boolean; interactive?: boolean }) {
  return (
    <svg
      id={id}
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role={interactive ? "figure" : "img"}
      aria-labelledby={`${id}-title`}
      aria-describedby={interactive ? `${id}-desc` : undefined}
    >
      <title id={`${id}-title`}>
        Prod AI production architecture: people, edge, control plane, sandbox plane, runtime plane and data platform, with every service connection, eight numbered flows labelled with their transports, an outline marking one cell (the regional and global pieces sit outside it), and a legend.
      </title>
      {interactive && (
        <desc id={`${id}-desc`}>Each numbered badge can be focused. Focusing or hovering a badge highlights the connections of that flow and shows its description in the panel at the top left.</desc>
      )}
      {interactive && <style>{interactionCss(id)}</style>}
      <defs>
        <linearGradient id="badge-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2a6" />
          <stop offset="0.5" stopColor="#dfff4f" />
          <stop offset="1" stopColor="#8dff9e" />
        </linearGradient>
        <linearGradient id="cell-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#dfff4f" />
          <stop offset="0.35" stopColor="#8dff9e" />
          <stop offset="0.7" stopColor="#3fe0c5" />
          <stop offset="1" stopColor="#6fb7ff" />
        </linearGradient>
        <filter id="edge-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <pattern id="arch-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="rgb(255 255 255 / 0.05)" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="#060a09" />
      <rect width={W} height={H} fill="url(#arch-dots)" />

      <CellOutline />

      {/* The exported image travels on its own (the submission form, a slide), so it carries its title; on the page, the readout sits here. */}
      {!interactive && (
        <g>
          <text x={40} y={48} fill="#edf3ee" style={{ font: "600 26px var(--font-work), system-ui, sans-serif", letterSpacing: "-0.01em" }}>Prod AI</text>
          <text x={40} y={72} fill={TONE.control} style={{ font: "600 11px var(--font-code), monospace", letterSpacing: "0.12em" }}>PRODUCTION ARCHITECTURE</text>
          <text x={40} y={92} fill="#6c7c74" style={{ font: "500 11px var(--font-code), monospace" }}>prod-ai-studio.vercel.app</text>
        </g>
      )}

      {ZONES.map((z) => (
        <g key={z.label}>
          <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={18} fill={`color-mix(in srgb, ${TONE[z.tone]} 3%, transparent)`} stroke={`color-mix(in srgb, ${TONE[z.tone]} 30%, #1c2824)`} strokeDasharray="4 5" />
          <text x={z.x + 16} y={z.y + 22} fill={TONE[z.tone]} style={{ font: "600 11px var(--font-code), monospace", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {z.label.toUpperCase()}
            {z.hint && <tspan fill="#6c7c74" style={{ letterSpacing: "0.04em" }}>{`  ·  ${z.hint}`}</tspan>}
          </text>
        </g>
      ))}

      {EDGES.map((e, i) => (
        <g key={i} className="arch-edge" data-flows={e.flows?.join(" ")}>
          <path d={e.d} fill="none" stroke={TONE[e.tone]} strokeOpacity={0.25} strokeWidth={5} filter="url(#edge-soft)" />
          <path d={e.d} fill="none" stroke={TONE[e.tone]} strokeOpacity={0.75} strokeWidth={1.5} strokeDasharray={e.dashed ? "5 5" : undefined} />
          {animated && e.live && <path d={e.d} fill="none" stroke="#fbffe0" strokeOpacity={0.85} strokeWidth={1.4} strokeLinecap="round" className="flow" />}
        </g>
      ))}

      {CARDS.map((c) => <CardView key={c.id} c={c} />)}

      {[
        ...EDGES.filter((e) => e.label).map((e) => ({ ...e.label!, tone: e.tone })),
        ...STEPS.map((s) => ({ ...s.label, text: s.transport, tone: s.tone })),
      ].map((l) => (
        <text key={l.text} x={l.x} y={l.y} textAnchor={l.anchor ?? "start"} fill={TONE[l.tone]} stroke="#060a09" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke" style={LABEL_FONT}>
          {l.text}
        </text>
      ))}

      <Legend animated={animated} interactive={interactive} />
      {interactive && <Readout id={id} />}

      {STEPS.map((s) => {
        const [x, y] = s.at;
        return (
          <g
            key={s.n}
            className="arch-badge"
            data-flow={s.n}
            tabIndex={interactive ? 0 : undefined}
            role={interactive ? "button" : undefined}
            aria-label={interactive ? `Step ${s.n}: ${FLOWS[s.n - 1].title}` : undefined}
            aria-describedby={interactive ? `${id}-flow-${s.n}-via ${id}-flow-${s.n}-text` : undefined}
          >
            {interactive && <circle className="arch-ring" cx={x} cy={y} r={16.5} fill="none" strokeWidth={1.5} />}
            <circle cx={x} cy={y} r={13} fill="#060a09" />
            <circle cx={x} cy={y} r={11} fill="url(#badge-fill)" />
            <text x={x} y={y + 4} textAnchor="middle" fill="#0b1402" style={{ font: "700 12px var(--font-work), sans-serif" }}>{s.n}</text>
          </g>
        );
      })}
    </svg>
  );
}
