/**
 * Deterministic blueprint from a sentence.
 * Same text in, same drawing out: a hash picks the small variations
 * (sheet number, hatch angles, compass starts, price jitter) and keyword
 * modules decide what gets drawn.
 */

export type ScreenKind =
  | "inbox"
  | "approvals"
  | "dashboard"
  | "form"
  | "chat"
  | "reports"
  | "schedule"
  | "pipeline"
  | "catalog"
  | "home";

export type Perm = "read" | "change" | "undo";

export interface Screen {
  id: string;
  kind: ScreenKind;
  name: string;
  hatch: number;
}
export interface Agent {
  id: string;
  name: string;
  perms: Perm[];
  gate: string | null;
  spin: number;
}
export interface DataSet {
  id: string;
  name: string;
  fields: number;
}
export interface Conn {
  id: string;
  name: string;
  scope: string;
  agentId: string;
}
export interface Link {
  id: string;
  from: string;
  to: string;
}

export interface Blueprint {
  empty: boolean;
  hash: number;
  hex: string;
  name: string;
  code: string;
  sheet: string;
  screens: Screen[];
  agents: Agent[];
  data: DataSet[];
  conns: Conn[];
  links: Link[];
  gates: number;
  minutes: number;
  credits: number;
  dollars: string;
  files: number;
}

/* ------------------------------------------------------------------ hashing */

export function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small seeded PRNG: identical sequence for identical seeds. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ modules */

interface Module {
  key: string;
  re: RegExp;
  screen?: { kind: ScreenKind; name: string };
  agent?: { key: string; name: string; perms: Perm[] };
  data?: { key: string; name: string };
  conn?: { key: string; name: string; scope: string; only?: RegExp };
  gate?: string;
  suffix?: string;
}

const DOMAIN = "__domain__";
const PEOPLE = "__people__";

const MODULES: Module[] = [
  {
    key: "inbox",
    re: /\b(inbox|queue|triag\w*|tickets?|support|help ?desk|requests?|complaints?)\b/,
    screen: { kind: "inbox", name: "Inbox" },
    agent: { key: "triage", name: "Triage", perms: ["read", "change"] },
    data: { key: "domain", name: DOMAIN },
    suffix: "Desk",
  },
  {
    key: "approvals",
    re: /\b(approv\w*|sign[- ]?offs?|asks? (?:me |us )?(?:first|before)|ask (?:me|us)|confirm\w*|reviews?|reviewing)\b/,
    screen: { kind: "approvals", name: "Approvals" },
    suffix: "Approvals",
  },
  {
    key: "payments",
    re: /\b(pay|pays|paid|paying|payments?|payouts?|refunds?|refunding|invoic\w*|billing|charg\w*|stripe|checkout)\b/,
    agent: { key: "payments", name: "Payments", perms: ["read", "change", "undo"] },
    data: { key: "payments", name: "Payments" },
    conn: { key: "stripe", name: "Stripe", scope: "PAYOUTS" },
    gate: "Issue payment",
    suffix: "Payments",
  },
  {
    key: "email",
    re: /\b(e-?mails?|e-?mailing|mail|repl(?:y|ies)|newsletters?|gmail|outlook)\b/,
    agent: { key: "writer", name: "Writer", perms: ["read", "change"] },
    conn: { key: "gmail", name: "Gmail", scope: "SEND + READ" },
  },
  {
    key: "dashboard",
    re: /\b(dashboards?|metrics|analytics|kpis?|charts?|stats|insights?)\b/,
    screen: { kind: "dashboard", name: "Dashboard" },
    suffix: "Board",
  },
  {
    key: "form",
    re: /\b(forms?|intake|sign ?ups?|applications?|apply|surveys?|onboarding|register\w*)\b/,
    screen: { kind: "form", name: "Intake form" },
    data: { key: "submissions", name: "Submissions" },
    suffix: "Intake",
  },
  {
    key: "chat",
    re: /\b(chat\w*|assistants?|bots?|conversations?|concierge|answer\w*|faqs?|questions?)\b/,
    screen: { kind: "chat", name: "Chat" },
    agent: { key: "concierge", name: "Concierge", perms: ["read"] },
    suffix: "Concierge",
  },
  {
    key: "report",
    re: /\b(reports?|reporting|weekly|daily|monthly|summar\w*|digests?|recaps?)\b/,
    agent: { key: "reporter", name: "Reporter", perms: ["read"] },
    screen: { kind: "reports", name: "Reports" },
    suffix: "Reports",
  },
  {
    key: "schedule",
    re: /\b(book|books|booking\w*|calendars?|schedul\w*|appointments?|reservations?|classes|sessions?)\b/,
    screen: { kind: "schedule", name: "Schedule" },
    agent: { key: "scheduler", name: "Scheduler", perms: ["read", "change"] },
    data: { key: "bookings", name: "Bookings" },
    conn: { key: "calendar", name: "Calendar", scope: "EVENTS" },
    suffix: "Bookings",
  },
  {
    key: "sms",
    re: /\b(sms|texts?|texting|whatsapp|twilio|remind\w*)\b/,
    agent: { key: "reminders", name: "Reminders", perms: ["read", "change"] },
    conn: { key: "twilio", name: "Twilio", scope: "SMS" },
  },
  {
    key: "crm",
    re: /\b(crm|leads?|sales|pipelines?|deals?|hubspot|salesforce|prospects?)\b/,
    screen: { kind: "pipeline", name: "Pipeline" },
    data: { key: "leads", name: "Leads" },
    conn: { key: "hubspot", name: "HubSpot", scope: "CONTACTS" },
    suffix: "Pipeline",
  },
  {
    key: "people",
    re: /\b(customers?|clients?|members?|patients?|students?|guests?|tenants?|candidates?|volunteers?)\b/,
    data: { key: "people", name: PEOPLE },
  },
  {
    key: "docs",
    re: /\b(docs|documents?|pdfs?|contracts?|polic(?:y|ies)|knowledge|files?|notion|wiki|handbook)\b/,
    agent: { key: "reader", name: "Reader", perms: ["read"] },
    data: { key: "documents", name: "Documents" },
    conn: { key: "drive", name: "Drive", scope: "FILES", only: /\b(drive|google docs|notion)\b/ },
    suffix: "Library",
  },
  {
    key: "shop",
    re: /\b(shops?|store|products?|inventory|orders?|catalog\w*|e-?commerce|shopify|merch)\b/,
    screen: { kind: "catalog", name: "Catalog" },
    data: { key: "orders", name: "Orders" },
    conn: { key: "shopify", name: "Shopify", scope: "ORDERS", only: /\bshopify\b/ },
    suffix: "Shop",
  },
  { key: "slack", re: /\bslack\b/, conn: { key: "slack", name: "Slack", scope: "POST" } },
  {
    key: "sheets",
    re: /\b(spreadsheets?|sheets|csv|excel|airtable)\b/,
    conn: { key: "sheets", name: "Sheets", scope: "READ + WRITE" },
  },
  { key: "delete", re: /\b(delet\w*|remov\w*|cancel\w*|archiv\w*|purg\w*)\b/, gate: "Delete records" },
];

