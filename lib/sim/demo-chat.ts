import type { Agent, AgentTool, Blueprint, Entity } from "@/lib/blueprint/schema";

/**
 * Scripted answers for the public /live app, where anonymous visitors never
 * trigger a model call. The question is matched to an intent with plain
 * keywords, and the answer is built from the blueprint's sample data, so it is
 * specific ("CLM-20933 and CLM-20936 are flagged") and always true to what the
 * app shows. Pure and deterministic.
 */

type Row = Entity["sample"][number];
type Field = Entity["fields"][number];
export type DemoChatContext = { screenId?: string; entityId?: string; selected?: number };
type Intent = "action" | "sla" | "flag" | "payout" | "history" | "summary" | "status" | "help";

const DONE = /(paid|approved|done|resolved|closed|complete|sent|solved|replied|won|lost|cancel|rejected|disqualified|started|met\b|ready for day one)/i;
const FLAGGED = /(flag|fraud|suspicious|escalat|blocked|risk|urgent|overdue|held)/i;
/** Words that ask the helper to do something that can't be taken back, not to look something up. */
const ACT = "send|e-?mail(?! address)|pay|refund|delete|remove|cancel|approve|reject|decline|notify|message";
const WAITING = /(await|pending|approval|review|hold|held|queued)/i;

