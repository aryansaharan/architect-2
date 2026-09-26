/*
 * The composing room: turns an app idea (plain text) into a printed proof.
 * Everything here is deterministic. The same words always pull the same
 * proof: same ticket number, same screens, same inks, same artwork.
 */

export type InkKey = "pink" | "blue" | "yellow";

export const INKS: Record<InkKey, { hex: string; name: string; short: string }> = {
  pink: { hex: "#FF48B0", name: "Fluo Pink", short: "PK" },
  blue: { hex: "#0078BF", name: "Riso Blue", short: "BL" },
  yellow: { hex: "#FFE800", name: "Yellow", short: "YL" },
};

export type Perm = "read" | "change" | "undo" | "ask";
export type ScreenKind = "list" | "approve" | "pay" | "form" | "chat" | "dash" | "report" | "cal" | "table" | "home";
export type Kw = "inbox" | "email" | "approve" | "pay" | "form" | "chat" | "dashboard" | "report";
export type Motif = Kw | "schedule" | "people" | "shop" | "sun";

export interface Screen {
  name: string;
  kind: ScreenKind;
}
export interface Agent {
  name: string;
  job: string;
  perms: Perm[];
  asks: string[];
}
export interface Table {
  name: string;
  fields: string[];
  access: string;
}
export interface Connection {
  name: string;
  code: string;
}
export interface Spec {
  text: string;
  seed: number;
  id: string;
  title: string;
  detected: Kw[];
  screens: Screen[];
  agents: Agent[];
  tables: Table[];
  connections: Connection[];
  askFirst: number;
  credits: number;
  dollars: string;
  minutes: number;
  files: number;
  inks: [InkKey, InkKey];
  motifs: [Motif, Motif];
  tilt: number;
}

export const DEFAULT_IDEA =
  "A refund desk for my shop. An agent reads support emails, checks the order and pays refunds under $50, then replies to the customer. Bigger refunds ask me first. A weekly report every Monday.";

export const SAMPLE_IDEAS = [
  { label: "Salon bookings on WhatsApp", text: "A WhatsApp assistant for my salon that answers questions, books appointments in my calendar and sends reminders the day before." },
  { label: "Hiring pipeline", text: "A hiring pipeline for our bakery. Candidates apply with a form, an agent screens CVs and I approve who gets an interview." },
  { label: "Monday sales dashboard", text: "A dashboard of Stripe sales and churn with a weekly summary posted to Slack every Monday morning." },
];

/* ------------------------------------------------------------------ hash */

