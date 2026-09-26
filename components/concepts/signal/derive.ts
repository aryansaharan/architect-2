/**
 * Deterministic "text to Blueprint" derivation for the Signal concept.
 * Same words in, same app structure out: a hash seeds every free choice and
 * keyword rules decide the screens, agents, data and connections.
 */

export type ScreenKind =
  | "inbox"
  | "approvals"
  | "payments"
  | "dashboard"
  | "form"
  | "chat"
  | "report"
  | "calendar"
  | "list"
  | "home";

export type Perm = "read" | "change" | "ask";

export interface BpScreen {
  id: string;
  name: string;
  kind: ScreenKind;
}
export interface BpAgent {
  id: string;
  name: string;
  job: string;
  perms: Perm[];
}
export interface BpData {
  id: string;
  name: string;
  rows: number;
}
export interface BpConn {
  id: string;
  name: string;
}
export type NodeRef = { t: "core" } | { t: "screen" | "agent" | "conn"; i: number };
export interface BpWire {
  id: string;
  from: NodeRef;
  to: NodeRef;
}

export interface Blueprint {
  seed: number;
  seedHex: string;
  name: string;
  screens: BpScreen[];
  agents: BpAgent[];
  data: BpData[];
  conns: BpConn[];
  wires: BpWire[];
  askFirst: number;
  credits: number;
  dollars: number;
  minutes: number;
  files: number;
  matched: string[];
  words: number;
}

export const DEFAULT_IDEA =
  "An inbox agent that sorts customer emails, drafts replies, and asks me before approving any refund over $50. Weekly report to Slack.";

export const PRESETS: { label: string; text: string }[] = [
  {
    label: "Support desk",
    text: "A support chat for my bakery that answers questions, takes cake orders through a form, and texts me when a big order needs my approval.",
  },
  {
    label: "Invoice approvals",
    text: "Read supplier invoices from email, check them against our spreadsheet, and ask me before paying anything over $500. Monthly dashboard for the team.",
  },
  {
    label: "Hiring pipeline",
    text: "Screen job candidates from our intake form, schedule interviews on my calendar, and post a weekly hiring report to Slack.",
  },
];

/* ------------------------------------------------------------------ hash */

