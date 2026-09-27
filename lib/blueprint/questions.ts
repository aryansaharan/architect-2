import type { Vertical } from "./schema";
import { noEmDash } from "@/lib/text";

export type Question = { id: string; label: string; options: string[]; defaultIndex: number };

/**
 * The three quick questions asked before planning. The model writes them for
 * each brief (lib/llm/questions.ts, POST /api/questions); these templates are
 * the instant fallback shown while it does, and whenever it can't.
 */

const CAREFUL: Question = {
  id: "care",
  label: "How careful should the agents be?",
  options: ["Ask me before anything leaves the building", "Act, then tell me", "Fully on their own"],
  defaultIndex: 0,
};

const BY_VERTICAL: Record<Vertical, Question[]> = {
  claims: [
    { id: "users", label: "Who uses it day to day?", options: ["Claims handlers", "Adjusters", "Team leads", "Policyholders too"], defaultIndex: 0 },
    { id: "systems", label: "What must it connect to?", options: ["Policy system", "Payments", "Email", "Nothing yet"], defaultIndex: 0 },
    CAREFUL,
  ],
  support: [
    { id: "users", label: "Who answers tickets today?", options: ["A small support team", "Tier 1 + tier 2", "Founders", "An outsourced team"], defaultIndex: 0 },
    { id: "systems", label: "Where do tickets live?", options: ["Zendesk", "Intercom", "Shared inbox", "Nowhere yet"], defaultIndex: 0 },
    CAREFUL,
  ],
  sales: [
    { id: "users", label: "Who is it for?", options: ["SDRs", "Account executives", "Founders", "RevOps"], defaultIndex: 0 },
    { id: "systems", label: "Which CRM?", options: ["HubSpot", "Salesforce", "Spreadsheet", "None yet"], defaultIndex: 0 },
    CAREFUL,
  ],
  hr: [
    { id: "users", label: "Who runs onboarding?", options: ["People team", "IT", "Hiring managers", "All three"], defaultIndex: 3 },
    { id: "systems", label: "What must it connect to?", options: ["HR system (Workday)", "Identity (Okta)", "Laptops & procurement", "Nothing yet"], defaultIndex: 0 },
    CAREFUL,
  ],
  custom: [
    { id: "users", label: "Who is it for?", options: ["My team", "Our customers", "Both"], defaultIndex: 0 },
    { id: "systems", label: "What must it connect to?", options: ["Email", "Slack", "A CRM", "Nothing yet"], defaultIndex: 3 },
    CAREFUL,
  ],
};

/** "Onboarding" alone reads as HR; onboarding clients or customers is not about new hires. */
const CLIENT_ONBOARDING = /\b(clients?|customers?|accounts?)\b[^.]{0,40}\bonboard|\bonboard\w*\s+(?:of\s+)?(?:new\s+)?(?:clients?|customers?|accounts?)\b/i;
const EMPLOYEE_ONBOARDING = /\b(new hires?|employees?|people team|hiring|payroll|laptops?)\b/i;

export function questionsFor(v: Vertical, brief = ""): Question[] {
  if (v === "hr" && CLIENT_ONBOARDING.test(brief) && !EMPLOYEE_ONBOARDING.test(brief)) return BY_VERTICAL.custom;
  return BY_VERTICAL[v] ?? BY_VERTICAL.custom;
}

export function renderAnswers(qs: Question[], answers: Record<string, string>): string {
  return qs
    .map((q) => `${q.label} ${answers[q.id] ?? q.options[q.defaultIndex]}`)
    .join("\n");
}

// ── Systems a brief names ──────────────────────────────────────────────────

