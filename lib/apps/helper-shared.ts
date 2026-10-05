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

/**
 * Why a published app's AI helper answers from its script instead of the AI model, said the same way
 * in the chat's note (components/renderer/chat-block.tsx) and in the scripted answers (lib/sim/demo-chat.ts).
 */
export type ScriptReason = "guest" | "credits" | "cap" | "budget" | "model" | "public";

const BECAUSE: Record<ScriptReason, string> = {
  guest: "the app's owner needs to sign in",
  credits: "the app's owner has used this month's credits",
  cap: "the app has reached its spending limit for this month",
  budget: "the app's AI budget for today is used up",
  model: "the AI model isn't available right now",
  public: "the app's owner hasn't switched the AI model on for visitors",
};

export const SCRIPT_REASONS = Object.keys(BECAUSE) as ScriptReason[];
export const isScriptReason = (v: unknown): v is ScriptReason => typeof v === "string" && v in BECAUSE;

/** "I'm answering from my script because the app's owner needs to sign in" (no full stop, so it can go on). */
export function answeringFromScript(reason: ScriptReason | null | undefined): string {
  return reason ? `I'm answering from my script because ${BECAUSE[reason]}` : "Right now I'm answering from my script";
}

/** The chat's note above a scripted conversation: why, and what the answers come from. */
export function scriptNote(reason: ScriptReason | null | undefined, team: boolean): string {
  const from = team ? "Answers come from the app's records." : "Answers come from what this page shows.";
  return reason ? `This AI helper is answering from its script because ${BECAUSE[reason]}. ${from}` : `This AI helper is answering from its script. ${from}`;
}