export function hashText(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ----------------------------------------------------------------- rules */

interface Contribution {
  subject?: string;
  screen?: Omit<BpScreen, "id">;
  agent?: Omit<BpAgent, "id">;
  data?: string;
  conn?: string;
  ask?: number;
}

interface Rule {
  key: string;
  re: RegExp;
  build: (m: string) => Contribution;
}

const RULES: Rule[] = [
  {
    key: "inbox",
    re: /\b(inbox|e-?mails?|mail|gmail|outlook)\b/,
    build: () => ({
      subject: "Inbox",
      screen: { name: "Inbox", kind: "inbox" },
      agent: { name: "Inbox sorter", job: "Reads every message, labels it and drafts a reply", perms: ["read", "change"] },
      data: "Messages",
      conn: "Gmail",
    }),
  },
  {
    key: "approve",
    re: /\b(approv\w*|sign[- ]?off|asks? me|check with me|confirm\w*)\b/,
    build: () => ({ subject: "Approval", screen: { name: "Approvals", kind: "approvals" }, ask: 1 }),
  },
  {
    key: "pay",
    re: /\b(pay\w*|refunds?|invoices?|billing|stripe|charges?|checkout)\b/,
    build: (m) => {
      const refund = m.startsWith("refund");
      const invoice = m.startsWith("invoice");
      const noun = refund ? "Refunds" : invoice ? "Invoices" : "Payments";
      return {
        subject: refund ? "Refund" : invoice ? "Invoice" : "Payment",
        screen: { name: noun, kind: "payments" },
        agent: {
          name: refund ? "Refund agent" : invoice ? "Invoice matcher" : "Payments agent",
          job: "Moves money only inside the limits you set",
          perms: ["read", "change", "ask"],
        },
        data: noun,
        conn: "Stripe",
        ask: 1,
      };
    },
  },
  {
    key: "chat",
    re: /\b(chat\w*|support|assistant|helpdesk|faqs?|questions?)\b/,
    build: () => ({
      subject: "Support",
      screen: { name: "Chat", kind: "chat" },
      agent: { name: "Concierge", job: "Answers people in plain words, hands off when unsure", perms: ["read"] },
      data: "Conversations",
    }),
  },
  {
    key: "form",
    re: /\b(forms?|intake|sign ?ups?|applications?|surveys?|onboarding)\b/,
    build: () => ({ subject: "Intake", screen: { name: "Intake form", kind: "form" }, data: "Submissions" }),
  },
  {
    key: "dashboard",
    re: /\b(dashboards?|analytics|metrics|kpis?|charts?|stats)\b/,
    build: () => ({ subject: "Metrics", screen: { name: "Dashboard", kind: "dashboard" }, data: "Metrics" }),
  },
  {
    key: "report",
    re: /\b(reports?|summar\w*|digest|recap|weekly|monthly|daily)\b/,
    build: () => ({
      subject: "Report",
      screen: { name: "Reports", kind: "report" },
      agent: { name: "Reporter", job: "Writes the recap and sends it on schedule", perms: ["read", "change"] },
    }),
  },
  {
    key: "calendar",
    re: /\b(calendar|schedul\w*|bookings?|meetings?|appointments?|interviews?)\b/,
    build: () => ({
      subject: "Schedule",
      screen: { name: "Calendar", kind: "calendar" },
      agent: { name: "Scheduler", job: "Finds a time and books it", perms: ["read", "change"] },
      data: "Bookings",
      conn: "Google Calendar",
    }),
  },
  {
    key: "crm",
    re: /\b(crm|leads?|sales|deals?|hubspot|salesforce|prospects?)\b/,
    build: () => ({
      subject: "Lead",
      screen: { name: "Pipeline", kind: "list" },
      agent: { name: "Prospector", job: "Scores new leads and writes first notes", perms: ["read", "change"] },
      data: "Leads",
      conn: "HubSpot",
    }),
  },
  {
    key: "shop",
    re: /\b(orders?|inventory|shop\w*|store|products?|shopify|purchase)\b/,
    build: () => ({ subject: "Order", screen: { name: "Orders", kind: "list" }, data: "Orders", conn: "Shopify" }),
  },
  {
    key: "hire",
    re: /\b(hir\w*|recruit\w*|candidates?|resumes?|jobs?)\b/,
    build: () => ({
      subject: "Hiring",
      screen: { name: "Candidates", kind: "list" },
      agent: { name: "Screener", job: "Reads each application against your criteria", perms: ["read"] },
      data: "Candidates",
    }),
  },
  {
    key: "ticket",
    re: /\b(tickets?|bugs?|issues?|linear|jira)\b/,
    build: () => ({
      subject: "Ticket",
      screen: { name: "Tickets", kind: "list" },
      agent: { name: "Dispatcher", job: "Routes each ticket to the right person", perms: ["read", "change"] },
      data: "Tickets",
      conn: "Linear",
    }),
  },
  { key: "slack", re: /\bslack\b/, build: () => ({ conn: "Slack" }) },
  { key: "sheet", re: /\b(sheets?|spreadsheets?|excel|csv|airtable)\b/, build: () => ({ conn: "Google Sheets", data: "Sheet rows" }) },
  { key: "notify", re: /\b(texts?|sms|notif\w*|alerts?|remind\w*|whatsapp)\b/, build: () => ({ conn: "Twilio" }) },
  { key: "docs", re: /\b(docs?|documents?|notion|contracts?|pdfs?)\b/, build: () => ({ subject: "Docs", data: "Documents", conn: "Notion" }) },
  { key: "risk", re: /\b(delet\w*|cancel\w*|remov\w*|publish\w*)\b/, build: () => ({ ask: 1 }) },
];

const SUFFIXES = ["Relay", "Sentinel", "Desk", "Loop", "Station", "Beacon", "Array", "Console", "Harbor", "Watch", "Works", "Signal"];

const STOP = new Set(
  "a an the and or for of to in on with that this my our your me we i it is are be by from as at into when then any over under each every all app apps agent agents build make want need something thing which who will can should would just so also like".split(
    " ",
  ),
);

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------------------------------------------------------------- derive */

export function derive(input: string): Blueprint {
  const text = input.toLowerCase().replace(/\s+/g, " ").trim();
  const seed = hashText(text || "empty field");
  const words = text ? text.split(" ").filter(Boolean).length : 0;

  const hits: { rule: Rule; at: number; m: string }[] = [];
  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (m) hits.push({ rule, at: m.index, m: m[0] });
  }
  hits.sort((a, b) => a.at - b.at);

  const screens: BpScreen[] = [];
  const agents: BpAgent[] = [];
  const data: BpData[] = [];
  const conns: BpConn[] = [];
  const agentConn: [string, string][] = [];
  let askFirst = 0;
  let subject: string | undefined;

  const addData = (name: string) => {
    const id = `data:${slug(name)}`;
    if (!data.some((d) => d.id === id)) data.push({ id, name, rows: 400 + (hashText(name) % 24000) });
  };
  const addConn = (name: string) => {
    const id = `conn:${slug(name)}`;
    if (!conns.some((c) => c.id === id)) conns.push({ id, name });
    return id;
  };

  for (const { rule, m } of hits) {
    const c = rule.build(m);
    if (c.subject && !subject) subject = c.subject;
    if (c.screen) {
      const id = `screen:${slug(c.screen.name)}`;
      if (!screens.some((s) => s.id === id)) screens.push({ id, ...c.screen });
    }
    let agentId: string | undefined;
    if (c.agent) {
      agentId = `agent:${slug(c.agent.name)}`;
      if (!agents.some((a) => a.id === agentId)) agents.push({ id: agentId, ...c.agent });
    }
    if (c.data) addData(c.data);
    if (c.conn) {
      const connId = addConn(c.conn);
      if (agentId) agentConn.push([agentId, connId]);
    }
    if (c.ask) askFirst += c.ask;
  }

  // A plan always has somewhere to look, someone to act and something to remember.
  if (screens.length === 0) {
    screens.push({ id: "screen:home", name: "Home", kind: "home" });
    if (words > 6) screens.push({ id: "screen:records", name: "Records", kind: "list" });
  }
  if (agents.length === 0) {
    agents.push({ id: "agent:assistant", name: "Assistant", job: "Does the work you described, step by step", perms: ["read", "change"] });
  }
  if (data.length === 0) addData(words > 10 ? "Activity log" : "Records");
  if (words > 22 && screens.length < 6) screens.push({ id: "screen:settings", name: "Settings", kind: "home" });

  screens.splice(6);
  agents.splice(5);
  data.splice(4);
  conns.splice(5);

  // An agent that can ask should, once there is anything to ask about.
  if (askFirst > 0) {
    for (const a of agents) if (a.perms.includes("change") && !a.perms.includes("ask") && hashText(a.id + askFirst) % 3 === 0) a.perms = [...a.perms, "ask"];
  }
  askFirst = Math.min(5, askFirst);

  // Wires: screens hang off the Blueprint core, agents reach out to their connections.
  const wires: BpWire[] = [];
  screens.forEach((s, i) => wires.push({ id: `w:core>${s.id}`, from: { t: "core" }, to: { t: "screen", i } }));
  const linkedConns = new Set<number>();
  for (const [aId, cId] of agentConn) {
    const ai = agents.findIndex((a) => a.id === aId);
    const ci = conns.findIndex((c) => c.id === cId);
    if (ai >= 0 && ci >= 0) {
      wires.push({ id: `w:${aId}>${cId}`, from: { t: "agent", i: ai }, to: { t: "conn", i: ci } });
      linkedConns.add(ci);
    }
  }
  conns.forEach((c, ci) => {
    if (linkedConns.has(ci)) return;
    const ai = hashText(c.id) % agents.length;
    wires.push({ id: `w:${agents[ai].id}>${c.id}`, from: { t: "agent", i: ai }, to: { t: "conn", i: ci } });
  });
  const approvals = screens.findIndex((s) => s.kind === "approvals");
  if (approvals >= 0) {
    agents.forEach((a, ai) => {
      if (a.perms.includes("ask")) wires.push({ id: `w:${a.id}>${screens[approvals].id}`, from: { t: "agent", i: ai }, to: { t: "screen", i: approvals } });
    });
  }

  // Name: the first subject in the sentence, or its most telling word.
  if (!subject) {
    const pick = text
      .replace(/[^a-z0-9 ]/g, " ")
      .split(" ")
      .filter((w) => w.length > 3 && !STOP.has(w))
      .sort((a, b) => b.length - a.length)[0];
    subject = pick ? cap(pick) : "Untitled";
  }
  const name = `${subject} ${SUFFIXES[hashText(subject + hits.map((h) => h.rule.key).join("")) % SUFFIXES.length]}`;

  const credits =
    Math.round((80 + 110 * screens.length + 190 * agents.length + 45 * data.length + 70 * conns.length + 60 * askFirst + words * 2) / 10) * 10;
  const minutes = Math.max(1, Math.round(1.2 + 0.6 * screens.length + 0.9 * agents.length + 0.3 * conns.length));
  const files = 4 + 3 * screens.length + 2 * agents.length + 2 * data.length + conns.length;

  return {
    seed,
    seedHex: "0x" + seed.toString(16).toUpperCase().padStart(8, "0"),
    name,
    screens,
    agents,
    data,
    conns,
    wires,
    askFirst,
    credits,
    dollars: credits / 100,
    minutes,
    files,
    matched: hits.map((h) => h.rule.key),
    words,
  };
}