/** Well-known products, as they are usually written, with the ways a brief names them. */
const SYSTEMS: [string, RegExp][] = [
  ["Google Drive", /\b[Gg]oogle [Dd]rive\b|\b[Gg][Dd]rive\b|\b(?:in|on|to|from|via|into|with|and|or) (?:our |the |their )?Drive\b/],
  ["Google Sheets", /\bgoogle sheets?\b/i],
  ["Google Docs", /\bgoogle docs?\b/i],
  ["Google Calendar", /\bgoogle calendar\b/i],
  ["Gmail", /\bgmail\b/i],
  ["Outlook", /\bOutlook\b/],
  ["Microsoft Teams", /\b(microsoft|ms) teams\b/i],
  ["OneDrive", /\bone ?drive\b/i],
  ["SharePoint", /\bsharepoint\b/i],
  ["Excel", /\bExcel\b/],
  ["Dropbox", /\bdropbox\b/i],
  ["Box", /\b(?:in|on|to|from|via|into|with|and|or) Box\b/],
  ["QuickBooks", /\bquick ?books\b|\bQBO\b/i],
  ["Xero", /\bxero\b/i],
  ["NetSuite", /\bnet ?suite\b/i],
  ["FreshBooks", /\bfresh ?books\b/i],
  ["Sage", /\bSage (?:Intacct|50|100|accounting|Business Cloud)\b|\b(?:in|to|from|with|and|or) Sage\b/],
  ["Stripe", /\bstripe\b/i],
  ["PayPal", /\bpaypal\b/i],
  ["Square", /\bSquare (?:POS|payments?)\b|\b(?:in|to|from|with|via|and|or) Square\b/],
  ["Shopify", /\bshopify\b/i],
  ["Salesforce", /\bsalesforce\b/i],
  ["HubSpot", /\bhub ?spot\b/i],
  ["Pipedrive", /\bpipedrive\b/i],
  ["Zoho", /\bzoho\b/i],
  ["Zendesk", /\bzendesk\b/i],
  ["Intercom", /\bintercom\b/i],
  ["Freshdesk", /\bfreshdesk\b/i],
  ["Jira", /\bjira\b/i],
  ["Linear", /\bLinear (?:issues?|tickets?)\b|\b(?:in|to|from|with|and|or) Linear\b/],
  ["Asana", /\bAsana\b/],
  ["Trello", /\btrello\b/i],
  ["Monday.com", /\bmonday\.com\b/i],
  ["Notion", /\bNotion\b/],
  ["Confluence", /\bconfluence\b/i],
  ["Airtable", /\bairtable\b/i],
  ["Slack", /\bslack\b/i],
  ["Zoom", /\bZoom\b/],
  ["Calendly", /\bcalendly\b/i],
  ["DocuSign", /\bdocu ?sign\b/i],
  ["Twilio", /\btwilio\b/i],
  ["WhatsApp", /\bwhats ?app\b/i],
  ["Workday", /\bworkday\b/i],
  ["BambooHR", /\bbamboo ?hr\b/i],
  ["Gusto", /\bGusto\b/],
  ["Rippling", /\brippling\b/i],
  ["Okta", /\bokta\b/i],
  ["Greenhouse", /\bGreenhouse\b/],
  ["GitHub", /\bgithub\b/i],
  ["Mailchimp", /\bmailchimp\b/i],
  ["Typeform", /\btypeform\b/i],
  ["SAP", /\bSAP\b/],
  ["Snowflake", /\bSnowflake\b/],
  ["Epic", /\bEpic\b(?= (?:EHR|EMR|systems?)\b)/],
  ["Clio", /\bclio\b/i],
  ["Karbon", /\bkarbon\b/i],
];

