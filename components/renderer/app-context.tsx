"use client";
import { createContext, useContext } from "react";
import type { Blueprint, Entity } from "@/lib/blueprint/schema";
import type { HistoryEntry } from "@/lib/apps/records";

export type AppMode = "preview" | "live";

export type WriteOutcome = { ok: true } | { ok: false; error: string };
export type RecordValues = Record<string, string | number | boolean>;

/**
 * A published app's real records, for the renderer. The blueprint it gets holds the current records
 * as each entity's rows (newest first); these say which record a row is and write back to the app.
 * Only set in live mode: the studio preview works on the plan's samples and has no data operations.
 */
export type LiveData = {
  /** The team can change records here (the server decides; this only shows the controls). */
  canEdit: boolean;
  /** The app still holds the sample data it was published with. */
  hasSample: boolean;
  /** The record behind row `index` of an entity's rows. */
  recordId: (entityId: string, index: number) => string | undefined;
  /** Where a record now sits in its entity's rows, or -1. */
  indexOf: (entityId: string, recordId: string) => number;
  /** When a record last changed, so anything showing it (its history) knows to read it again. */
  stamp: (entityId: string, index: number) => string | undefined;
  createRecord: (entityId: string, values: RecordValues, formId?: string) => Promise<WriteOutcome>;
  updateRecord: (entityId: string, index: number, values: RecordValues) => Promise<WriteOutcome>;
  /** A record's real history, newest first (the team only; the server refuses anyone else). */
  history: (recordId: string) => Promise<{ ok: true; history: HistoryEntry[] } | { ok: false; error: string }>;
};

/** Where an "ask an AI helper" click came from: the block (a button row, a record's buttons, a row click) and the record it was about. */
export type AskFrom = { blockId: string; entityId?: string; rowIndex?: number };

export type AppCtx = {
  bp: Blueprint;
  mode: AppMode;
  device: "desktop" | "tablet" | "phone";
  screenId: string;
  navigate: (screenId: string) => void;
  selectedRow: Record<string, number>;
  selectRow: (entityId: string, index: number) => void;
  toast: (msg: string) => void;
  askAgent: (agentId: string, prompt: string, from?: AskFrom) => void;
  entity: (id: string) => Entity | undefined;
  projectId?: string;
  /** Real records and writes, in a published app only. */
  data?: LiveData;
};

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(AppContext);
  if (!c) throw new Error("useApp outside SpecApp");
  return c;
}

/** Deterministic colour for an enum value, keyed by its position in the option list. */
export function enumTone(value: string, options: string[] | undefined): string {
  const v = value.toLowerCase();
  if (/(flag|fail|overdue|breach|urgent|critical|lapsed|denied|held|blocked|high|at risk|escalat)/.test(v)) return "bg-rose-50 text-rose-700 ring-rose-200";
  if (/(paid|approved|done|resolved|sent|active|complete|passed|won|live|closed|ok)/.test(v)) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (/(new|open|draft|pending|awaiting|queued|waiting)/.test(v)) return "bg-sky-50 text-sky-700 ring-sky-200";
  const palette = ["bg-slate-100 text-slate-700 ring-slate-200", "bg-amber-50 text-amber-800 ring-amber-200", "bg-violet-50 text-violet-700 ring-violet-200", "bg-teal-50 text-teal-700 ring-teal-200", "bg-indigo-50 text-indigo-700 ring-indigo-200"];
  const i = Math.max(0, options?.indexOf(value) ?? 0);
  return palette[i % palette.length];
}
