import type { Blueprint, ObjectRef } from "@/lib/blueprint/schema";
import { findBlock } from "@/lib/blueprint";
import { presetPermission } from "@/lib/blueprint/describe";
import type { ChangeOperation } from "@/lib/db/types";

type RuleResult = { summary: string; rationale: string; operations: ChangeOperation[] };

const COLOURS: Record<string, string> = {
  red: "#DC2626", orange: "#EA580C", amber: "#D97706", yellow: "#CA8A04", green: "#16A34A", teal: "#0F766E",
  blue: "#2563EB", indigo: "#4F46E5", purple: "#7C3AED", violet: "#7C3AED", pink: "#DB2777", black: "#111827", navy: "#1E3A8A",
};

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
  const rename = text.match(/rename (?:the )?(.+?) to [“"']?(.+?)[”"']?$/i) ?? text.match(/call (?:it|this) [“"']?(.+?)[”"']?$/i);
  if (rename) {
    const to = (rename[2] ?? rename[1]).trim().slice(0, 40);
    const from = rename[2] ? rename[1].trim().toLowerCase() : null;
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

  // Tables: "add a column for X", "sort by X", "show X first"
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
    const STOP = String.raw`(?=[”"'.,!?]|\s+(?:to|in|on|into|onto|of|as|after|before|column|field|please)\b|$)`;
    const col = text2.match(new RegExp(String.raw`(?:add|show) (?:a |an |the )?(?:column|field)?\s*(?:for|called|named|with)?\s*[“"']?([a-z][a-z0-9 _-]{0,29}?)` + STOP, "i"))?.[1]?.trim();
    const sortBy = text2.match(new RegExp(String.raw`(?:sort|order|rank) (?:it |this |them |the table )?by ([a-z][a-z0-9 _-]{0,29}?)` + STOP))?.[1]?.trim();
    const target = sortBy ?? (lower.includes("column") || lower.includes("field") ? col : undefined);
    if (target) {
      const existing = entity.fields.find((f) => f.name === snake(target) || (f.label ?? "").toLowerCase() === target);
      const name = existing?.name ?? snake(target);
      const ops: ChangeOperation[] = [];
      if (!existing) {
        ops.push({ op: "add", path: `/entities/${ei}/fields/-`, value: { name, label: target.replace(/\b\w/g, (c) => c.toUpperCase()), type: "string" } });
        entity.sample.forEach((_, ri) => ops.push({ op: "set", path: `/entities/${ei}/sample/${ri}/${name}`, value: ["Low", "Medium", "High"][ri % 3] }));
      }
      const cols = table.columns.filter((c) => c !== name);
      const labelOf = (c: string) => entity.fields.find((f) => f.name === c)?.label ?? c.replace(/_/g, " ");
      // Resolve the place to an index among the other columns; null when it names a column that isn't there.
      let at: number | null = cols.length;
      let where = "";
      if (sortBy) { at = 0; where = ""; }
      else if (place?.kind === "index") { at = Math.min(place.n - 1, cols.length); where = at === 0 ? ", as the first column" : at === cols.length ? ", at the end" : `, as the ${ORDINAL_WORDS[at] ?? `#${at + 1}`} column`; }
      else if (place?.kind === "end") { at = cols.length; where = ", at the end"; }
      else if (place?.kind === "relative") {
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
      const tableName = table.title ?? entity.plural;
      const missed = at === null && place?.kind === "relative" ? ` I couldn't find a “${place.ref}” column in ${tableName}, so it's added at the end. Ask again to move it.` : "";
      return {
        summary: sortBy ? `Show ${target} first in ${tableName}` : `Add a “${target}” column to ${tableName}${where}`,
        rationale: (existing ? "Uses data the app already stores." : `Adds a new detail to ${entity.plural} and fills the sample records so you can see it.`) + missed,
        operations: ops,
      };
    }
  }
  return none;
}
