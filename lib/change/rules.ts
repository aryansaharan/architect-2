import { sortPhrase, type Blueprint, type ObjectRef } from "@/lib/blueprint/schema";
import { findBlock } from "@/lib/blueprint";
import { presetPermission } from "@/lib/blueprint/describe";
import type { ChangeOperation } from "@/lib/db/types";
import { rankOrder } from "./edits";

type RuleResult = { summary: string; rationale: string; operations: ChangeOperation[] };

const COLOURS: Record<string, string> = {
  red: "#DC2626", orange: "#EA580C", amber: "#D97706", yellow: "#CA8A04", green: "#16A34A", teal: "#0F766E",
  blue: "#2563EB", indigo: "#4F46E5", purple: "#7C3AED", violet: "#7C3AED", pink: "#DB2777", black: "#111827", navy: "#1E3A8A",
};

/** A name without the straight or curly quotes around it: “Claims Inbox” → Claims Inbox. */
const unquote = (s: string) => s.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();

const snake = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32);

const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8 };
const ORDINAL_WORDS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

type Place = { phrase: string } & ({ kind: "index"; n: number } | { kind: "end" } | { kind: "relative"; after: boolean; ref: string });

/** Where a new column should go, read from the request. Null when it doesn't say. */
function columnPlace(lower: string): Place | null {
  const ordinal = lower.match(/\b(?:as |in |into )?(?:the )?(first|second|third|fourth|fifth|sixth|seventh|eighth|[1-8](?:st|nd|rd|th)?) (?:column|position|place|spot)\b/);
  if (ordinal) return { phrase: ordinal[0], kind: "index", n: ORDINALS[ordinal[1]] ?? parseInt(ordinal[1], 10) };
  const start = lower.match(/\b(?:at|to) the (?:start|front|beginning|far left)\b|\bleftmost\b/);
  if (start) return { phrase: start[0], kind: "index", n: 1 };
  const end = lower.match(/\b(?:at|to) the (?:end|back|far right)\b|\blast column\b/);
  if (end) return { phrase: end[0], kind: "end" };
  const rel = lower.match(/\b(right after|after|just after|right before|before|just before|next to)\s+(?:the\s+)?[“"']?([a-z][a-z0-9 _-]{0,29}?)[”"']?(?:\s+column)?(?=[.,!?]|$)/);
  if (rel) return { phrase: rel[0], kind: "relative", after: !rel[1].includes("before"), ref: rel[2].trim() };
  return null;
}

/** Known enum scales, top first, for a new column that rows are ranked by. */
const SCALES = [
  ["Urgent", "High", "Normal", "Low"],
  ["Critical", "High", "Medium", "Low"],
  ["High", "Medium", "Low"],
  ["Overdue", "Due soon", "On track"],
  ["VIP", "Standard"],
];
const PRIORITY_WORDS = /\b(?:priority|urgency|severity|importance)\b/;

/** Sample value i for a new enum column: every value shows up, out of order, so the sort is visible. */
const sampleAt = (scale: string[], i: number) => scale[(i * (scale.length % 3 === 0 ? 2 : 3) + 1) % scale.length];

/** For severity-like options (Urgent, High, Normal, Low in any order), the most severe first. Null otherwise. */
function severity(options: string[] | undefined): string[] | null {
  const score = (o: string) => (/urgent|critical|blocker|p0/i.test(o) ? 4 : /^high|high$/i.test(o) ? 3 : /medium|normal|moderate|standard/i.test(o) ? 2 : /^low|minor|low$/i.test(o) ? 1 : 0);
  if (!options || options.filter((o) => score(o) > 0).length < 2) return null;
  return [...options].sort((a, b) => score(b) - score(a));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const FIRST = String.raw`(?:first|at the top|on top|to the top|up top)`;

type SortAsk = { field?: string; value?: string; dir: "asc" | "desc"; scale?: string[] };

/**
 * Row order read from the request: "sort by amount", "urgent claims first", "newest at the top",
 * "highest fraud score first". `field` is a field name or the words for a new one; `value` is the
 * enum value that goes first; `scale` is the options for a new column ranked that way.
 */
function readSort(text: string, entity: Blueprint["entities"][number], columns: string[], newCol: string | undefined): SortAsk | null {
  const desc = /\b(?:desc|descending|highest|largest|biggest|newest|latest|most recent|most|high to low|z to a|reverse)\b/.test(text);
  const fieldBy = (words: string) => entity.fields.find((f) => f.name === snake(words) || (f.label ?? "").toLowerCase() === words || f.name.replace(/_/g, " ") === words);
  const by = text.match(/\b(?:sort|sorted|order|ordered|rank|ranked|arrange)\s+(?:it |this |them |the table |the list |the queue |rows |[a-z]+ )?by\s+(?:the\s+)?([a-z][a-z0-9 _-]{0,29}?)(?:\s+column)?(?=[”"'.,!?;]|\s+(?:with|so|and|then|in|on|to|from|descending|ascending|desc|asc|highest|lowest|newest|oldest|latest|earliest|biggest|largest|smallest|most|least|high|low|a to z|z to a|please|first)\b|$)/);
  if (by) {
    const f = fieldBy(by[1].trim());
    const sev = f?.type === "enum" ? severity(f.options) : null;
    // "Sort by priority" means most urgent first; "lowest first" or "ascending" turns it round.
    if (sev) return { field: by[1].trim(), dir: "asc", value: /\b(?:asc|ascending|lowest|least|low to high)\b/.test(text) ? sev[sev.length - 1] : sev[0] };
    return { field: by[1].trim(), dir: desc ? "desc" : "asc", ...(PRIORITY_WORDS.test(by[1]) && !f ? { value: SCALES[0][0], scale: SCALES[0] } : {}) };
  }
  // "<value> … first": the words just before "first" / "at the top", within the same clause, not a column's place.
  const first = text.match(new RegExp(String.raw`([a-z0-9 ,'’-]{0,60}?)\s*\b` + FIRST + String.raw`\b`));
  const window = first ? (first[1].split(/[,;]| and | so | then | with | where | but /).pop() ?? "") : "";
  if (first && !/\bcolumns?\b/.test(window)) {
    for (const f of entity.fields) {
      if (f.type !== "enum") continue;
      const hit = (f.options ?? []).find((o) => new RegExp(String.raw`\b${esc(o.toLowerCase())}\b`).test(window));
      if (hit) return { field: f.name, value: hit, dir: "asc" };
    }
    if (newCol && !fieldBy(newCol)) {
      const scales = PRIORITY_WORDS.test(newCol) ? SCALES : SCALES.slice(2);
      for (const scale of scales) {
        const hit = scale.find((o) => new RegExp(String.raw`\b${esc(o.toLowerCase())}\b`).test(window));
        if (hit) return { field: newCol, value: hit, dir: "asc", scale };
      }
    }
    const recent = window.match(/\b(newest|latest|most recent|oldest|earliest)\b/);
    if (recent) {
      const date = columns.map((c) => entity.fields.find((f) => f.name === c)).find((f) => f?.type === "date") ?? entity.fields.find((f) => f.type === "date");
      if (date) return { field: date.name, dir: /oldest|earliest/.test(recent[1]) ? "asc" : "desc" };
    }
    const size = window.match(/\b(highest|largest|biggest|most expensive|lowest|smallest|cheapest)\b\s*([a-z][a-z0-9 _-]{0,29})?$/);
    if (size) {
      const named = size[2] ? fieldBy(size[2].trim()) ?? fieldBy(size[2].trim().replace(/s$/, "")) : undefined;
      const num = named && (named.type === "number" || named.type === "money") ? named : columns.map((c) => entity.fields.find((f) => f.name === c)).find((f) => f?.type === "money" || f?.type === "number");
      if (num) return { field: num.name, dir: /lowest|smallest|cheapest/.test(size[1]) ? "asc" : "desc" };
    }
  }
  return null;
}

/** Offline rules for common, safe edits. Anything else becomes a handoff suggestion. */
export function ruleProposal(bp: Blueprint, request: string, scope: ObjectRef | null): RuleResult {
  const text = request.trim();
  const lower = text.toLowerCase();
  const none: RuleResult = { summary: "", rationale: "", operations: [] };

  // Theme colour: "make it blue", "use green as the brand colour"
  const colour = Object.keys(COLOURS).find((c) => new RegExp(`\\b${c}\\b`).test(lower));
  const hex = lower.match(/#([0-9a-f]{6})\b/)?.[0];
  if ((colour || hex) && /(colou?r|theme|brand|make it|primary)/.test(lower)) {
    const value = hex ? hex.toUpperCase() : COLOURS[colour!];
    return { summary: `Change the brand colour to ${colour ?? value}`, rationale: "Updates the app's primary colour on every screen.", operations: [{ op: "set", path: "/meta/theme/primary", value }] };
  }

  // Rename: rename X to Y / call it Y
  // Either name may be in straight or curly quotes: Rename "Intake Queue" to “Claims Inbox”.
  const rename = text.match(/rename (?:the )?(.+?) to (.+?)[.!]?$/i) ?? text.match(/call (?:it|this) (.+?)[.!]?$/i);
  if (rename) {
    const to = unquote(rename[2] ?? rename[1]).slice(0, 40);
    const from = rename[2] ? unquote(rename[1].replace(/\s+(?:screen|page|agent|ai helper|helper)$/i, "")).toLowerCase() : null;
    const si = bp.screens.findIndex((s) => (from ? s.title.toLowerCase() === from : scope?.type === "screen" && s.id === scope.id));
    if (si >= 0) return { summary: `Rename “${bp.screens[si].title}” to “${to}”`, rationale: "Changes the screen's title and its navigation label.", operations: [{ op: "set", path: `/screens/${si}/title`, value: to }] };
    const ai = bp.agents.findIndex((a) => (from ? a.name.toLowerCase() === from : scope?.type === "agent" && a.id === scope.id));
    if (ai >= 0) return { summary: `Rename “${bp.agents[ai].name}” to “${to}”`, rationale: "Changes the agent's display name everywhere it appears.", operations: [{ op: "set", path: `/agents/${ai}/name`, value: to }] };
    if (!from) return { summary: `Rename the project to “${to}”`, rationale: "Changes the app's name.", operations: [{ op: "set", path: "/meta/name", value: to }] };
  }

  // Agent permissions: "ask before X", "always ask", "let it X without asking"
  const agentIdx = scope?.type === "agent" ? bp.agents.findIndex((a) => a.id === scope.id) : bp.agents.findIndex((a) => lower.includes(a.name.toLowerCase()));
  if (agentIdx >= 0 && /(ask|approv|permission|without asking|on its own)/.test(lower)) {
    const agent = bp.agents[agentIdx];
    const toolIdx = agent.tools.findIndex((t) => lower.includes(t.name.toLowerCase()) || lower.includes(t.id.replace(/_/g, " ")));
    const relax = /(without asking|on its own|don'?t ask|no need to ask)/.test(lower);
    if (toolIdx >= 0) {
      const tool = agent.tools[toolIdx];
      const value = relax ? (tool.access === "irreversible" ? "log" : "auto") : "ask";
      return {
        summary: `${relax ? "Let" : "Make"} ${agent.name} ${relax ? "" : "ask before it can "}${tool.name.charAt(0).toLowerCase() + tool.name.slice(1)}${relax ? " without asking" : ""}`,
        rationale: relax && tool.access === "irreversible" ? "This action can't be undone. It will be logged, and Preflight will flag it before going live." : "Changes when this agent needs a person's approval.",
        operations: [{ op: "set", path: `/agents/${agentIdx}/tools/${toolIdx}/permission`, value }],
      };
    }
    return {
      summary: relax ? `Let ${agent.name} work on its own` : `Have a person approve everything ${agent.name} does`,
      rationale: "Changes how closely this agent is supervised.",
      operations: [
        { op: "set", path: `/agents/${agentIdx}/supervision`, value: relax ? "autonomous" : "approve_all" },
        ...agent.tools.map((t, i) => ({ op: "set" as const, path: `/agents/${agentIdx}/tools/${i}/permission`, value: presetPermission(relax ? "autonomous" : "approve_all", t.access) })),
      ],
    };
  }

  // Tables: "add a column for X", "sort by X", "urgent first", "newest at the top"
  const tableRef = scope?.type === "block" ? findBlock(bp, scope.id) : scope?.type === "screen" ? { screen: bp.screens.find((s) => s.id === scope.id)!, block: undefined } : null;
  const screen = tableRef?.screen ?? bp.screens[0];
  const si = bp.screens.findIndex((s) => s.id === screen.id);
  const main = screen.regions.main;
  const ti = tableRef?.block?.type === "table" ? main.findIndex((b) => b.id === tableRef.block!.id) : main.findIndex((b) => b.type === "table");
  const table = ti >= 0 ? main[ti] : undefined;
  if (table && table.type === "table") {
    const ei = bp.entities.findIndex((e) => e.id === table.entityId);
    const entity = bp.entities[ei];
    // Where the column goes ("as the second column", "first", "after Status") is read first, then taken out of
    // the text so it can't be mistaken for the column's name.
    const place = columnPlace(lower);
    const text2 = place ? lower.replace(place.phrase, " ").replace(/\s+/g, " ") : lower;
    const STOP = String.raw`(?=[”"'.,!?]|\s+(?:to|in|on|into|onto|of|as|after|before|column|field|please|with|so|and|sorted|sort|then)\b|$)`;
    const col = text2.match(new RegExp(String.raw`(?:add|show) (?:a |an |the )?(?:column|field)?\s*(?:for|called|named|with)?\s*[“"']?([a-z][a-z0-9 _-]{0,29}?)` + STOP, "i"))?.[1]?.trim();
    const newCol = lower.includes("column") || lower.includes("field") ? col : undefined;
    const sort = readSort(text2, entity, table.columns, newCol);
    const target = newCol ?? sort?.field;
    const findField = (w: string) => entity.fields.find((f) => f.name === snake(w) || (f.label ?? "").toLowerCase() === w || f.name.replace(/_/g, " ") === w);
    if (target) {
      const existing = findField(target);
      // "Sort by X" when X isn't stored and isn't a known scale: offline there's nothing honest to sort by.
      if (!existing && !newCol && !sort?.scale) return none;
      const name = existing?.name ?? snake(target);
      const label = existing?.label ?? target.replace(/\b\w/g, (c) => c.toUpperCase());
      const ops: ChangeOperation[] = [];
      // A new column that rows are ranked by ("a priority column with urgent claims first") is an enum on a known scale.
      const scale = !existing && sort?.field === target && sort.scale ? sort.scale : null;
      if (!existing) {
        ops.push({ op: "add", path: `/entities/${ei}/fields/-`, value: scale ? { name, label, type: "enum", options: scale } : { name, label, type: "string" } });
        entity.sample.forEach((_, ri) => ops.push({ op: "set", path: `/entities/${ei}/sample/${ri}/${name}`, value: scale ? sampleAt(scale, ri) : ["Low", "Medium", "High"][ri % 3] }));
      }
      const field = existing ?? { name, label, type: scale ? "enum" : "string", options: scale ?? undefined };
      const labelOf = (c: string) => entity.fields.find((f) => f.name === c)?.label ?? c.replace(/_/g, " ");
      const tableName = table.title ?? entity.plural;

      // Columns: a new column goes where it was asked for. Sorting by a detail the table doesn't show also shows it
      // (at the end), so the order can be seen. Sorting never moves a column.
      let where = "";
      let missed = "";
      let shown = false;
      if (newCol || !table.columns.includes(name)) {
        const cols = table.columns.filter((c) => c !== name);
        // Resolve the place to an index among the other columns; null when it names a column that isn't there.
        let at: number | null = cols.length;
        if (newCol && place?.kind === "index") { at = Math.min(place.n - 1, cols.length); where = at === 0 ? ", as the first column" : at === cols.length ? ", at the end" : `, as the ${ORDINAL_WORDS[at] ?? `#${at + 1}`} column`; }
        else if (newCol && place?.kind === "end") { at = cols.length; where = ", at the end"; }
        else if (newCol && place?.kind === "relative") {
          const ref = cols.findIndex((c) => c === snake(place.ref) || labelOf(c).toLowerCase() === place.ref);
          if (ref === -1) at = null;
          else { at = place.after ? ref + 1 : ref; where = `, ${place.after ? "after" : "before"} ${labelOf(cols[ref])}`; }
        }
        const idx = at ?? cols.length;
        const next = [...cols.slice(0, idx), name, ...cols.slice(idx)];
        // A table shows at most 8 columns: make room by dropping the last one that isn't the new column.
        if (next.length > 8) {
          let k = next.length - 1;
          while (next[k] === name) k--;
          next.splice(k, 1);
        }
        ops.push({ op: "set", path: `/screens/${si}/regions/main/${ti}/columns`, value: next });
        shown = !newCol;
        if (at === null && place?.kind === "relative") missed = ` I couldn't find a “${place.ref}” column in ${tableName}, so it's added at the end. Ask again to move it.`;
      }

      // Row order: by the new column, or by another detail the table's data already has.
      const sortField = !sort ? undefined : sort.field === target ? field : findField(sort.field ?? "");
      let sorted = "";
      let phrase = "";
      if (sort && sortField) {
        const base = sortField.type === "enum" ? (severity(sortField.options) ?? sortField.options ?? []) : [];
        const order = sort.value ? (rankOrder(sortField, [sort.value]) ?? undefined) : base.length ? (sort.dir === "desc" ? [...base].reverse() : base) : undefined;
        const value = order?.length ? { column: sortField.name, dir: "asc" as const, order } : { column: sortField.name, dir: sort.dir };
        ops.push({ op: "set", path: `/screens/${si}/regions/main/${ti}/sort`, value });
        phrase = sortPhrase(value, sortField.type);
        sorted = sortField.name === name ? phrase : `by ${sortField.label ?? sortField.name.replace(/_/g, " ")} (${phrase})`;
      }
      const sortLabel = sortField?.label ?? sortField?.name.replace(/_/g, " ") ?? label;

      const summary = newCol ? `Add a “${target}” column to ${tableName}${where}${sorted ? `, sorted ${sorted}` : ""}` : `Sort ${tableName} by ${label} (${sorted})`;
      const why = existing ? "Uses data the app already stores." : `Adds a new detail to ${entity.plural} and fills the sample records so you can see it.`;
      const how = sorted ? ` Rows are sorted by ${sortLabel}, ${phrase}${shown ? `, and ${label} is added as a column so you can see the order` : ""}. People can still click a column header to re-sort.` : "";
      return { summary, rationale: why + how + missed, operations: ops };
    }
  }
  return none;
}
