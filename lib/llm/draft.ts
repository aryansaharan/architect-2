import { z } from "zod";
import type { Blueprint, Connection } from "@/lib/blueprint/schema";

/**
 * What the model is asked to produce: the *decisions* (what data, which agents,
 * which tools and how risky they are, which screens). Layout, ids, sample-data
 * typing and estimates are filled in deterministically by expand.ts.
 * Kept free of min/max/records so it maps cleanly onto strict structured outputs.
 */
export const DraftSchema = z.object({
  name: z.string().describe("Short product name, 2–4 words, Title Case, no company name"),
  tagline: z.string().describe("One sentence, under 12 words, outcome-focused"),
  summary: z.string().describe("2–3 plain-English sentences a non-technical manager would understand"),
  vertical: z.enum(["claims", "support", "sales", "hr", "custom"]),
  company: z.string().describe("A fictional company name that fits the brief, or the one named in the brief"),
  entities: z
    .array(
      z.object({
        name: z.string().describe("Singular, Title Case, e.g. 'Ticket'"),
        plural: z.string(),
        description: z.string().describe("One plain sentence"),
        fields: z
          .array(
            z.object({
              name: z.string().describe("snake_case"),
              label: z.string(),
              type: z.enum(["string", "number", "boolean", "date", "enum", "money", "text"]),
              options: z.array(z.string()).describe("Only for enum fields (3–6 options); otherwise an empty array"),
            }),
          )
          .describe("4–8 fields; the first field is the human-readable identifier"),
        sampleRows: z
          .array(z.array(z.string()))
          .describe("5 realistic rows; each row lists one value per field, in the same order as fields. Dates as YYYY-MM-DD. Money and numbers as plain numbers. Fictional people only."),
      }),
    )
    .describe("2–4 kinds of data the app stores"),
  connections: z
    .array(
      z.object({
        name: z.string().describe("Product name, e.g. 'Gmail', 'Salesforce', 'Stripe'"),
        kind: z.enum(["database", "crm", "email", "http", "mcp", "slack", "calendar", "payments", "storage", "docs"]),
        auth: z.enum(["oauth", "api_key", "none"]),
        description: z.string().describe("One plain sentence about what it's used for"),
      }),
    )
    .describe("3–5 outside systems, including one 'database' connection for the app's own data"),
  agents: z
    .array(
      z.object({
        name: z.string().describe("Two words max, a job title, e.g. 'Reply Drafter'"),
        role: z.string().describe("Under 6 words"),
        description: z.string().describe("2 plain sentences: what it does and what it never does"),
        jobDescription: z.string().describe("The agent's system prompt, 3–5 sentences, second person"),
        rules: z.array(z.string()).describe("2–4 short guardrails, each under 12 words"),
        supervision: z.enum(["autonomous", "spot_check", "approve_all"]),
        memory: z.enum(["none", "session", "project", "org"]),
        tools: z
          .array(
            z.object({
              name: z.string().describe("Verb phrase, e.g. 'Send reply'"),
              description: z.string(),
              connection: z.string().describe("Exactly one of the connection names above"),
              access: z
                .enum(["read", "write", "irreversible"])
                .describe("read = looks things up; write = changes records inside the app (can be undone); irreversible = sends messages, moves money, creates or deletes outside accounts"),
            }),
          )
          .describe("2–4 tools; at least one agent in the project should have an irreversible tool"),
        rehearsals: z
          .array(z.object({ name: z.string(), input: z.string(), expect: z.string() }))
          .describe("2 test conversations: one typical case, one tricky edge case"),
      }),
    )
    .describe("2–3 agents with clearly separated jobs"),
  screens: z
    .array(
      z.object({
        title: z.string().describe("2–3 words"),
        purpose: z.string().describe("One sentence"),
        description: z.string().describe("2 plain sentences for a non-technical reader"),
        kind: z.enum(["queue", "dashboard", "detail", "form", "assistant", "report"]),
        entity: z.string().describe("Name of the main data type shown (one of the entity names), or empty"),
        agent: z.string().describe("Name of the agent available on this screen, or empty"),
        audience: z.enum(["team", "customer", "admin"]),
        metrics: z
          .array(z.object({ label: z.string(), value: z.string() }))
          .describe(
            "2–4 headline numbers for queue/dashboard/report screens; otherwise empty. The app counts them from the entity's sample rows, so each label names what to count: an enum option exactly ('Awaiting approval'), the data type with 'Open' ('Open requests'), a money field ('Total amount'), or a time window on a date field ('New today'). Values must match the sample rows.",
          ),
      }),
    )
    .describe("3–5 screens; start with the screen people open first; include one 'detail' screen"),
});
export type Draft = z.infer<typeof DraftSchema>;

