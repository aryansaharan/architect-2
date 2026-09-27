import { briefMentions, systemsNamedIn, type Question } from "@/lib/blueprint/questions";

/**
 * "What must it connect to?" read from the brief. Options the brief already
 * names are pre-selected (and added when the canned list lacks them), and the
 * question takes several answers. "Nothing yet" stays exclusive.
 */

/** "Nothing yet", "Nowhere yet", "None yet": an answer that means no outside system. */
export const isNothingOption = (o: string) => /^(nothing|nowhere|none) yet$/i.test(o.trim());

/** Keywords that name each option. Keys are option labels as they appear in lib/blueprint/questions.ts, plus extras. */
const SIGNALS: Record<string, RegExp> = {
  Email: /\b(e-?mails?|e-?mailed|e-?mailing|gmail|outlook|inbox(es)?|mailbox(es)?)\b/i,
  SMS: /\b(sms|mms|texts|texted|texting|text messages?|twilio|whatsapp)\b|\btext\s+(them|him|her|me|us|you|back|tenants?|customers?|clients?|residents?|patients?|users?|people|updates?|reminders?|alerts?|notifications?)\b|\b(by|via|over|a)\s+text\b/i,
  Slack: /\bslack\b/i,
  // "A simple CRM for a bakery" is the app itself, not a CRM to connect to: it takes a named CRM or "our/existing CRM".
  "A CRM": /\b(hubspot|salesforce|pipedrive|zoho)\b|\b(our|their|my|your|existing|current) crm\b|\b(from|into|in|to|with) (the |our |their )?crm\b/i,
  Payments: /\b(stripe|payments?|payouts?|invoic\w*|billing|refunds?|paypal|rent collection|collect rent)\b/i,
  Calendar: /\b(calendars?|calendly|appointments?)\b/i,
  "Policy system": /\b(policy (system|admin)|guidewire|duck creek)\b/i,
  "HR system (Workday)": /\b(workday|hris|bamboo ?hr|hr system)\b/i,
  "Identity (Okta)": /\b(okta|sso|active directory|azure ad|entra|identity provider)\b/i,
  "Laptops & procurement": /\b(laptops?|procure\w*|equipment|hardware)\b/i,
  Zendesk: /\bzendesk\b/i,
  Intercom: /\bintercom\b/i,
  "Shared inbox": /\b(shared inbox|support@|help@|gmail|outlook|e-?mails?)\b/i,
  HubSpot: /\bhubspot\b/i,
  Salesforce: /\bsalesforce\b/i,
  Spreadsheet: /\b(spreadsheets?|google sheets?|excel|airtable)\b/i,
};

/** Options that may be added to a "What must it connect to?" list when the brief names them. */
const EXTRAS = ["Email", "SMS", "Slack", "A CRM", "Payments", "Calendar"];

/** Aliases so an extra isn't added next to an option that already covers it ("A CRM" vs "HubSpot"). */
const COVERS: Record<string, RegExp> = { "A CRM": /crm|hubspot|salesforce/i, Email: /e-?mail|inbox/i, Payments: /payment|stripe/i };

export function isConnectionsQuestion(q: Question): boolean {
  return q.id === "systems";
}

/** An option that already covers `x` ("A CRM" covers HubSpot, "Email" covers Gmail). */
const covered = (x: string, options: string[]) => options.some((o) => o.toLowerCase() === x.toLowerCase() || COVERS[x]?.test(o) || SIGNALS[o]?.test(x) || SIGNALS[x]?.test(o) || briefMentions(o, x) || briefMentions(x, o));

/**
 * The connections question for this brief: options (with any the brief names) and the answers to pre-select.
 * Works for the templates and for the questions the model wrote: products the brief names ("Google Drive",
 * "QuickBooks") are offered even when the template lacks them, and pre-selected.
 */
export function connectionsFor(q: Question, brief: string): { question: Question; preselected: string[]; fromBrief: string[] } {
  const nothing = q.options.find(isNothingOption);
  const base = q.options.filter((o) => !isNothingOption(o));
  const connectTo = /connect/i.test(q.label);
  const extras: string[] = [];
  if (connectTo) {
    for (const x of systemsNamedIn(brief).slice(0, 4)) if (!covered(x, [...base, ...extras])) extras.push(x);
    for (const x of EXTRAS) if (SIGNALS[x].test(brief) && !covered(x, [...base, ...extras])) extras.push(x);
  }
  const options = [...base, ...extras, ...(nothing ? [nothing] : [])];
  const fromBrief = options.filter((o) => !isNothingOption(o) && (SIGNALS[o]?.test(brief) || briefMentions(brief, o)));
  const fallback = q.options[q.defaultIndex];
  const preselected = fromBrief.length ? fromBrief : fallback ? [fallback] : [];
  return { question: { ...q, options, defaultIndex: Math.max(0, options.indexOf(preselected[0] ?? fallback)) }, preselected, fromBrief };
}

/** Toggle one option. "Nothing yet" clears the rest; anything else clears "Nothing yet"; the last one can't be cleared. */
export function toggleConnection(current: string[], option: string, options: string[]): string[] {
  if (isNothingOption(option)) return [option];
  const without = current.filter((o) => !isNothingOption(o));
  const next = without.includes(option) ? without.filter((o) => o !== option) : [...without, option];
  if (next.length) return options.filter((o) => next.includes(o));
  const nothing = options.find(isNothingOption);
  return nothing ? [nothing] : current;
}