const DOMAIN_RE =
  /\b(claim|ticket|order|lead|booking|invoice|application|candidate|patient|student|expense|listing|propert(?:y|ie)|task|project|contract|product|review|complaint|return|case|incident|job|shipment|donation|grant|lesson|recipe|event|request|message)s?\b/;

const STOP = new Set(
  "a an the for my our your their of to and or with that which who whom where when then so in on at by from into over under about as is are be it its this these those i we me us you they them any anything each every all some more most very just only also can could should would will please app apps tool tools system platform thing something one new small little simple".split(
    " ",
  ),
);
const VERBS = new Set(
  "build make create want need help let lets get track manage handle run send draft write keep turn show give see use using do does".split(" "),
);

const title = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
const plural = (w: string) => (w.endsWith("s") ? w : w.endsWith("y") ? w.slice(0, -1) + "ies" : w + "s");

function domainNoun(t: string): string | null {
  const m = t.match(DOMAIN_RE);
  if (!m) return null;
  const base = m[1].replace(/ie$/, "y");
  return title(plural(base));
}

function projectName(t: string, suffix: string | null): string {
  const clean = (w: string | undefined) => (w && !STOP.has(w) && !VERBS.has(w) ? w : null);
  let words: string[] = [];

  const forRe = /\bfor (?:(?:my|our|a|an|the|small|local|busy|tiny|new|little|family)\s+)*([a-z][a-z'&-]+)(?:\s+([a-z][a-z'&-]+))?/g;
  for (const m of t.matchAll(forRe)) {
    const a = clean(m[1]);
    if (!a) continue;
    const b = clean(m[2]);
    words = b ? [a, b] : [a];
    break;
  }
  if (!words.length) {
    const ofRe = /\b(?:of|about|on) (?:(?:my|our|the|all|weekly|daily|monthly)\s+)*([a-z][a-z'&-]+)/;
    const m = t.match(ofRe);
    if (m && clean(m[1])) words = [m[1]];
  }
  if (!words.length) {
    const d = domainNoun(t);
    if (d) words = [d.toLowerCase()];
  }
  if (!words.length) {
    words = (t.match(/[a-z][a-z'&-]+/g) ?? []).filter((w) => clean(w) && w.length > 2).slice(0, 2);
  }
  if (!words.length) return "Untitled App";

  let name = title(words.join(" ").replace(/['.,]+$/, ""));
  const last = words[words.length - 1];
  const sfx = suffix ?? "App";
  if (!new RegExp(`\\b${sfx}\\b`, "i").test(name) && !(sfx === "Payments" && /pay/.test(last))) name = `${name} ${sfx}`;
  if (name.length > 24) name = title(words.join(" ")).slice(0, 24).trim();
  return name;
}

/* ---------------------------------------------------------------- blueprint */

const LIMIT = { screens: 4, agents: 4, data: 3, conns: 4 };

export const EMPTY: Blueprint = {
  empty: true,
  hash: 0,
  hex: "00000000",
  name: "Untitled",
  code: "UNT-0000",
  sheet: "A-100",
  screens: [],
  agents: [],
  data: [],
  conns: [],
  links: [],
  gates: 0,
  minutes: 0,
  credits: 0,
  dollars: "0.00",
  files: 0,
};

export function draft(input: string): Blueprint {
  const t = input.toLowerCase().replace(/\s+/g, " ").trim();
  if (t.replace(/[^a-z]/g, "").length < 3) return EMPTY;

  const hash = fnv(t);
  const hex = hash.toString(16).toUpperCase().padStart(8, "0");
  const sub = (id: string) => rng(hash ^ fnv(id));

  const found = MODULES.map((m) => ({ m, at: t.search(m.re) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.m);
  const has = (k: string) => found.some((m) => m.key === k);

  const screens: Screen[] = [];
  const agents: Agent[] = [];
  const data: DataSet[] = [];
  const conns: Conn[] = [];
  const links: Link[] = [];
  const moduleAgent = new Map<string, string>();
  const moduleData = new Map<string, string>();
  const moduleScreen = new Map<string, string>();

  const dom = domainNoun(t);
  const peopleMatch = t.match(/\b(customer|client|member|patient|student|guest|tenant|candidate|volunteer)s?\b/);

  for (const m of found) {
    if (m.screen && !(m.key === "report" && has("dashboard"))) {
      const id = `screen:${m.screen.kind}`;
      if (!screens.some((s) => s.id === id)) {
        const r = sub(id);
        screens.push({ id, kind: m.screen.kind, name: m.screen.name, hatch: r() > 0.5 ? 45 : -45 });
      }
      moduleScreen.set(m.key, id);
    }
    if (m.agent) {
      const id = `agent:${m.agent.key}`;
      if (!agents.some((a) => a.id === id)) {
        agents.push({ id, name: m.agent.name, perms: [...m.agent.perms], gate: null, spin: Math.floor(sub(id)() * 360) });
      }
      moduleAgent.set(m.key, id);
    }
    if (m.data) {
      let name = m.data.name;
      if (name === DOMAIN) name = dom ?? "Messages";
      if (name === PEOPLE) name = peopleMatch ? title(plural(peopleMatch[1])) : "People";
      const id = `data:${name.toLowerCase()}`;
      if (!data.some((d) => d.id === id)) data.push({ id, name, fields: 5 + Math.floor(sub(id)() * 8) });
      moduleData.set(m.key, id);
    }
  }

  if (!screens.length) screens.push({ id: "screen:home", kind: "home", name: "Home", hatch: sub("home")() > 0.5 ? 45 : -45 });
  if (!agents.length) agents.push({ id: "agent:assistant", name: "Assistant", perms: ["read", "change"], gate: null, spin: Math.floor(sub("assistant")() * 360) });
  if (!data.length) {
    const name = dom ?? "Records";
    data.push({ id: `data:${name.toLowerCase()}`, name, fields: 5 + Math.floor(sub(name)() * 8) });
  }

  screens.splice(LIMIT.screens);
  agents.splice(LIMIT.agents);
  data.splice(LIMIT.data);

  const agentIds = new Set(agents.map((a) => a.id));
  const dataIds = new Set(data.map((d) => d.id));
  const screenIds = new Set(screens.map((s) => s.id));
  const agentFor = (key: string) => {
    const id = moduleAgent.get(key);
    return id && agentIds.has(id) ? id : agents[0].id;
  };

  /* connections */
  for (const m of found) {
    if (!m.conn || (m.conn.only && !m.conn.only.test(t))) continue;
    const id = `conn:${m.conn.key}`;
    if (conns.some((c) => c.id === id)) continue;
    let agentId = agentFor(m.key);
    if ((m.key === "slack" || m.key === "sheets") && agentIds.has("agent:reporter")) agentId = "agent:reporter";
    conns.push({ id, name: m.conn.name, scope: m.conn.scope, agentId });
  }
  conns.splice(LIMIT.conns);

  /* ask-first gates */
  const setGate = (agentId: string | undefined, action: string, undo = false) => {
    const a = agents.find((x) => x.id === agentId);
    if (!a || a.gate) return false;
    a.gate = action;
    if (undo && !a.perms.includes("undo")) a.perms.push("undo");
    return true;
  };
  const changer = () => {
    const a = agents.find((x) => x.perms.includes("change") && !x.gate) ?? agents.find((x) => !x.gate);
    if (a && !a.perms.includes("change")) a.perms.push("change");
    return a?.id;
  };
  if (has("payments")) setGate(agentFor("payments"), "Issue payment", true);
  if (has("email") && (has("approvals") || /\bask\b|\bbefore send/.test(t))) setGate(agentFor("email"), "Send email");
  if (has("delete")) setGate(changer(), "Delete records", true);
  if (has("approvals") && !agents.some((a) => a.gate)) setGate(changer(), "Publish changes");
  const gates = agents.filter((a) => a.gate).length;

  /* wiring */
  const link = (from: string | undefined, to: string | undefined) => {
    if (!from || !to) return;
    const id = `${from}>${to}`;
    if (!links.some((l) => l.id === id)) links.push({ id, from, to });
  };
  for (const s of screens) {
    const mod = found.find((m) => moduleScreen.get(m.key) === s.id);
    const own = mod ? moduleAgent.get(mod.key) : undefined;
    if (own && agentIds.has(own)) link(s.id, own);
    else if (s.kind === "approvals") link(s.id, agents.find((a) => a.gate)?.id ?? agents[0].id);
    else if (s.kind === "dashboard" || s.kind === "reports") link(s.id, agentIds.has("agent:reporter") ? "agent:reporter" : agents[0].id);
    else link(s.id, agents[0].id);
  }
  for (const a of agents) {
    const mod = found.find((m) => moduleAgent.get(m.key) === a.id);
    const own = mod ? moduleData.get(mod.key) : undefined;
    link(a.id, own && dataIds.has(own) ? own : data[0].id);
  }
  const wired = links.filter((l) => (screenIds.has(l.from) || agentIds.has(l.from)) && (agentIds.has(l.to) || dataIds.has(l.to)));

  /* estimate */
  const r = rng(hash);
  const credits = Math.round(90 + 45 * screens.length + 70 * agents.length + 25 * data.length + 30 * conns.length + 20 * gates + r() * 36);
  const minutes = Math.round(3 + screens.length * 1.2 + agents.length * 1.5 + conns.length * 0.5);
  const files = 6 + screens.length * 3 + agents.length * 2 + data.length * 2 + conns.length;

  const suffix = found.find((m) => m.suffix)?.suffix ?? null;
  const name = projectName(t, suffix);
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

  return {
    empty: false,
    hash,
    hex,
    name,
    code: `${initials}-${1000 + (hash % 9000)}`,
    sheet: `A-${101 + (hash % 89)}`,
    screens,
    agents,
    data,
    conns,
    links: wired,
    gates,
    minutes,
    credits,
    dollars: (credits / 100).toFixed(2),
    files,
  };
}

/** Human summary of what changed between two drafts, for the revision log. */
export function diff(prev: Blueprint, next: Blueprint): string | null {
  const label = (b: Blueprint) =>
    new Map<string, string>([
      ...b.screens.map((s) => [s.id, s.name] as const),
      ...b.agents.map((a) => [a.id, `${a.name} agent`] as const),
      ...b.data.map((d) => [d.id, `${d.name} data`] as const),
      ...b.conns.map((c) => [c.id, c.name] as const),
    ]);
  const a = label(prev);
  const b = label(next);
  const added = [...b].filter(([k]) => !a.has(k)).map(([, v]) => `+${v}`);
  const removed = [...a].filter(([k]) => !b.has(k)).map(([, v]) => `-${v}`);
  const parts = [...added, ...removed];
  if (!parts.length) return prev.name !== next.name ? `Renamed ${next.name}` : null;
  return parts.slice(0, 3).join("  ") + (parts.length > 3 ? `  +${parts.length - 3} more` : "");
}

export const EXAMPLES = [
  "An inbox for insurance claims. Agents triage each claim, draft reply emails, and ask me before paying anything. Weekly report on a dashboard.",
  "A booking form for my yoga studio that texts reminders and syncs the calendar",
  "A chat assistant for our tenants that answers from the handbook and asks before cancelling a lease",
  "A sales pipeline for leads with a weekly Slack digest and a dashboard",
];