export const PLANNER_INSTRUCTIONS = `You are the planner inside Prod AI, a platform where people describe an agentic business app and it gets built for them.
Turn the user's brief into a concrete plan: the data the app stores, the outside systems it connects to, the AI agents that do the work (with the tools they may use and how risky each tool is), and the screens people use.

Principles:
- Serve two readers at once: every "description" is plain English for a non-technical manager; every "jobDescription" is a precise system prompt an engineer would respect.
- Be honest about risk. Mark any tool that sends a message, moves money, creates or deletes an outside account, or publishes anything as "irreversible". Changing a record inside the app is "write". Looking something up is "read".
- Prefer fewer, sharper agents with separated jobs over many overlapping ones.
- Sample data must be realistic and specific to the brief, with fictional names.
- Keep it buildable: 3–5 screens, 2–3 agents, 2–4 data types, 3–5 connections.
- Respect the answers to the quick questions. When they name the systems it must connect to (often several, comma-separated, e.g. "Email, SMS"), plan a connection for each one. If they say nothing is connected yet ("Nothing yet", "Nowhere yet", "None yet"), never assume an outside system is already set up: plan only the outside systems the agents truly need (fewer is better). They will be shown as needing setup.`;

const NOTHING = /^(nothing|nowhere|none) yet$/i;

/** True when the connections answer is "Nothing yet" (or "Nowhere yet" / "None yet") and nothing else. */
export function isNothingOnly(connections: string[]): boolean {
  const picked = connections.map((c) => c.trim()).filter(Boolean);
  return picked.length > 0 && picked.every((c) => NOTHING.test(c));
}

/**
 * True when the person answered the "what must it connect to?" question with
 * "Nothing yet" (or "Nowhere yet" / "None yet") alone: see lib/blueprint/questions.ts.
 * The question takes several answers now ("Email, SMS"); a line that lists a
 * real system next to "Nothing yet" doesn't count as nothing connected.
 */
export function saysNothingConnected(answers: string): boolean {
  return answers.split("\n").some((line) => {
    const answer = line.includes("?") ? line.slice(line.lastIndexOf("?") + 1) : line;
    return isNothingOnly(answer.split(","));
  });
}

/** Clean the multi-select from the questions step: strings only, short, at most 8. */
export function cleanConnections(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 40)).filter(Boolean))].slice(0, 8);
  return out.length ? out : null;
}