/** Products the brief names itself, in the order it names them ("… in Google Drive and QuickBooks" → both). */
export function systemsNamedIn(brief: string): string[] {
  return SYSTEMS.map(([name, re]) => ({ name, at: brief.search(re) }))
    .filter((s) => s.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((s) => s.name);
}

const GENERIC_TOKEN = /^(google|microsoft|client|clients|customer|customers|team|shared|internal|online|cloud|system|systems|portal|app|apps|data|the|our|your|new|tool|tools|platform|software|service|services|api|hub)$/i;

/**
 * True when the brief itself names this option: the whole name (any case), or
 * one of its capitalised product words written the same way ("files in Drive"
 * names "Google Drive"; "drive revenue" does not).
 */
export function briefMentions(brief: string, option: string): boolean {
  const name = option.replace(/\([^)]*\)/g, " ").replace(/^an?\s+/i, "").trim();
  if (!name) return false;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`\\b${esc(name)}\\b`, "i").test(brief)) return true;
  const tokens = name.split(/[^A-Za-z0-9.]+/).filter((t) => t.length >= 3 && /^[A-Z]/.test(t) && !GENERIC_TOKEN.test(t));
  return tokens.some((t) => new RegExp(`\\b${esc(t)}\\b`).test(brief));
}

// ── Questions the model wrote ──────────────────────────────────────────────

/** What the model returns for the three questions (see lib/llm/questions.ts). */
export type ModelQuestions = {
  users: { label: string; options: string[]; defaultOption: string };
  systems: { label: string; options: string[] };
  risk: { label: string; options: string[]; defaultOption: string };
};

const NOTHING = /^(nothing|nowhere|none)( yet)?$/i;

function tidy(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  let out = noEmDash(s).replace(/\s+/g, " ").trim().replace(/[.;,:!]+$/, "");
  if (out.length > max) out = out.slice(0, max).replace(/\s+\S*$/, "");
  return out;
}

function tidyOptions(list: unknown, max: number, width: number): string[] {
  const out: string[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const o = tidy(raw, width);
    if (!o || NOTHING.test(o) || out.some((x) => x.toLowerCase() === o.toLowerCase())) continue;
    out.push(o);
    if (out.length >= max) break;
  }
  return out;
}

function tidyLabel(s: unknown): string {
  const l = typeof s === "string" ? noEmDash(s).replace(/\s+/g, " ").trim().slice(0, 100).replace(/[.;,:!?]+$/, "") : "";
  return l ? `${l}?` : "";
}

/**
 * Turns the model's questions into the ones shown, or null when they aren't
 * usable (the templates stay). Deterministic guards that hold whatever the
 * model wrote: 2–4 options each, no duplicates, a default that exists, every
 * product the brief names offered as a connection, and "Nothing yet" last.
 */
export function questionsFromModel(raw: ModelQuestions | null | undefined, brief: string): Question[] | null {
  if (!raw) return null;
  const single = (id: string, q: { label: string; options: string[]; defaultOption: string } | undefined, width: number): Question | null => {
    const label = tidyLabel(q?.label);
    const options = tidyOptions(q?.options, 4, width);
    if (!label || options.length < 2) return null;
    const want = tidy(q?.defaultOption, width).toLowerCase();
    return { id, label, options, defaultIndex: Math.max(0, options.findIndex((o) => o.toLowerCase() === want)) };
  };
  const users = single("users", raw.users, 40);
  const risk = single("risk", raw.risk, 60);

  const named = systemsNamedIn(brief);
  let systems = tidyOptions(raw.systems?.options, 6, 40);
  const has = (name: string) => systems.some((o) => o.toLowerCase() === name.toLowerCase() || briefMentions(name, o) || briefMentions(o, name));
  const missing = named.filter((n) => !has(n));
  // Named products come first; the model's other suggestions fill the rest (6 at most).
  systems = [...missing, ...systems].slice(0, Math.max(6, missing.length));
  const systemsLabel = tidyLabel(raw.systems?.label) || "What must it connect to?";
  if (!users || !risk || systems.length < 2) return null;
  const options = [...systems, "Nothing yet"];
  // Pre-select what the brief names; when it names nothing, don't assume a connection: "Nothing yet".
  const firstNamed = options.findIndex((o) => briefMentions(brief, o));
  return [users, { id: "systems", label: systemsLabel, options, defaultIndex: firstNamed >= 0 ? firstNamed : options.length - 1 }, risk];
}
