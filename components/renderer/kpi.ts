import type { Block, Blueprint, Entity } from "@/lib/blueprint/schema";

/**
 * Headline numbers that agree with the sample rows on screen.
 *
 * An authored KPI ("Open requests: 14") is only a guess at the data. When the
 * label can be read against an entity's fields (a status or flag to count, a
 * money field to sum, a numeric field to total or average, a date window such
 * as "today" or "7 days"), the value is computed from the rows instead. The
 * authored value is kept only when the label can't be derived ("Median first
 * response", "SLA at risk"). Pure, so the preview, /live and tests agree.
 */

type KpiItem = Extract<Block, { type: "kpis" }>["items"][number];
type Row = Entity["sample"][number];
type Field = Entity["fields"][number];

export type DerivedKpi = { value: string; delta?: string; derived: boolean; zero: boolean };

const STOP = new Set(["a", "an", "the", "of", "for", "in", "on", "at", "to", "by", "with", "and", "or", "per", "from", "this", "that", "is", "are", "be", "vs", "all", "total", "count", "number", "now", "so", "far", "avg", "average", "mean", "median", "today", "yesterday", "week", "weeks", "month", "months", "days", "next", "last", "past", "until", "fortnight", "year", "ytd", "upcoming", "coming", "s"]);
const OPEN_WORDS = new Set(["open", "active", "pending", "outstanding", "unresolved", "ongoing", "current", "live"]);
const TERMINAL = /\b(solved|resolved|closed|done|complete|completed|paid|cancell?ed|rejected|dismissed|disqualified|delivered|archived|lost|won|declined|denied|lapsed|expired|started|sent|merged|shipped)\b/i;
const SYNONYMS: Record<string, string> = { waiting: "awaiting" };
const PAST_DATE = /(filed|opened|created|requested|drafted|detected|received|submitted|reported|logged|added|joined|sent|updated|placed|booked|raised)/i;
const FUTURE_DATE = /(due|start|deadline|expir|renew|end|scheduled|appointment|check_?in)/i;
const DAY = 86_400_000;

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .split(/[^a-z0-9&]+/)
    .filter((w) => w && !/^\d+$/.test(w));
const significant = (s: string) => words(s).filter((w) => !STOP.has(w));

/** Loose word match: plurals and simple tenses ("briefs"/"brief", "order"/"ordered"). */
function same(a: string, b: string): boolean {
  a = SYNONYMS[a] ?? a;
  b = SYNONYMS[b] ?? b;
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 4 && l.startsWith(s) && l.length - s.length <= 3;
}