type Wanted = { match: (c: Connection) => boolean; add: Omit<Connection, "id" | "status"> & { id: string } };
/** What each answer to "what must it connect to?" means as a connection (lib/blueprint/questions.ts and components/new/connections.ts). */
const WANTED: Record<string, Wanted> = {
  email: { match: (c) => c.kind === "email", add: { id: "email", name: "Email", kind: "email", auth: "oauth", plain: "Reads and sends email (Gmail or Outlook). Needs setup." } },
  "shared inbox": { match: (c) => c.kind === "email", add: { id: "shared-inbox", name: "Shared inbox", kind: "email", auth: "oauth", plain: "The support inbox where tickets arrive. Needs setup." } },
  sms: { match: (c) => /\b(sms|twilio|text)/i.test(`${c.name} ${c.plain}`), add: { id: "sms", name: "SMS (Twilio)", kind: "http", auth: "api_key", plain: "Sends and receives text messages. Needs setup." } },
  slack: { match: (c) => c.kind === "slack", add: { id: "slack", name: "Slack", kind: "slack", auth: "oauth", plain: "Posts updates and alerts to your team's channels. Needs setup." } },
  "a crm": { match: (c) => c.kind === "crm", add: { id: "crm", name: "CRM", kind: "crm", auth: "oauth", plain: "Your customer records (HubSpot, Salesforce or similar). Needs setup." } },
  hubspot: { match: (c) => c.kind === "crm", add: { id: "hubspot", name: "HubSpot", kind: "crm", auth: "oauth", plain: "Your customer records and deals. Needs setup." } },
  salesforce: { match: (c) => c.kind === "crm", add: { id: "salesforce", name: "Salesforce", kind: "crm", auth: "oauth", plain: "Your customer records and opportunities. Needs setup." } },
  payments: { match: (c) => c.kind === "payments", add: { id: "payments", name: "Stripe", kind: "payments", auth: "api_key", plain: "Takes and refunds payments. Needs setup." } },
  calendar: { match: (c) => c.kind === "calendar" || /calendar|outlook|microsoft 365|google workspace/i.test(c.name), add: { id: "calendar", name: "Google Calendar", kind: "calendar", auth: "oauth", plain: "Checks availability and books time. Needs setup." } },
  spreadsheet: { match: (c) => c.kind === "docs" || /sheet|excel|airtable/i.test(c.name), add: { id: "spreadsheet", name: "Google Sheets", kind: "docs", auth: "oauth", plain: "The spreadsheet this work lives in today. Needs setup." } },
  "policy system": { match: (c) => /policy/i.test(c.name), add: { id: "policy-system", name: "Policy system", kind: "http", auth: "api_key", plain: "Looks up policies and coverage. Needs setup." } },
  "hr system (workday)": { match: (c) => /workday|hris|hr system/i.test(c.name), add: { id: "workday", name: "Workday", kind: "http", auth: "oauth", plain: "The HR system of record for new hires. Needs setup." } },
  "identity (okta)": { match: (c) => /okta|identity|sso/i.test(c.name), add: { id: "okta", name: "Okta", kind: "http", auth: "api_key", plain: "Creates and removes accounts. Needs setup." } },
  "laptops & procurement": { match: (c) => /procure|laptop|equipment/i.test(c.name), add: { id: "procurement", name: "Procurement", kind: "http", auth: "api_key", plain: "Orders laptops and equipment. Needs setup." } },
  zendesk: { match: (c) => /zendesk/i.test(c.name), add: { id: "zendesk", name: "Zendesk", kind: "http", auth: "oauth", plain: "Where tickets live today. Needs setup." } },
  intercom: { match: (c) => /intercom/i.test(c.name), add: { id: "intercom", name: "Intercom", kind: "http", auth: "oauth", plain: "Where conversations live today. Needs setup." } },
};

/** Extra prompt line for the planner when specific systems were chosen. */
export function connectionsNote(connections: string[]): string {
  return `Important: it must connect to ${connections.join(", ")}. Plan one outside connection for each of these (a real product that fits, e.g. Gmail for Email, Twilio for SMS), give the agents the tools that use them, and add others only if the agents truly need them.`;
}

/**
 * Deterministic guard that holds even if the model (or the offline starter)
 * ignores the answer: every chosen system appears as a connection. Ones the
 * plan lacked are added as needing setup. The app's database is untouched.
 */
export function ensureConnections(bp: Blueprint, connections: string[]): Blueprint {
  const next = [...bp.connections];
  const ids = new Set(next.map((c) => c.id));
  for (const pick of connections) {
    const w = WANTED[pick.trim().toLowerCase()];
    if (!w || next.some(w.match) || next.length >= 8) continue;
    let id = w.add.id;
    for (let n = 2; ids.has(id); n++) id = `${w.add.id}-${n}`;
    ids.add(id);
    next.push({ ...w.add, id, status: "missing" });
  }
  return next.length === bp.connections.length ? bp : { ...bp, connections: next };
}

/** Extra prompt line for the planner when nothing is connected yet. */
export const NOTHING_CONNECTED_NOTE = "Important: nothing is connected yet. Plan only the outside systems the agents truly need. Every one of them starts as needing setup; none is already connected.";

/**
 * Deterministic guard that holds even if the model ignores the prompt: when
 * nothing is connected yet, every outside connection starts as "missing"
 * (needs setup, runs on test data). Only the app's own database is ready.
 */
export function markNothingConnected(bp: Blueprint): Blueprint {
  return { ...bp, connections: bp.connections.map((c) => (c.kind === "database" ? c : { ...c, status: "missing" as const })) };
}
