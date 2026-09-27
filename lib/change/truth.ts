import { sortPhrase, type Block, type Blueprint } from "@/lib/blueprint/schema";
import { list, PERMISSION_LABEL, SUPERVISION_LABEL } from "@/lib/blueprint/describe";

/**
 * A Work Order may only promise what its operations do. The model writes the summary and rationale,
 * so after its edits compile, the text is read back against the blueprint they produce: every claim
 * of sorting, filtering, notifying or approval needs an operation that does it. A claim with nothing
 * behind it is sent back to the model once; if it's still there, the text is rewritten to say
 * plainly what's included and what isn't.
 */

export type ClaimKind = "sort" | "filter" | "notify" | "approval";
export type Claim = { kind: ClaimKind; phrase: string };

type Table = Extract<Block, { type: "table" }>;

const SORT = [
  /\bsort(?:s|ed|ing)?\b(?! of\b)/,
  /\b(?:order(?:s|ed)?|rank(?:s|ed)?|arrange(?:s|d)?|group(?:s|ed)?)\s+(?:[a-z'’-]+\s+){0,3}by\b/,
  /\b(?:to|at|on)\s+(?:the\s+)?top\b(?!\s+of\s+(?:the\s+|each\s+|every\s+)?(?:screen|page|dashboard|form|card|sidebar|app|panel)\b)/,
  /\b(?:first|top|last|bottom)\s+(?:of|in)\s+(?:the\s+|each\s+|every\s+)?(?:list|table|queue|inbox|view)\b/,
  /\b(?:come|comes|appear|appears|show up|shows up|are listed|is listed|are shown|is shown|sit|sits|go|goes|stay|stays|land|lands|rise|rises|float|floats|jump|jumps|move|moves)\s+(?:up\s+)?(?:first|last)\b/,
  /\b(?:urgent|highest|lowest|newest|oldest|latest|earliest|most recent|biggest|largest|smallest|overdue|flagged|critical|high[- ]priority|top[- ]priority)\b(?:\s+[a-z'’-]+){0,3}\s+first\b/,
  /\b(?:highest|lowest|newest|oldest|latest|earliest|largest|smallest)\s+to\s+(?:lowest|highest|oldest|newest|latest|earliest|largest|smallest)\b/,
  /\b(?:descending|ascending)\b/,
];
const FILTER = [/\bfilter(?:s|ed|ing|able)?\b/, /\bonly\s+(?:show|shows|showing|list|lists|display|displays)\b/, /\bnarrows?\s+(?:[a-z]+\s+){0,2}down\b/];
const NOTIFY = [
  /\bnotif(?:y|ies|ied|ying|ication|ications)\b/,
  /\b(?:send|sends|sent|sending|post|posts|posted|posting)\s+(?:[a-z'’-]+\s+){0,3}(?:e-?mails?|messages?|alerts?|reminders?|notifications?|pings?|texts?|sms|digests?)\b/,
  /\b(?:e-?mail(?:s|ed|ing)?|alert(?:s|ed|ing)?|ping(?:s|ed|ing)?|remind(?:s|ed|ing)?)\s+(?:the|them|you|him|her|their|each|every|your|someone|people|whoever|managers?|adjusters?|customers?|owners?|on-?call)\b/,
  /\blets?\s+(?:the\s+|them\s+|you\s+|your\s+|their\s+)?(?:[a-z'’-]+\s+){0,2}know\b/,
  /\bpag(?:e|es|ed|ing)\s+(?:the\s+)?on-?call\b/,
  /\b(?:in|to|on|via)\s+slack\b|\bslack\s+(?:message|alert|post)s?\b/,
];
const APPROVAL = [
  /\bask(?:s|ing)?\s+(?:a person|a human|someone|you|first|before|for (?:approval|sign-?off|permission))\b/,
  /\b(?:needs?|requires?|waits?\s+for|waiting\s+for|gets?)\s+(?:a\s+|an\s+)?(?:person'?s\s+|human'?s\s+|your\s+|manager'?s\s+|manual\s+|explicit\s+)?(?:approval|sign-?off|sign off|ok|okay|go-ahead)\b/,
  /\bapproval gate\b/,
  /\b(?:must|has to|have to|needs? to) be approved\b/,
  /\bwithout (?:asking|approval)\b/,
];
const PATTERNS: Record<ClaimKind, RegExp[]> = { sort: SORT, filter: FILTER, notify: NOTIFY, approval: APPROVAL };

/** Clauses, with where each starts in the text, split on sentence ends, commas and joining words. */
function clauses(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const re = /[.;!?]+\s+|,\s+|\s+(?:and|so that|so|which|while|then|to make sure|making)\s+/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push({ text: text.slice(last, m.index), start: last });
    last = m.index + m[0].length;
  }
  out.push({ text: text.slice(last), start: last });
  return out.filter((c) => c.text.trim());
}

/** Column placement ("as the first column", "Priority column appears first") is not a claim about row order. */
const columnPlacement = (c: string) => /\bcolumns?\b/.test(c) && /\b(?:first|second|third|fourth|last|left|leftmost|right|position|after|before|next to|start|end)\b/.test(c) && !/\b(?:sort|rank|order(?:ed|s)? by|rows?)\b/.test(c);

/** "It doesn't sort the table" says what's left out: that's not a promise. */
const NEGATED = /\b(?:doesn'?t|does not|don'?t|do not|won'?t|will not|isn'?t|is not|aren'?t|are not|not|never|can'?t|cannot|couldn'?t|no longer)\b/;

/**
 * Every claim the text makes: the kind, and the clause that makes it. Clauses that say something
 * doesn't happen are skipped, unless `mentions` is set (then any mention of the kind counts).
 */
export function claimsIn(text: string, opts: { mentions?: boolean } = {}): Claim[] {
  const out: Claim[] = [];
  for (const c of clauses(text)) {
    const lower = c.text.toLowerCase().replace(/[’‘]/g, "'");
    if (!opts.mentions && NEGATED.test(lower)) continue;
    for (const kind of Object.keys(PATTERNS) as ClaimKind[]) {
      if (kind === "sort" && columnPlacement(lower)) continue;
      if (PATTERNS[kind].some((re) => re.test(lower))) out.push({ kind, phrase: c.text.trim() });
    }
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const tablesOf = (bp: Blueprint) => new Map(bp.screens.flatMap((s) => [...s.regions.main, ...s.regions.side]).filter((b): b is Table => b.type === "table").map((t) => [t.id, t]));

/** Whether any operation actually does what a claim of this kind says. */
function backed(kind: ClaimKind, before: Blueprint, after: Blueprint): boolean {
  const was = tablesOf(before);
  const now = [...tablesOf(after).values()];
  if (kind === "sort") return now.some((t) => !same(t.sort ?? null, was.get(t.id)?.sort ?? null));
  if (kind === "filter") return now.some((t) => !same(t.filters, was.get(t.id)?.filters ?? []));
  const agentsBefore = new Map(before.agents.map((a) => [a.id, a]));
  if (kind === "approval") {
    return after.agents.some((a) => {
      const b = agentsBefore.get(a.id);
      return !b || a.supervision !== b.supervision || a.tools.some((t) => b.tools.find((x) => x.id === t.id)?.permission !== t.permission);
    });
  }
  // notify: an agent's rules, tools or triggers changed, or an agent or connection was added. That's as far as a blueprint can express it.
  return after.agents.some((a) => !same(a, agentsBefore.get(a.id))) || !same(after.connections, before.connections);
}

/** Claims in the text that no operation backs. */
export function unbackedClaims(text: string, before: Blueprint, after: Blueprint): Claim[] {
  return claimsIn(text).filter((c) => !backed(c.kind, before, after));
}

/** Exact instructions for the model's retry. */
export function claimFeedback(all: Claim[]): string {
  const gaps = all.filter((g, i) => all.findIndex((x) => x.kind === g.kind) === i);
  const fix: Record<ClaimKind, string> = {
    sort: "no edit sorts a table: add a sortTables entry (for an enum field, order lists its options top first, e.g. ['Urgent','High','Normal','Low'])",
    filter: "no edit adds a filter: add an addFilters entry",
    notify: "no edit makes anyone get notified: add a rule to the agent that sends it (and a permission if a tool is involved)",
    approval: "no permission or supervision changes: add a permissions edit (permission \"ask\") or a supervision edit",
  };
  return `your summary or rationale promises something no edit does. ${gaps.map((g) => `It says “${g.phrase}”, but ${fix[g.kind]}`).join(". ")}. Add the missing edit, or if it can't be done, leave that promise out of the summary and rationale`;
}

/** What each kind of missing promise means for the person reading the quote. */
const LEFT_OUT: Record<ClaimKind, string> = {
  sort: "It doesn't change the order rows appear in.",
  filter: "It doesn't add a filter.",
  notify: "It doesn't send anyone a notification or message.",
  approval: "It doesn't change who has to approve what.",
};

/** Everything the change does, in plain words, read from the blueprint before and after (never from the model). */
export function describeChanges(before: Blueprint, after: Blueprint): string[] {
  const out: string[] = [];
  const entityOf = (bp: Blueprint, id: string) => bp.entities.find((e) => e.id === id);
  const labelOf = (bp: Blueprint, entityId: string, f: string) => entityOf(bp, entityId)?.fields.find((x) => x.name === f)?.label ?? f.replace(/_/g, " ");

  if (before.meta.name !== after.meta.name) out.push(`renames the app to “${after.meta.name}”`);
  if (before.meta.theme.primary !== after.meta.theme.primary) out.push(`changes the brand colour to ${after.meta.theme.primary}`);
  if (before.meta.theme.radius !== after.meta.theme.radius || before.meta.theme.density !== after.meta.theme.density) out.push("changes the app's look");

  for (const s of after.screens) {
    const was = before.screens.find((x) => x.id === s.id);
    if (!was) { out.push(`adds the ${s.title} screen`); continue; }
    if (was.title !== s.title) out.push(`renames the ${was.title} screen to ${s.title}`);
  }
  const wasTables = tablesOf(before);
  for (const t of tablesOf(after).values()) {
    const was = wasTables.get(t.id);
    if (!was) continue;
    const name = t.title ?? entityOf(after, t.entityId)?.plural ?? "the table";
    const label = (f: string) => labelOf(after, t.entityId, f);
    const added = t.columns.filter((c) => !was.columns.includes(c));
    const removed = was.columns.filter((c) => !t.columns.includes(c));
    if (added.length) out.push(`shows ${list(added.map(label))} in ${name}`);
    if (removed.length) out.push(`takes ${list(removed.map(label))} out of ${name}`);
    if (!added.length && !removed.length && !same(t.columns, was.columns)) out.push(`reorders the columns in ${name}`);
    if (!same(t.sort ?? null, was.sort ?? null)) {
      const type = entityOf(after, t.entityId)?.fields.find((f) => f.name === t.sort?.column)?.type;
      out.push(t.sort ? `sorts ${name} by ${label(t.sort.column)} (${sortPhrase(t.sort, type)})` : `stops sorting ${name}`);
    }
    const newFilters = t.filters.filter((f) => !was.filters.includes(f));
    if (newFilters.length) out.push(`lets people filter ${name} by ${list(newFilters.map(label))}`);
  }

  for (const e of after.entities) {
    const was = before.entities.find((x) => x.id === e.id);
    if (!was) { out.push(`adds ${e.plural} to the app's data`); continue; }
    const added = e.fields.filter((f) => !was.fields.some((x) => x.name === f.name));
    if (added.length) out.push(`stores ${list(added.map((f) => f.label ?? f.name))} for ${e.plural} (with sample values)`);
    if (was.name !== e.name) out.push(`renames ${was.plural} to ${e.plural}`);
  }

  for (const a of after.agents) {
    const was = before.agents.find((x) => x.id === a.id);
    if (!was) { out.push(`adds ${a.name}`); continue; }
    if (was.name !== a.name) out.push(`renames ${was.name} to ${a.name}`);
    if (was.supervision !== a.supervision) out.push(`sets ${a.name} to “${SUPERVISION_LABEL[a.supervision].label}”`);
    else {
      const moved = a.tools.filter((t) => { const b = was.tools.find((x) => x.id === t.id); return b && b.permission !== t.permission; });
      if (moved.length) out.push(`sets ${list(moved.map((t) => `${t.name} to “${PERMISSION_LABEL[t.permission]}”`))} for ${a.name}`);
    }
    const rules = a.rules.filter((r) => !was.rules.includes(r)).length;
    if (rules) out.push(`gives ${a.name} ${rules === 1 ? "a new rule" : `${rules} new rules`}`);
    const rehearsals = a.rehearsals.filter((r) => !was.rehearsals.some((x) => x.id === r.id)).length;
    if (rehearsals) out.push(`adds ${rehearsals === 1 ? "a practice conversation" : `${rehearsals} practice conversations`} for ${a.name}`);
  }
  for (const c of after.connections) {
    const was = before.connections.find((x) => x.id === c.id);
    if (!was) out.push(`adds the ${c.name} connection`);
    else if (!same(was, c)) out.push(`updates ${c.name}`);
  }
  return [...new Set(out)];
}

const IMPERATIVE: Record<string, string> = { stores: "Store", shows: "Show", sorts: "Sort", adds: "Add", takes: "Take", reorders: "Reorder", stops: "Stop", lets: "Let", renames: "Rename", changes: "Change", sets: "Set", gives: "Give", updates: "Update" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Cut text off where its first unbacked promise begins (with the word that joins it on). */
function cutAt(text: string, gaps: Claim[]): string {
  const starts = gaps.map((g) => text.indexOf(g.phrase)).filter((i) => i >= 0);
  if (!starts.length) return text;
  const head = text.slice(0, Math.min(...starts)).replace(/(?:[\s,;:]|\b(?:and|so that|so|which|while|then|to make sure|making)\b)+$/i, "").trim();
  return head;
}

/**
 * The quote's text when promises are left without an operation: the model's words up to the first
 * empty promise (or, if nothing true is left, what the change does, read from the blueprint), then
 * a plain line for each thing that isn't included.
 */
export function honestText(summary: string, rationale: string, before: Blueprint, after: Blueprint, gaps: Claim[], alreadySaid = ""): { summary: string; rationale: string } {
  const did = describeChanges(before, after);
  const summaryGaps = gaps.filter((g) => summary.includes(g.phrase));
  let s = cutAt(summary, summaryGaps);
  if (s.split(/\s+/).filter(Boolean).length < 3 && did[0]) {
    const [verb, ...rest] = did[0].split(" ");
    s = IMPERATIVE[verb] ? `${IMPERATIVE[verb]} ${rest.join(" ")}` : cap(did[0]);
  }
  const rationaleGaps = gaps.filter((g) => rationale.includes(g.phrase));
  let r = cutAt(rationale, rationaleGaps);
  if (r.split(/\s+/).filter(Boolean).length < 4) r = did.length ? `This ${list(did)}` : "";
  r = r.trim();
  if (r && !/[.!?]$/.test(r)) r += ".";
  // A kind the notes already explain (e.g. "so the table isn't sorted by it") isn't said twice.
  const said = new Set(claimsIn(alreadySaid, { mentions: true }).map((c) => c.kind));
  const missing = [...new Set(gaps.filter((g) => !said.has(g.kind)).map((g) => LEFT_OUT[g.kind]))];
  const tail = missing.length ? `${missing.join(" ")} Ask for that as its own change if you want it.` : "";
  return { summary: (s || "Change the project").replace(/[.\s]+$/, ""), rationale: [r, tail].filter(Boolean).join(" ") };
}