function parseDate(v: unknown): number | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const t = Date.parse(`${v.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

type Window = { days: number; forward: boolean } | null;
function parseWindow(label: string): Window | "unsupported" {
  const l = label.toLowerCase();
  const forward = /\b(next|upcoming|coming)\b/.test(l);
  if (/\byesterday\b/.test(l)) return "unsupported";
  if (/\btoday\b/.test(l)) return { days: 1, forward };
  const n = l.match(/\b(\d+)\s*days?\b/);
  if (n) return { days: Math.max(1, Number(n[1])), forward };
  if (/\b(this|per|a)\s+week\b|\bweekly\b/.test(l)) return { days: 7, forward };
  if (/\bfortnight\b/.test(l)) return { days: 14, forward };
  if (/\b(this|per|a)\s+month\b|\bmonthly\b/.test(l)) return { days: 30, forward };
  if (/\b(this\s+year|ytd)\b/.test(l)) return { days: 365, forward };
  return null;
}

type Shape =
  | { kind: "count" }
  | { kind: "ratio" }
  | { kind: "percent" }
  | { kind: "decimal"; places: number }
  | { kind: "money"; symbol: string; compact: "" | "k" | "M" };
function parseShape(value: string): Shape | null {
  const v = value.trim();
  if (/^[\d,]+\s+of\s+[\d,]+$/i.test(v)) return { kind: "ratio" };
  const money = v.match(/^([$£€₹])\s*[\d,]+(?:\.\d+)?\s*([kKmM])?$/);
  if (money) return { kind: "money", symbol: money[1], compact: money[2] ? (money[2].toLowerCase() === "k" ? "k" : "M") : "" };
  if (/^\d+(?:\.\d+)?\s*%$/.test(v)) return { kind: "percent" };
  if (/^\d{1,3}(?:,\d{3})*$|^\d+$/.test(v)) return { kind: "count" };
  const dec = v.match(/^\d+\.(\d+)$/);
  if (dec) return { kind: "decimal", places: dec[1].length };
  return null; // durations ("3m 12s"), ranges, words: not derivable
}

function formatMoney(n: number, symbol: string, compact: "" | "k" | "M"): string {
  if (compact === "M") return `${symbol}${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (compact === "k") return `${symbol}${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "")}k`;
  return `${symbol}${Math.round(n).toLocaleString("en-US")}`;
}

/** Entity words: the head noun ("requests" in "Maintenance Requests") names it; the rest describe it. */
function entityWords(e: Entity) {
  const all = [...new Set([...significant(e.name), ...significant(e.plural)])];
  const head = [significant(e.plural).pop(), significant(e.name).pop()].filter(Boolean) as string[];
  return { all, head };
}

type Eval = {
  entity: Entity;
  unaccounted: string[];
  mention: boolean;
  filters: { field: string; option?: string; test: (v: unknown) => boolean }[];
  measure: Field | null;
  hasWith: boolean;
  dateField: Field | null;
  span: Window;
};

function evaluate(e: Entity, label: string, tokens: string[], otherHeads: Map<string, string>, money: boolean): Eval | null {
  const raw = label.toLowerCase();
  const accounted = new Set<number>();
  const take = (w: string) => {
    const i = tokens.findIndex((t, k) => !accounted.has(k) && same(t, w));
    if (i < 0) return false;
    accounted.add(i);
    return true;
  };
  const hasAll = (ws: string[]) => ws.length > 0 && ws.every((w) => tokens.some((t, k) => !accounted.has(k) && same(t, w)));

  // 1. The entity itself ("tickets", "claims")
  const { all, head } = entityWords(e);
  const mention = head.some((h) => tokens.some((t) => same(t, h)));
  if (mention) all.forEach(take);

  // 2. Enum options, longest first per field ("Sent back" beats "Sent"); options on different fields combine
  const filters: Eval["filters"] = [];
  for (const f of e.fields.filter((x) => x.type === "enum" && x.options?.length)) {
    const opts = [...f.options!].map((o) => ({ o, w: significant(o) })).filter((x) => x.w.length).sort((a, b) => b.w.length - a.w.length);
    const hit = opts.find((x) => hasAll(x.w));
    if (hit) {
      hit.w.forEach(take);
      filters.push({ field: f.name, option: hit.o, test: (v) => String(v) === hit.o });
    }
  }
  // 3. Yes/no fields ("Subscribed", "Not patient-facing")
  for (const f of e.fields.filter((x) => x.type === "boolean")) {
    const w = significant(f.label ?? f.name);
    if (hasAll(w)) {
      w.forEach(take);
      const negated = /\b(not|no|non|without|un)\b/.test(raw);
      if (negated) ["not", "no", "non", "without", "un"].forEach((n) => tokens.includes(n) && take(n));
      filters.push({ field: f.name, test: (v) => (v === true) !== negated });
    }
  }
  // 4. A numeric or money field named in the label ("Open cases", "CSAT", "Cost")
  let measure: Field | null = null;
  for (const f of e.fields.filter((x) => x.type === "number" || x.type === "money").sort((a, b) => significant(b.label ?? b.name).length - significant(a.label ?? a.name).length)) {
    const w = significant(f.label ?? f.name);
    if (!measure && hasAll(w)) {
      w.forEach(take);
      measure = f;
    }
  }
  // A money tile may name its field loosely: "Total rent collected" sums "Monthly rent".
  if (!measure && money) {
    for (const f of e.fields.filter((x) => x.type === "money")) {
      const w = significant(f.label ?? f.name).find((x) => tokens.some((t, k) => !accounted.has(k) && same(t, x)));
      if (w) {
        take(w);
        measure = f;
        break;
      }
    }
  }
  // 5. "Open"/"active": everything not in a finished state
  const statusField = e.fields.find((f) => f.type === "enum" && /status|stage|state|phase/i.test(f.name)) ?? e.fields.find((f) => f.type === "enum" && f.options?.some((o) => TERMINAL.test(o)));
  const openWord = tokens.findIndex((t, k) => !accounted.has(k) && OPEN_WORDS.has(t));
  if (openWord >= 0 && statusField && !filters.some((x) => x.field === statusField.name)) {
    accounted.add(openWord);
    filters.push({ field: statusField.name, test: (v) => !TERMINAL.test(String(v)) });
  }
  // 6. A date field named in the label ("Due this week", "Starting in the next 14 days")
  const dates = e.fields.filter((x) => x.type === "date");
  let dateField: Field | null = null;
  for (const f of dates) {
    const w = significant(f.label ?? f.name).filter((x) => x !== "date");
    if (!dateField && hasAll(w)) {
      w.forEach(take);
      dateField = f;
    }
  }
  dateField ??= dates.find((f) => !/since|birth|dob/i.test(f.name)) ?? null;
  const win = parseWindow(label);
  if (win === "unsupported") return null;
  const span = win && dateField ? win : null;

  // 7. "New today" is a date window, not the status called New
  if (win && win.days === 1 && dateField && tokens.includes("new")) {
    const i = tokens.findIndex((t, k) => !accounted.has(k) && t === "new");
    if (i >= 0) accounted.add(i);
    const k = filters.findIndex((x) => x.option?.toLowerCase() === "new");
    if (k >= 0) filters.splice(k, 1);
  }
  const unaccounted = tokens.filter((_, k) => !accounted.has(k));
  // A word that names a different entity means the tile is about that entity, not this one.
  if (unaccounted.some((t) => [...otherHeads].some(([h, id]) => id !== e.id && same(t, h)))) return null;
  const hasMeasure = mention || filters.length > 0 || measure !== null || span !== null;
  if (!hasMeasure) return null;
  const allowed = filters.length || measure ? 1 : 0;
  if (unaccounted.length > allowed) return null;
  return { entity: e, unaccounted, mention, filters, measure, hasWith: /\b(with|having)\b/.test(raw), dateField, span };
}

const GENERIC_NAME = /^(app|apps|api|system|systems|database|db|data|service|services|platform|portal|internal|sandbox|test|live)$/;
/** Connection names read as their kind when a status mentions it: "Logged to HubSpot" ≈ "Logged to CRM". */
function aliases(bp: Blueprint): Map<string, string> {
  const out = new Map<string, string>();
  const optionWords = new Set(bp.entities.flatMap((e) => e.fields.flatMap((f) => (f.options ?? []).flatMap(words))));
  for (const c of bp.connections)
    if (optionWords.has(c.kind)) for (const w of significant(c.name)) if (w.length >= 3 && !GENERIC_NAME.test(w) && w !== c.kind) out.set(w, c.kind);
  return out;
}

/** "Today" for the sample data: the latest date on any past-tense field ("filed", "opened", "requested"). */
function dataToday(bp: Blueprint): number | null {
  let best: number | null = null;
  for (const e of bp.entities)
    for (const f of e.fields.filter((x) => x.type === "date" && PAST_DATE.test(x.name) && !FUTURE_DATE.test(x.name)))
      for (const r of e.sample) {
        const t = parseDate(r[f.name]);
        if (t !== null && (best === null || t > best)) best = t;
      }
  return best;
}

function inWindow(rows: Row[], ev: Eval, bp: Blueprint): Row[] {
  if (!ev.span || !ev.dateField) return rows;
  const name = ev.dateField.name;
  const times = rows.map((r) => parseDate(r[name])).filter((t): t is number => t !== null);
  if (!times.length) return rows;
  const forward = ev.span.forward || FUTURE_DATE.test(name);
  const anchor = forward ? (dataToday(bp) ?? Math.min(...times)) : Math.max(...times);
  const [from, to] = forward ? [anchor, anchor + (ev.span.days - 1) * DAY] : [anchor - (ev.span.days - 1) * DAY, anchor];
  return rows.filter((r) => {
    const t = parseDate(r[name]);
    return t !== null && t >= from && t <= to;
  });
}

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** The entity a KPI row summarises by default: the first table, list or detail on its screen. */
export function screenEntityId(bp: Blueprint, screenId: string | undefined): string | undefined {
  const s = bp.screens.find((x) => x.id === screenId);
  if (!s) return undefined;
  for (const b of [...s.regions.main, ...s.regions.side]) if ("entityId" in b && b.entityId) return b.entityId;
  return undefined;
}

/**
 * Tiles like "Approved this week" or "Ready for day one" count items that have left the
 * queue the sample rows show (approved payouts are sent, ready hires are done). A zero
 * computed from the queue would be misleading, so keep the authored figure then.
 */
export function deriveKpi(item: KpiItem, bp: Blueprint, screenEntity?: string): DerivedKpi {
  const d = deriveFromRows(item, bp, screenEntity);
  const authoredNonZero = /[1-9]/.test(item.value.replace(/\bof\b.*$/, ""));
  return d.zero && authoredNonZero ? { value: item.value, delta: item.delta, derived: false, zero: false } : d;
}

function deriveFromRows(item: KpiItem, bp: Blueprint, screenEntity?: string): DerivedKpi {
  const authored: DerivedKpi = { value: item.value, delta: item.delta, derived: false, zero: false };
  const shape = parseShape(item.value);
  if (!shape) return authored;
  const alias = aliases(bp);
  const tokens = significant(item.label).map((t) => alias.get(t) ?? t);
  if (!tokens.length) return authored;
  const heads = new Map<string, string>();
  for (const e of bp.entities) for (const h of entityWords(e).head) heads.set(h, e.id);

  const candidates = bp.entities
    .map((e) => evaluate(e, item.label, tokens, heads, shape.kind === "money"))
    .filter((x): x is Eval => x !== null)
    .filter((x) => x.entity.id === screenEntity || x.mention || (x.unaccounted.length === 0 && (x.filters.length > 0 || x.measure !== null)))
    .sort((a, b) => a.unaccounted.length - b.unaccounted.length || Number(b.entity.id === screenEntity) - Number(a.entity.id === screenEntity) || Number(b.mention) - Number(a.mention));
  const ev = candidates[0];
  if (!ev || !ev.entity.sample.length) return authored;

  const windowRows = inWindow(ev.entity.sample, ev, bp);
  const rows = windowRows.filter((r) => ev.filters.every((f) => f.test(r[f.field])));
  const moneyField = ev.measure?.type === "money" ? ev.measure : ev.entity.fields.find((f) => f.type === "money") ?? null;
  const sum = (f: Field, rs: Row[]) => rs.reduce((s, r) => s + (num(r[f.name]) ?? 0), 0);

  let value: string | null = null;
  let n = 0;
  switch (shape.kind) {
    case "ratio":
      if (ev.measure) break;
      n = rows.length;
      value = `${n} of ${windowRows.length}`;
      break;
    case "money":
      if (!moneyField) break;
      n = sum(moneyField, rows);
      value = formatMoney(n, shape.symbol, shape.compact);
      break;
    case "percent": {
      if (ev.measure) {
        const vals = rows.map((r) => num(r[ev.measure!.name])).filter((x): x is number => x !== null);
        if (!vals.length) break;
        const avg = vals.reduce((s, x) => s + x, 0) / vals.length;
        n = Math.round(vals.every((x) => x >= 0 && x <= 1) ? avg * 100 : avg);
      } else if (ev.filters.length && windowRows.length) {
        n = Math.round((rows.length / windowRows.length) * 100);
      } else break;
      value = `${n}%`;
      break;
    }
    case "decimal": {
      if (!ev.measure) break;
      const vals = rows.map((r) => num(r[ev.measure!.name])).filter((x): x is number => x !== null).sort((a, b) => a - b);
      if (!vals.length) break;
      n = /\bmedian\b/i.test(item.label) ? vals[Math.floor((vals.length - 1) / 2)] : vals.reduce((s, x) => s + x, 0) / vals.length;
      value = n.toFixed(shape.places);
      break;
    }
    case "count":
      if (ev.measure && ev.measure.type === "number") {
        const vals = rows.map((r) => num(r[ev.measure!.name]) ?? 0);
        // "Accounts with open tickets" counts rows; "Open cases" adds them up. Scores (0 to 1) never sum.
        if (ev.hasWith) n = vals.filter((x) => x > 0).length;
        else if (vals.every((x) => Number.isInteger(x))) n = vals.reduce((s, x) => s + x, 0);
        else break;
      } else if (ev.measure) break;
      else n = rows.length;
      value = n.toLocaleString("en-US");
      break;
  }
  if (value === null) return authored;
  if (value === item.value.trim()) return { value, delta: item.delta, derived: true, zero: n === 0 };
  // The authored delta described the authored number. Keep it only when it can be recomputed ("$35,840 claimed").
  let delta: string | undefined;
  const moneyDelta = item.delta?.match(/^\(?([$£€₹])[\d,.]+\s*([kKmM])?(\s+[^)]*)\)?$/);
  if (moneyDelta && moneyField && (shape.kind === "count" || shape.kind === "ratio") && !ev.measure) {
    delta = `${formatMoney(sum(moneyField, rows), moneyDelta[1], moneyDelta[2] ? (moneyDelta[2].toLowerCase() === "k" ? "k" : "M") : "")}${moneyDelta[3]}`;
  }
  return { value, delta, derived: true, zero: n === 0 };
}