/** cyrb53: small, fast, well distributed. Returns a 53 bit integer. */
export function hash(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** mulberry32: seeded PRNG in [0, 1). */
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

/* -------------------------------------------------------------- keywords */

export const KEYWORDS: { key: Kw; label: string; re: RegExp }[] = [
  { key: "inbox", label: "Inbox", re: /\b(inbox|support|tickets?|requests?|queue|helpdesk)\b/i },
  { key: "email", label: "Email", re: /\b(e-?mails?|gmail|outlook|mail|newsletters?)\b/i },
  { key: "approve", label: "Approve", re: /\b(approv\w*|sign[- ]?off|reviews?|ask(s|ing)? me|permission)\b/i },
  { key: "pay", label: "Pay", re: /(\bpay\w*|\brefund\w*|\binvoic\w*|\bbilling|\bbills?\b|\bstripe|\bcharges?\b|\bpayouts?|\bcheckout|\bsubscriptions?|\$\d+)/i },
  { key: "form", label: "Form", re: /\b(forms?|sign[- ]?ups?|intake|applications?|apply|surveys?|questionnaires?|onboarding)\b/i },
  { key: "chat", label: "Chat", re: /\b(chat\w*|whats ?app|messag\w*|assistant|bot|sms|texts?|conversations?)\b/i },
  { key: "dashboard", label: "Dashboard", re: /\b(dashboards?|metrics|kpis?|analytics|stats|charts?|overview|churn)\b/i },
  { key: "report", label: "Report", re: /\b(reports?|summar\w*|digests?|weekly|monthly|daily)\b/i },
];

const EXTRA = {
  schedule: /\b(calendars?|schedul\w*|appointments?|bookings?|books|meetings?|shifts?|reservations?)\b/i,
  people: /\b(customers?|clients?|crm|leads?|contacts?|patients?|members?|candidates?|students?|tenants?|guests?|volunteers?)\b/i,
  shop: /\b(shop\w*|store|orders?|inventory|stock|products?)\b/i,
  hire: /\b(hir\w*|recruit\w*|candidates?|cvs?|resumes?|interviews?)\b/i,
  send: /\b(send\w*|repl(y|ies|ying)|notif\w*|remind\w*|follow[- ]?ups?)\b/i,
  refund: /\brefund/i,
  invoice: /\binvoic/i,
  period: /\b(weekly|monthly|daily)\b/i,
  moves: /(\bpay(s|ing|ment|ments|out|outs)?\b|\brefund|\binvoic|\bcharg|\bbill|\$\d+)/i,
};

const STOP = new Set(
  "a an the for my our your i me we us to of and or that which with in on at by from it its is are be been want wants need needs build make create creating app apps application tool platform system simple small little new please something some can could would should will lets let like so this these those every each all any when then if who what where how just also into out up about via using use there here have has had get gets got do does done agentic agent agents automatically auto quick".split(
    " ",
  ),
);
const HEADS = new Set(
  "desk inbox pipeline tracker board bot assistant portal dashboard planner log hub report digest queue crm manager helper concierge studio center centre room line office".split(" "),
);
const CASING: Record<string, string> = { whatsapp: "WhatsApp", gmail: "Gmail", crm: "CRM", sms: "SMS", kpi: "KPI", kpis: "KPIs", hr: "HR", faq: "FAQ", ai: "AI", cvs: "CVs", cv: "CV" };
const SUFFIX = ["Desk", "Room", "Works", "Office", "Bureau", "Line", "Post", "Press"];

const titleCase = (w: string) => CASING[w.toLowerCase()] ?? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

function makeTitle(text: string, seed: number): string {
  const words = (text.match(/[a-zA-Z][a-zA-Z'-]*/g) ?? []).map((w) => w.replace(/['-]+$/, ""));
  const content = words.filter((w) => w.length > 1 && !STOP.has(w.toLowerCase()));
  if (content.length === 0) return "Untitled Job";
  const picked: string[] = [];
  for (const w of content) {
    picked.push(w.slice(0, 13));
    if (HEADS.has(w.toLowerCase()) || picked.length === 3) break;
    if (picked.length === 2 && !(content[2] && HEADS.has(content[2].toLowerCase()))) break;
  }
  if (picked.length === 1 && HEADS.has(picked[0].toLowerCase()) && content[1]) picked.unshift(content[1].slice(0, 13));
  else if (picked.length === 1) picked.push(SUFFIX[seed % SUFFIX.length]);
  return picked.map(titleCase).join(" ");
}

function firstIndex(text: string, re: RegExp) {
  const m = re.exec(text);
  return m ? m.index : -1;
}

export function detect(text: string): Kw[] {
  return KEYWORDS.filter((k) => k.re.test(text)).map((k) => k.key);
}

/* ------------------------------------------------------------ compose */

export function compose(raw: string): Spec {
  const text = raw.trim().replace(/\s+/g, " ");
  const norm = text.toLowerCase();
  const seed = hash(norm);
  const r = rng(seed);
  const has = (k: Kw) => KEYWORDS.find((x) => x.key === k)!.re.test(text);
  const x = Object.fromEntries(Object.entries(EXTRA).map(([k, re]) => [k, re.test(text)])) as Record<keyof typeof EXTRA, boolean>;
  const detected = detect(text);
  const peopleWord = (() => {
    const m = EXTRA.people.exec(text);
    if (!m) return "Customers";
    const w = m[1].toLowerCase();
    if (w === "crm") return "Contacts";
    return titleCase(w.endsWith("s") ? w : w + "s");
  })();
  const period = (EXTRA.period.exec(text)?.[1] ?? "").toLowerCase();

  /* screens */
  const screens: Screen[] = [];
  if (has("inbox")) screens.push({ name: "Inbox", kind: "list" });
  else if (has("email")) screens.push({ name: "Mail log", kind: "list" });
  if (has("approve")) screens.push({ name: "Approvals", kind: "approve" });
  if (has("pay")) screens.push({ name: x.refund ? "Refunds" : x.invoice ? "Invoices" : "Payments", kind: "pay" });
  if (has("form")) screens.push({ name: x.hire ? "Application" : x.schedule ? "Booking form" : "Intake form", kind: "form" });
  if (has("chat")) screens.push({ name: "Chat", kind: "chat" });
  if (has("dashboard")) screens.push({ name: "Dashboard", kind: "dash" });
  if (has("report")) screens.push({ name: period ? `${titleCase(period)} report` : "Reports", kind: "report" });
  if (x.schedule) screens.push({ name: "Calendar", kind: "cal" });
  if (x.people && !x.hire) screens.push({ name: peopleWord, kind: "table" });
  if (x.hire) screens.push({ name: "Candidates", kind: "table" });
  if (x.shop && !has("pay")) screens.push({ name: "Orders", kind: "table" });
  if (screens.length < 3) {
    screens.unshift({ name: "Home", kind: "home" });
    const fill: Screen[] = [
      { name: "Records", kind: "table" },
      { name: "Overview", kind: "dash" },
      { name: "Settings", kind: "form" },
    ];
    for (const f of fill) if (screens.length < 3 && !screens.some((s) => s.name === f.name)) screens.push(f);
  }
  screens.splice(5);

  /* agents */
  const agents: Agent[] = [];
  if (has("inbox") || has("email")) agents.push({ name: "Mail Sorter", job: "Reads every new message and files it.", perms: ["read"], asks: [] });
  if (has("pay") && !x.moves)
    agents.push({ name: "Ledger Keeper", job: "Reads the payments and keeps the books tidy.", perms: ["read"], asks: [] });
  if (has("pay") && x.moves)
    agents.push({
      name: x.refund ? "Refund Clerk" : x.invoice ? "Billing Clerk" : "Paymaster",
      job: x.refund ? "Checks the order, then pays the refund." : "Moves money when the rules say so.",
      perms: ["read", "change", "undo", "ask"],
      asks: [x.refund ? "Pay a refund" : "Send a payment"],
    });
  if (x.send && (has("email") || has("inbox") || x.people))
    agents.push({ name: "Correspondent", job: "Writes and sends the replies.", perms: ["change", "undo", "ask"], asks: ["Send an email"] });
  if (has("approve") && !has("pay")) agents.push({ name: "Reviewer", job: "Lines up decisions for you to make.", perms: ["read", "ask"], asks: ["Publish a decision"] });
  if (x.hire) agents.push({ name: "Screener", job: "Reads each CV against your rules.", perms: ["read", "change"], asks: [] });
  else if (has("form")) agents.push({ name: "Intake Clerk", job: "Checks each submission and files it.", perms: ["read", "change"], asks: [] });
  if (has("chat")) agents.push({ name: "Concierge", job: "Answers people the way you would.", perms: ["read", "change"], asks: [] });
  if (x.schedule) agents.push({ name: "Scheduler", job: "Finds a slot and books it.", perms: ["read", "change", "ask"], asks: ["Book a slot"] });
  if (has("report") || has("dashboard")) agents.push({ name: "Reporter", job: "Counts what happened and writes it up.", perms: ["read"], asks: [] });
  if (agents.length === 0) agents.push({ name: "Helper", job: "Does the busywork you describe.", perms: ["read", "change"], asks: [] });
  agents.splice(4);

  /* data */
  const tables: Table[] = [];
  if (has("inbox") || has("email")) tables.push({ name: "Messages", fields: ["from", "subject", "received", "label"], access: "agents write" });
  if (has("pay"))
    tables.push(
      x.refund
        ? { name: "Refunds", fields: ["customer", "order no.", "amount", "reason", "status"], access: "ask first" }
        : x.invoice
          ? { name: "Invoices", fields: ["client", "amount", "due", "status"], access: "ask first" }
          : { name: "Payments", fields: ["payer", "amount", "date", "status"], access: "ask first" },
    );
  if (has("approve")) tables.push({ name: "Approvals", fields: ["item", "asked by", "decision", "when"], access: "you decide" });
  if (has("form")) tables.push({ name: "Submissions", fields: ["name", "email", "answers", "sent"], access: "agents write" });
  if (has("chat")) tables.push({ name: "Conversations", fields: ["contact", "channel", "last line", "status"], access: "agents write" });
  if (x.schedule) tables.push({ name: "Appointments", fields: ["who", "when", "service", "status"], access: "agents write" });
  if (x.shop) tables.push({ name: "Orders", fields: ["order no.", "customer", "total", "placed"], access: "read only" });
  if (x.people || x.hire) tables.push({ name: x.hire ? "Candidates" : peopleWord, fields: ["name", "email", "notes", "since"], access: "you + agents" });
  if (has("report") || has("dashboard")) tables.push({ name: "Metrics", fields: ["metric", "value", "period"], access: "read only" });
  if (tables.length === 0) tables.push({ name: "Records", fields: ["title", "owner", "status", "updated"], access: "you + agents" });
  tables.splice(4);

  /* connections */
  const conns: Connection[] = [];
  const add = (cond: boolean, name: string, code: string) => cond && !conns.some((c) => c.name === name) && conns.push({ name, code });
  add(/\boutlook\b/i.test(text), "Outlook", "Ol");
  add(/\b(gmail|e-?mails?|mail|inbox|support)\b/i.test(text) && !/\boutlook\b/i.test(text), "Gmail", "Gm");
  add(/\b(stripe|pay\w*|refund\w*|charges?|payouts?|subscriptions?|churn)\b/i.test(text) || x.invoice, "Stripe", "St");
  add(/\b(shopify|shop|store|orders?|inventory)\b/i.test(text), "Shopify", "Sh");
  add(/\bslack\b/i.test(text), "Slack", "Sl");
  add(/\bwhats ?app\b/i.test(text), "WhatsApp", "Wa");
  add(/\b(sms|texts?)\b/i.test(text), "Twilio", "Tw");
  add(/\b(sheets?|spreadsheets?|excel)\b/i.test(text), "Sheets", "Gs");
  add(x.schedule, "Calendar", "Ca");
  add(/\bnotion\b/i.test(text), "Notion", "No");
  add(/\b(hubspot|crm|salesforce|leads?)\b/i.test(text), "HubSpot", "Hs");
  add(/\b(quickbooks|xero|accounting|bookkeeping)\b/i.test(text), "Xero", "Xe");
  add(/\bairtable\b/i.test(text), "Airtable", "At");
  conns.splice(4);

  const askFirst = agents.reduce((n, a) => n + a.asks.length, 0) + (has("approve") && has("pay") ? 1 : 0);
  const credits = 24 + screens.length * 12 + agents.length * 16 + tables.length * 5 + conns.length * 7 + (seed % 11);
  const minutes = Math.max(2, Math.round(2 + screens.length * 0.7 + agents.length * 1.1 + conns.length * 0.4));
  const files = 5 + screens.length * 3 + agents.length * 2 + tables.length + conns.length;

  /* inks and motifs, in the order the words appear */
  const PAIRS: [InkKey, InkKey][] = [
    ["pink", "blue"],
    ["blue", "pink"],
    ["pink", "yellow"],
    ["blue", "yellow"],
  ];
  const inks = PAIRS[Math.floor(seed / 7) % PAIRS.length];
  const found: { m: Motif; i: number }[] = [
    ...KEYWORDS.map((k) => ({ m: k.key as Motif, i: firstIndex(text, k.re) })),
    { m: "schedule" as Motif, i: firstIndex(text, EXTRA.schedule) },
    { m: "people" as Motif, i: firstIndex(text, EXTRA.people) },
    { m: "shop" as Motif, i: firstIndex(text, EXTRA.shop) },
  ]
    .filter((f) => f.i >= 0)
    .sort((a, b) => a.i - b.i);
  const motifs: [Motif, Motif] = [found[0]?.m ?? "sun", found[1]?.m ?? (found[0] ? "sun" : "people")];

  const hex = (seed % 65536).toString(16).toUpperCase().padStart(4, "0");
  const num = String(Math.floor(seed / 65536) % 10000).padStart(4, "0");

  return {
    text,
    seed,
    id: `${hex}-${num}`,
    title: makeTitle(text, seed),
    detected,
    screens,
    agents,
    tables,
    connections: conns,
    askFirst,
    credits,
    dollars: (credits * 0.02).toFixed(2),
    minutes,
    files,
    inks,
    motifs,
    tilt: (r() - 0.5) * 1.6,
  };
}

export const PERM_LABEL: Record<Perm, string> = { read: "Read", change: "Change", undo: "Can't undo", ask: "Ask first" };