const INTENTS: [Intent, RegExp][] = [
  // An order ("Send ...", "Please refund ..."), or one of those verbs with "now" in a sentence that isn't a question.
  ["action", new RegExp(`^(?:(?:please|now|go ahead and|can you|could you|would you)\\s+)*(?:${ACT})\\b|^(?!\\s*(?:what|which|who|why|how|when|where|is|are|do|does|did|can i|should)\\b).*\\b(?:${ACT})\\b.*\\b(?:now|right away|immediately|asap)\\b`, "i")],
  // "at risk" is a flag question: SLA wording only when the question is about deadlines.
  ["sla", /\b(sla|overdue|breach\w*|late|deadlines?|past due|stuck|blocking|blocked)\b/i],
  ["flag", /\b(fraud\w*|flag\w*|suspicious|risky|risk|attention|urgent|problems?|worr\w*|concern\w*)\b/i],
  ["payout", /\b(payouts?|payments?|pay|paid|refunds?|settle\w*|money)\b/i],
  ["history", /\b(prior|previous|history|other (claims|tickets|orders|requests)|before)\b/i],
  ["summary", /\b(summar\w*|overview|recap|brief me|today\w*|new|latest|how many|count)\b/i],
  ["status", /\b(status|where is|where's|what happened|progress|update on|any news|look ?up|find|show me)\b/i],
  ["help", /\b(help(?! (centre|center|desk|article))|what can you do|what do you do|who are you|how do(es)? (this|you) work)\b/i],
];

const lc = (s: string) => s.toLowerCase();
/** Lowercase for mid-sentence display, keeping acronyms ("IT requests" stays, "Claims" → "claims"). */
const lower = (s: string) => s.split(/(\s+)/).map((w) => (/^[A-Z0-9&]{2,}$/.test(w) ? w : w.toLowerCase())).join("");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (q: string, v: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(lc(v))}($|[^\\p{L}\\p{N}])`, "u").test(lc(q));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const day = (v: string) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(`${v.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : v);

function show(f: Field | undefined, v: unknown): string {
  if (v === undefined || v === null || v === "") return "not set";
  if (f?.type === "money" && typeof v === "number") return money(v);
  if (f?.type === "date" && typeof v === "string") return day(v);
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(2);
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

const label = (f: Field) => f.label ?? f.name.replace(/_/g, " ");
const findField = (e: Entity, re: RegExp, types: Field["type"][]) => e.fields.find((f) => types.includes(f.type) && re.test(`${f.name} ${f.label ?? ""}`));

function fieldsOf(e: Entity) {
  const title = e.fields[0];
  const status = findField(e, /status|stage|state/i, ["enum"]) ?? e.fields.find((f) => f.type === "enum" && f.options?.some((o) => isDone(o) || /^(new|open)$/i.test(o)));
  const created = e.fields.find((f) => f.type === "date" && /filed|created|opened|received|submitted|logged|date/i.test(`${f.name} ${f.label ?? ""}`) && !/due|start|deadline|since/i.test(f.name) && !/last|next/i.test(`${f.name} ${f.label ?? ""}`));
  const due = findField(e, /sla|due|deadline/i, ["date", "string"]);
  const amount = e.fields.find((f) => f.type === "money");
  const score = findField(e, /risk|fraud|suspic/i, ["number"]);
  const assignee = findField(e, /adjuster|assignee|assigned|handler|\bcsm\b|\brep\b/i, ["string", "enum"]);
  const person = e.fields.slice(1).find((f) => f.type === "string" && f !== assignee && /holder|customer|name|payee|requester|contact|employee|client|hire|patient|company/i.test(`${f.name} ${f.label ?? ""}`));
  const kind = e.fields.find((f) => f.type === "enum" && f !== status && f !== assignee);
  return { title, status, created, due, amount, score, assignee, person, kind };
}

/** Risk scores stored as 0 to 1 are flagged at 0.6 (the same line the tables colour red); 0 to 100 at 60. */
const flagLine = (e: Entity, f: Field) => (e.sample.every((r) => typeof r[f.name] !== "number" || (r[f.name] as number) <= 1) ? 0.6 : 60);

const isDone = (v: string) => DONE.test(v) && !/\bnot\b/i.test(v);
/** "At risk", "Urgent", "Overdue", "Flagged" count; "Low risk" and "Not flagged" don't. */
const isFlagValue = (v: string) => FLAGGED.test(v) && !/\b(low|no|not|un)[\s-]?(risk|flag)/i.test(v);

function isOpen(e: Entity, r: Row): boolean {
  const { status } = fieldsOf(e);
  return !status || !isDone(String(r[status.name] ?? ""));
}

function isFlagged(e: Entity, r: Row): boolean {
  const F = fieldsOf(e);
  if (F.score && typeof r[F.score.name] === "number" && (r[F.score.name] as number) >= flagLine(e, F.score)) return true;
  if (e.fields.some((f) => f.type === "enum" && isFlagValue(String(r[f.name] ?? "")))) return true;
  return e.fields.some((f) => f.type === "boolean" && /flag/i.test(f.name) && r[f.name] === true);
}

function line(e: Entity, r: Row, extra?: string): string {
  const F = fieldsOf(e);
  const bits = [`**${show(F.title, r[F.title.name])}**`];
  if (F.person && r[F.person.name] !== undefined) bits.push(show(F.person, r[F.person.name]));
  if (F.kind && r[F.kind.name] !== undefined) bits.push(String(r[F.kind.name]));
  if (F.amount && typeof r[F.amount.name] === "number") bits.push(show(F.amount, r[F.amount.name]));
  if (F.status && r[F.status.name] !== undefined) bits.push(String(r[F.status.name]));
  if (extra) bits.push(extra);
  return `- ${bits.join(" · ")}`;
}

function bullets(e: Entity, rows: Row[], extra?: (r: Row) => string | undefined, max = 6): string {
  const shown = rows.slice(0, max).map((r) => line(e, r, extra?.(r)));
  if (rows.length > max) shown.push(`- and ${rows.length - max} more`);
  return shown.join("\n");
}

function describe(e: Entity, r: Row): string {
  const F = fieldsOf(e);
  const head = `**${show(F.title, r[F.title.name])}**${F.person ? ` (${show(F.person, r[F.person.name])})` : ""}${F.status ? ` is **${show(F.status, r[F.status.name])}**` : ""}.`;
  const facts = e.fields
    .filter((f) => f !== F.title && f !== F.person && f !== F.status && f.type !== "text" && r[f.name] !== undefined && r[f.name] !== "")
    .map((f) => {
      const v = r[f.name];
      if (f === F.score && typeof v === "number") {
        const t = flagLine(e, f);
        return `${label(f)}: ${show(f, v)} (${v >= t ? "high" : "low"}: flagged at ${t} and above)`;
      }
      return `${label(f)}: ${show(f, v)}`;
    });
  const notes = e.fields.filter((f) => f.type === "text" && typeof r[f.name] === "string" && r[f.name]).map((f) => `_${String(r[f.name]).replace(/_/g, " ")}_`);
  return [head, facts.join(" · "), ...notes].filter(Boolean).join("\n\n");
}

function breakdown(e: Entity, rows: Row[], f: Field | undefined): string {
  if (!f) return "";
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(String(r[f.name] ?? "not set"), (counts.get(String(r[f.name] ?? "not set")) ?? 0) + 1);
  const order = f.options ?? [...counts.keys()];
  return order.filter((o) => counts.get(o)).map((o) => `${counts.get(o)} ${o}`).join(", ");
}

const total = (e: Entity, rows: Row[]) => {
  const { amount } = fieldsOf(e);
  if (!amount) return "";
  const sum = rows.reduce((s, r) => s + (typeof r[amount.name] === "number" ? (r[amount.name] as number) : 0), 0);
  return sum ? money(sum) : "";
};

/** Rows the question names outright: an id like CLM-20931, a full name, or a distinctive first or last name. */
function mentionedRows(bp: Blueprint, q: string): { e: Entity; r: Row }[] {
  const hits: { e: Entity; r: Row; score: number }[] = [];
  for (const e of bp.entities) {
    const F = fieldsOf(e);
    const keys = [F.title, F.person].filter((f): f is Field => Boolean(f) && f!.type === "string");
    // First or last names alone only count for people, never for companies ("Pinecrest Bank" shouldn't answer "bank").
    const personLike = (f: Field) => /holder|payee|requester|contact|employee|hire|patient|\bname\b/i.test(`${f.name} ${f.label ?? ""}`) && !/company|customer|account|org/i.test(`${f.name} ${f.label ?? ""}`);
    for (const r of e.sample) {
      let score = 0;
      for (const f of keys) {
        const v = String(r[f.name] ?? "");
        if (v.length >= 4 && mentions(q, v)) score = Math.max(score, 2);
        else if (personLike(f) && /\s/.test(v) && v.split(/\s+/).some((w) => w.replace(/\W/g, "").length >= 4 && mentions(q, w.replace(/[^\p{L}\p{N}'-]/gu, "")))) score = Math.max(score, 1);
      }
      if (score) hits.push({ e, r, score });
    }
  }
  const best = Math.max(0, ...hits.map((h) => h.score));
  return hits.filter((h) => h.score === best);
}

/** Narrow a list by any option or value the question names ("Auto claims", "at St. Anne's"). */
function filterByMention(e: Entity, rows: Row[], q: string, ignore?: RegExp): { rows: Row[]; by: string[] } {
  const by: string[] = [];
  let out = rows;
  for (const f of e.fields) {
    if (f.type !== "enum" && f.type !== "string") continue;
    const values = [...new Set(e.sample.map((r) => String(r[f.name] ?? "")))].filter((v) => v.length >= 4 && !/^(unassigned|none|not set|n\/a)$/i.test(v) && !ignore?.test(v));
    const hit = values.find((v) => mentions(q, v));
    if (hit && !(f === fieldsOf(e).title)) {
      out = out.filter((r) => String(r[f.name]) === hit);
      by.push(hit);
    }
  }
  return { rows: out, by };
}

/** A headline number on the same screen ("SLA at risk: 2"), so the answer and the dashboard agree. */
function kpiCap(bp: Blueprint, screenId: string | undefined, entityId: string, re: RegExp): number | null {
  const showsEntity = (x: Blueprint["screens"][number]) => [...x.regions.main, ...x.regions.side].some((b) => "entityId" in b && b.entityId === entityId);
  for (const s of bp.screens.filter((x) => x.id === screenId && showsEntity(x)))
    for (const b of [...s.regions.main, ...s.regions.side])
      if (b.type === "kpis")
        for (const k of b.items) {
          const n = Number.parseInt(k.value, 10);
          if (re.test(k.label) && Number.isFinite(n) && n > 0 && String(n) === k.value.trim()) return n;
        }
  return null;
}

/** Minutes until a relative SLA like "in 3h 50m"; "Met" and anything unreadable sort last. */
function minutesLeft(v: unknown): number {
  const m = String(v ?? "").match(/in\s+(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i);
  if (!m || (!m[1] && !m[2])) return Number.POSITIVE_INFINITY;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
}

function capabilities(bp: Blueprint, e: Entity): string[] {
  const F = fieldsOf(e);
  const out = [F.created ? `Summarise today's ${/^new\b/i.test(e.plural) ? "" : "new "}${lower(e.plural)}` : `Summarise the ${lower(e.plural)}`];
  const sla = slaEntity(bp, e);
  const due = sla && fieldsOf(sla).due;
  if (sla) out.push(due ? `Show which ${lower(sla.plural)} are closest to ${due.type === "date" ? "their due date" : /sla/i.test(label(due)) ? "breaching SLA" : `their ${lower(label(due))}`}` : `Show which open ${lower(sla.plural)} have waited longest`);
  if (bp.entities.some((x) => x.sample.some((r) => isFlagged(x, r)))) out.push(`Name the flagged ${lower(e.plural)}`);
  const sample = e.sample[0] ? String(e.sample[0][F.title.name] ?? "") : "";
  out.push(`Look up one ${lower(e.name)} by ${lower(label(F.title))}${F.person ? " or name" : ""}${sample ? `, like ${sample}` : ""}`);
  if (payoutEntity(bp)) out.push("Show payouts waiting for approval");
  return out.map((s) => `- ${s}`);
}

/** True when every payment tool in the project waits for a person. */
function paymentsGated(bp: Blueprint): boolean {
  const pay = bp.agents.flatMap((a) => a.tools).filter((t) => bp.connections.find((c) => c.id === t.connectionId)?.kind === "payments" && t.access !== "read");
  return pay.length > 0 && pay.every((t) => t.permission === "ask");
}

/** One of the project's own agent rules that explains the answer, quoted with whose rule it is. */
function ruleAbout(bp: Blueprint, re: RegExp): string {
  for (const a of bp.agents) {
    const rule = a.rules.find((x) => re.test(x));
    if (rule) return `${a.name}'s rule: ${rule}`;
  }
  return "";
}

/** The list SLA questions are about: this one if it has deadlines or ages, else another one with due dates. */
function slaEntity(bp: Blueprint, e: Entity): Entity | undefined {
  const F = fieldsOf(e);
  if (F.due || (F.created && F.status)) return e;
  return bp.entities.find((x) => fieldsOf(x).due && fieldsOf(x).status);
}

function payoutEntity(bp: Blueprint): Entity | undefined {
  return bp.entities.find((e) => /payout|payment|refund|invoice|settlement|disbursement/i.test(`${e.id} ${e.name}`));
}

function primaryEntity(bp: Blueprint, agent: Agent | undefined, ctx: DemoChatContext): Entity {
  return (
    bp.entities.find((e) => e.id === ctx.entityId) ??
    bp.entities.find((e) => agent?.knowledge.some((k) => k.source === "entity" && k.ref === e.id)) ??
    bp.entities[0]
  );
}

/** What's closest to its deadline: by time left on a relative SLA, by due date, or by age and who's assigned. */
function slaAnswer(bp: Blueprint, e: Entity, q: string, ctx: DemoChatContext): string {
  const F = fieldsOf(e);
  const { rows: scoped, by } = filterByMention(e, e.sample.filter((r) => isOpen(e, r)), q, INTENT_RE.sla);
  if (!scoped.length) return `Nothing open${by.length ? ` for ${by.join(", ")}` : ""} is at risk in the sample data.`;
  const cap = kpiCap(bp, ctx.screenId, e.id, /sla|overdue|breach|at risk/i) ?? 3;
  const unassigned = (r: Row) => (F.assignee ? /^(unassigned|none|)$/i.test(String(r[F.assignee.name] ?? "").trim()) : false);
  let rows: Row[];
  let basis: string;
  if (F.due && F.due.type === "string") {
    rows = scoped.filter((r) => Number.isFinite(minutesLeft(r[F.due!.name]))).sort((a, b) => minutesLeft(a[F.due!.name]) - minutesLeft(b[F.due!.name]));
    basis = `by time left on the ${label(F.due)}`;
  } else if (F.due) {
    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the visitor's own timezone
    rows = [...scoped].sort((a, b) => String(a[F.due!.name]).localeCompare(String(b[F.due!.name])));
    const late = rows.filter((r) => String(r[F.due!.name]) < today);
    const next = rows.filter((r) => !late.includes(r)).slice(0, Math.min(cap, 3));
    const when = (r: Row) => `${label(F.due!)} ${show(F.due, r[F.due!.name])}`;
    const scope = by.length ? ` for ${by.join(", ")}` : "";
    return [
      late.length ? `${plural(late.length, `${lower(e.name)} is`, `${lower(e.plural)} are`)} overdue${scope}:` : `Nothing is overdue${scope}.`,
      late.length ? bullets(e, late, when) : "",
      next.length ? `Due next:\n\n${bullets(e, next, when)}` : "",
    ].filter(Boolean).join("\n\n");
  } else {
    rows = [...scoped].sort((a, b) => Number(unassigned(b)) - Number(unassigned(a)) || (F.created ? String(a[F.created.name]).localeCompare(String(b[F.created.name])) : 0));
    basis = `the oldest open ones${F.assignee ? ` with no ${lower(label(F.assignee))} yet` : ""}`;
  }
  rows = rows.slice(0, Math.min(cap, rows.length));
  const when = (r: Row) => (F.due ? `${label(F.due)} ${show(F.due, r[F.due.name])}` : F.created ? `${lower(label(F.created))} ${show(F.created, r[F.created.name])}` : undefined);
  // "Breaching SLA" only when the list really has an SLA field, or the question and this screen's headline number both say SLA.
  const slaWords = F.due ? /sla/i.test(label(F.due)) : /\bsla\b/i.test(q) && kpiCap(bp, ctx.screenId, e.id, /sla/i) !== null;
  const scope = by.length ? ` for ${by.join(", ")}` : "";
  const head = slaWords || F.due
    ? `${plural(rows.length, `${lower(e.name)} is`, `${lower(e.plural)} are`)} closest to ${slaWords ? "breaching SLA" : `their ${lower(label(F.due!))}`}${scope} (${basis}):`
    : `${plural(rows.length, `open ${lower(e.name)} has`, `open ${lower(e.plural)} have`)} waited longest${scope} (${basis}):`;
  let tail = "";
  if (F.assignee && !F.due) {
    const rest = scoped.filter((r) => unassigned(r) && !rows.includes(r));
    tail = rest.length
      ? `${rest.map((r) => show(F.title, r[F.title.name])).join(", ")} ${rest.length === 1 ? "has" : "have"} no ${lower(label(F.assignee))} yet either, but ${rest.length === 1 ? "it is" : "they are"} newer.`
      : `Every other open ${lower(e.name)} already has ${/^[aeiou]/i.test(label(F.assignee)) ? "an" : "a"} ${lower(label(F.assignee))}.`;
  }
  return [head, bullets(e, rows, when), tail].filter(Boolean).join("\n\n");
}

/** The project's own tool for an action, if any helper has one: the current helper first, and "Send email" over "Draft email". */
function toolFor(bp: Blueprint, agent: Agent | undefined, want: RegExp, verb: string): { a: Agent; t: AgentTool } | undefined {
  const hits = [...(agent ? [agent] : []), ...bp.agents.filter((x) => x !== agent)].flatMap((a) =>
    a.tools
      .filter((t) => t.access !== "read" && (want.test(t.name) || want.test(t.description)))
      .map((t) => ({ a, t, score: (lc(t.name).includes(verb) ? 3 : 0) + (want.test(t.name) ? 2 : 0) + (want.test(t.description) ? 1 : 0) + (t.access === "irreversible" ? 1 : 0) })),
  );
  return hits.sort((x, y) => y.score - x.score)[0];
}

/** Orders like "Send a reorder email to The Copper Kettle now": said plainly, never done, since the demo can't act. */
function actionAnswer(bp: Blueprint, agent: Agent | undefined, q: string, hit: { e: Entity; r: Row } | null): string {
  const verb = lc(q.match(new RegExp(`\\b(${ACT})\\b`, "i"))?.[1] ?? "send").replace("-", "");
  const sends = /^(send|email|message|notify)$/.test(verb);
  const found = toolFor(bp, agent, sends ? /send|e-?mail|message|notify|slack/i : /^(pay|refund)$/.test(verb) ? /pay|refund|transfer|money/i : new RegExp(verb.slice(0, 5), "i"), verb);
  let target = "";
  if (hit) {
    const F = fieldsOf(hit.e);
    const title = show(F.title, hit.r[F.title.name]);
    const person = F.person ? show(F.person, hit.r[F.person.name]) : "";
    target = person && !mentions(q, title) && mentions(q, person) ? person : title;
  }
  const kind = found && bp.connections.find((c) => c.id === found.t.connectionId)?.kind;
  const doing = { pay: ["Paying", "someone"], refund: ["Refunding", "someone"], delete: ["Deleting", "a record"], remove: ["Removing", "a record"], cancel: ["Cancelling", "it"], approve: ["Approving", "that"], reject: ["Rejecting", "that"], decline: ["Declining", "that"] }[verb] ?? ["Doing", "that"];
  const say = sends
    ? verb === "notify"
      ? `Notifying ${target || "them"}`
      : `Sending ${/e-?mail/i.test(q) || kind === "email" ? "an email" : "a message"}${target ? ` to ${target}` : ""}`
    : `${doing[0]} ${target || doing[1]}`;
  const none = /^(pay|refund)$/.test(verb) ? "no money moves" : sends ? "nothing is sent" : "nothing changes";
  // Approving is the person's step itself, so no helper tool stands in for it.
  if (/^(approve|reject|decline)$/.test(verb)) return `${say} is a person's call: AI helpers here prepare the work and a person gives the final OK. In this published demo ${none}.`;
  if (!found) return `No AI helper in this app is set up to do that, so nothing happens. In apps built here, anything that can't be undone, like ${lc(say[0]) + say.slice(1)}, asks a person first.`;
  const helper = found.a === agent ? "this AI helper" : found.a.name;
  const what = lc(found.t.description[0]) + found.t.description.slice(1).replace(/\.$/, "");
  if (found.t.access === "write")
    return `For that, ${helper} would ${what}. That can be undone${found.t.permission === "ask" ? ", and a person still OKs it first" : ", and every change is logged for a person to check"}. In this published demo nothing changes.`;
  return found.t.permission === "ask" || found.a.supervision === "approve_all"
    ? `${say} can't be undone, so ${helper} asks a person first. In this published demo ${none}.`
    : `${say} can't be undone. ${helper === "this AI helper" ? "This AI helper" : helper} is set to do it on its own${found.t.permission === "log" ? " and log it for a person to check" : ""}. In this published demo ${none}.`;
}

const INTENT_RE = Object.fromEntries(INTENTS) as Record<Intent, RegExp>;

export function detectIntent(q: string): Intent | null {
  return INTENTS.find(([, re]) => re.test(q))?.[0] ?? null;
}

export function demoReply(bp: Blueprint, agent: Agent | undefined, question: string, ctx: DemoChatContext = {}): string {
  const q = question.trim();
  const e = primaryEntity(bp, agent, ctx);
  if (!e) return "This demo has no sample data to answer from yet.";
  const F = fieldsOf(e);
  const intent = detectIntent(q);
  const named = mentionedRows(bp, q);
  // "this claim" / "this new hire" on a screen that shows one record means the record in view.
  const noun = escape(lc(e.name).split(" ").pop() ?? "");
  const thisRecord = new RegExp(`\\b(this|that)( [a-z]+)? (${noun}|one|record|item)\\b`, "i").test(q);
  const asksAboutField = e.fields.some((f) => label(f).length >= 4 && mentions(q, label(f)));
  const pointsAtThis = ctx.selected !== undefined && (thisRecord || asksAboutField || /\b(this|that|it|her|his|their)\b/i.test(q));
  const current = pointsAtThis && e.sample.length ? { e, r: e.sample[ctx.selected ?? 0] ?? e.sample[0] } : null;

  // 0. Orders to do something ("Send ...", "Refund ... now"): the record named, or the one in view.
  if (intent === "action") return actionAnswer(bp, agent, q, named[0] ?? current);

  // 1. Earlier records from the same person as the one in view (or the one named).
  if (intent === "history" && (named[0] || current)) {
    const { e: ent, r } = named[0] ?? current!;
    const P = fieldsOf(ent).person;
    if (P) {
      const who = String(r[P.name]);
      const others = ent.sample.filter((x) => x !== r && String(x[P.name]) === who);
      return others.length
        ? `${plural(others.length, `other ${lower(ent.name)}`, `other ${lower(ent.plural)}`)} from ${who} in the sample data:\n\n${bullets(ent, others)}`
        : `No other ${lower(ent.plural)} from ${who} in the sample data. ${show(fieldsOf(ent).title, r[fieldsOf(ent).title.name])} is the only one.`;
    }
  }

  // 2. A specific record: named outright, or "this claim" on a detail screen.
  const pick = intent === "payout" ? (named.find((h) => h.e === payoutEntity(bp)) ?? named[0]) : (named.find((h) => h.e === e) ?? named[0]);
  if (pick) {
    const same = [...new Set(named.filter((h) => h.e === pick.e).map((h) => h.r))];
    return same.length > 1 ? `I found ${same.length} matching ${lower(pick.e.plural)}:\n\n${bullets(pick.e, same)}` : describe(pick.e, pick.r);
  }
  if (current && intent === "payout") {
    const pe = payoutEntity(bp);
    const key = String(current.r[F.title.name] ?? "");
    const related = pe && pe !== e ? pe.sample.find((r) => Object.values(r).some((v) => String(v) === key)) : undefined;
    if (pe && related) return `A payout is already prepared for it:\n\n${describe(pe, related)}`;
    return `${describe(current.e, current.r)}\n\nNo payout has been prepared for it yet. This public demo can't create one${paymentsGated(bp) ? ". In the real app a person approves every payout before money moves" : ""}.`;
  }
  if (current && (thisRecord || intent === null || intent === "status" || intent === "flag" || intent === "help")) return describe(current.e, current.r);

  // 3. Questions about the whole list.
  if (intent === "flag") {
    // Records whose own values say what was asked ("at risk" finds a status of "At risk"), this list first; else anything flagged.
    const asked = ["risk", "urgent", "overdue", "fraud", "escalat", "block", "held"].find((w) => lc(q).includes(w));
    const order = [e, ...bp.entities.filter((x) => x !== e)];
    const says = (x: Entity, r: Row) => Boolean(asked) && x.fields.some((f) => f.type === "enum" && isFlagValue(String(r[f.name] ?? "")) && lc(String(r[f.name])).includes(asked!));
    const exact = order.find((x) => x.sample.some((r) => says(x, r)));
    const ent = exact ?? order.find((x) => x.sample.some((r) => isFlagged(x, r)));
    if (!ent) {
      // "What needs attention?" with nothing flagged: what's waiting on a person instead.
      const wait = asked || /flag|fraud|suspicious/i.test(q) ? undefined : order.find((x) => x.sample.some((r) => WAITING.test(String(r[fieldsOf(x).status?.name ?? ""] ?? ""))));
      if (wait) {
        const rows = wait.sample.filter((r) => WAITING.test(String(r[fieldsOf(wait).status!.name] ?? "")));
        return `Nothing is flagged in the sample data, but ${plural(rows.length, `${lower(wait.name)} is`, `${lower(wait.plural)} are`)} waiting on a person:\n\n${bullets(wait, rows)}`;
      }
      return `Nothing is flagged${asked === "risk" ? " or at risk" : ""} in the sample ${lower(e.plural)} right now.`;
    }
    const { rows } = filterByMention(ent, ent.sample.filter((r) => (exact ? says(ent, r) : isFlagged(ent, r))), q, INTENT_RE.flag);
    if (!rows.length) return `Nothing is flagged in the sample ${lower(ent.plural)} right now.`;
    // Say it the way the app does ("marked At risk") when every row carries the same flag.
    const tags = new Set(rows.map((r) => ent.fields.map((f) => (f.type === "enum" ? String(r[f.name] ?? "") : "")).find(isFlagValue) ?? ""));
    const tag = tags.size === 1 ? [...tags][0] : "";
    const E = fieldsOf(ent);
    const why = (r: Row) => (E.score && typeof r[E.score.name] === "number" ? `${lower(label(E.score))} ${show(E.score, r[E.score.name])}` : undefined);
    const notes = rows.slice(0, 3).map((r) => {
      const text = ent.fields.find((f) => f.type === "text");
      return text && r[text.name] ? `${show(E.title, r[E.title.name])}: ${String(r[text.name])}` : "";
    }).filter(Boolean);
    const rule = ruleAbout(bp, /flag/i);
    return [`${plural(rows.length, `${lower(ent.name)} is`, `${lower(ent.plural)} are`)} ${tag && !/flag/i.test(`${tag} ${q}`) ? `marked ${tag}` : "flagged"}:`, bullets(ent, rows, why), notes.length ? notes.join("\n") : "", rule].filter(Boolean).join("\n\n");
  }

  if (intent === "sla") {
    const ent = slaEntity(bp, e);
    if (!ent) {
      const open = e.sample.filter((r) => isOpen(e, r));
      return `This app's data has no due dates, so I can't tell what's running late. ${plural(open.length, `${lower(e.name)} is`, `${lower(e.plural)} are`)} still open:\n\n${bullets(e, open)}`;
    }
    return slaAnswer(bp, ent, q, ctx);
  }

  if (intent === "payout") {
    const ent = payoutEntity(bp);
    if (!ent) {
      if (!F.amount) return `This app doesn't track payments. Here's what I can help with:\n\n${capabilities(bp, e).join("\n")}`;
      const approved = e.sample.filter((r) => F.status && /approved/i.test(String(r[F.status.name])));
      return approved.length ? `${plural(approved.length, `${lower(e.name)} is`, `${lower(e.plural)} are`)} approved and ready to pay, ${total(e, approved)} in total:\n\n${bullets(e, approved)}` : `No ${lower(e.plural)} are approved for payment in the sample data.`;
    }
    const P = fieldsOf(ent);
    const statusOf = (r: Row) => (P.status ? String(r[P.status.name] ?? "") : "");
    const waiting = ent.sample.filter((r) => WAITING.test(statusOf(r)) && !/held|hold/i.test(statusOf(r)));
    const held = ent.sample.filter((r) => /held|hold/i.test(statusOf(r)));
    const done = ent.sample.filter((r) => isDone(statusOf(r)) && !WAITING.test(statusOf(r)));
    const gated = paymentsGated(bp);
    return [
      waiting.length ? `${plural(waiting.length, lower(ent.name), lower(ent.plural))} waiting for approval, ${total(ent, waiting)} in total:\n\n${bullets(ent, waiting)}` : `No ${lower(ent.plural)} are waiting for approval.`,
      held.length ? `Held for a closer look:\n\n${bullets(ent, held)}` : "",
      done.length ? `Already sent: ${done.length}.` : "",
      gated ? "Money only moves after a person approves it." : "",
      held.length ? ruleAbout(bp, /(payout|payment)s?\b.*(above|over|team lead)/i) : "",
    ].filter(Boolean).join("\n\n");
  }

  if (intent === "summary" || (intent === null && /\b(what|which|how)\b.*\b(today|new)\b/i.test(q))) {
    const wantsToday = /\b(today\w*|latest|this morning|so far)\b/i.test(q) && F.created;
    const wantsNew = /\bnew\b/i.test(q) && F.status?.options?.some((o) => /^new$/i.test(o));
    const { rows: scoped, by } = filterByMention(e, e.sample, q);
    let rows = by.length && scoped.length ? scoped : e.sample;
    const kind = by.length && scoped.length ? `${by.join(" ")} ` : "";
    const noun = (n: number) => `${kind}${n === 1 ? lower(e.name) : lower(e.plural)}`;
    let head: string;
    if (wantsToday) {
      const latest = rows.map((r) => String(r[F.created!.name] ?? "")).sort().pop() ?? "";
      rows = rows.filter((r) => String(r[F.created!.name]) === latest);
      const worth = total(e, rows);
      head = `${rows.length} ${noun(rows.length)} came in on ${day(latest)}, the latest day in the sample data${worth ? `, worth ${worth} in total` : ""}:`;
    } else if (wantsNew) {
      rows = rows.filter((r) => /^new$/i.test(String(r[F.status!.name])));
      head = rows.length ? `${rows.length} ${noun(rows.length)} ${rows.length === 1 ? "is" : "are"} still New, not yet picked up:` : `No ${noun(2)} are waiting as New right now.`;
    } else {
      const worth = total(e, rows);
      head = `${rows.length} ${noun(rows.length)} in the sample data${worth ? `, worth ${worth} in total` : ""}:`;
    }
    const groupBy = e.fields.find((f) => new RegExp(`\\bby ${escape(lc(label(f)))}\\b`).test(lc(q)));
    const parts = [head, bullets(e, rows)];
    const status = breakdown(e, rows, F.status);
    if (wantsToday && status) parts.push(`Status: ${status}.`);
    if (groupBy) parts.push(`By ${lower(label(groupBy))}: ${breakdown(e, rows, groupBy)}.`);
    const flagged = rows.filter((r) => isFlagged(e, r));
    if (flagged.length) parts.push(`Flagged for a closer look: ${flagged.map((r) => show(F.title, r[F.title.name])).join(", ")}.`);
    return parts.join("\n\n");
  }

  if (intent === "status") {
    const status = breakdown(e, e.sample, F.status);
    const sample = e.sample[0] ? show(F.title, e.sample[0][F.title.name]) : "";
    return `${status ? `Where things stand across ${plural(e.sample.length, lower(e.name), lower(e.plural))}: ${status}.\n\n` : ""}Tell me a ${lower(label(F.title))}${sample ? ` (like ${sample})` : ""}${F.person ? " or a name" : ""} and I'll look it up.`;
  }

  // Nothing matched, but the question names a value in the list ("What's urgent?", "Show Property claims").
  if (intent === null) {
    const { rows, by } = filterByMention(e, e.sample, q);
    if (by.length && rows.length) return `${rows.length} ${by.join(" ")} ${rows.length === 1 ? lower(e.name) : lower(e.plural)} in the sample data:\n\n${bullets(e, rows)}`;
  }

  if (intent === "help") return `I'm ${agent?.name ?? "the assistant"}${agent?.role ? `: ${/^[A-Z]{2}/.test(agent.role) ? agent.role : lc(agent.role[0]) + agent.role.slice(1)}` : ""}. In this demo I answer from the app's sample data. I can:\n\n${capabilities(bp, e).join("\n")}`;

  return `I can't answer that from this app's data. Here's what I can help with:\n\n${capabilities(bp, e).join("\n")}`;
}
