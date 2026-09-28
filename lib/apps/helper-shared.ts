import type { AgentTool, Blueprint } from "@/lib/blueprint/schema";

/**
 * What an AI helper's tool does inside a published app, shared by the server (lib/apps/helper-tools.ts)
 * and the chat in the browser (components/renderer/chat-block.tsx) so both describe it the same way.
 * A look-up searches the app's records, an undoable change edits one record, an email is really sent
 * (after a person's OK), and anything else whose connection the app doesn't have yet does nothing.
 */
export type HelperToolKind = "search" | "change" | "email" | "unavailable";

export function toolKind(bp: Blueprint, t: AgentTool): HelperToolKind {
  if (t.access === "read") return "search";
  const kind = bp.connections.find((c) => c.id === t.connectionId)?.kind;
  if (t.access === "irreversible") return kind === "email" ? "email" : "unavailable";
  // An undoable change lands on the app's own records; a message or a payment is never a record change.
  return kind === "email" || kind === "slack" || kind === "calendar" || kind === "payments" ? "unavailable" : "change";
}

/**
 * The blueprint the scripted helper (lib/sim/demo-chat.ts) answers from: each data type's rows are the
 * records this person can see, and a visitor's data types keep only the fields the public pages show
 * (so an answer never says "not set" for a field that is only hidden). Types with nothing readable drop out.
 */
export function scriptBlueprint(bp: Blueprint, rows: Record<string, Record<string, string | number | boolean>[]>, readable?: Record<string, string[]> | null): Blueprint {
  return {
    ...bp,
    entities: bp.entities.flatMap((e) => {
      const fields = readable ? e.fields.filter((f) => readable[e.id]?.includes(f.name)) : e.fields;
      return fields.length ? [{ ...e, fields, sample: rows[e.id] ?? [] }] : [];
    }),
  };
}
