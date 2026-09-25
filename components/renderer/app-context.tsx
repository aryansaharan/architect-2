"use client";
import { createContext, useContext } from "react";
import type { Blueprint, Entity } from "@/lib/blueprint/schema";

export type AppMode = "preview" | "live";

export type AppCtx = {
  bp: Blueprint;
  mode: AppMode;
  device: "desktop" | "tablet" | "phone";
  screenId: string;
  navigate: (screenId: string) => void;
  selectedRow: Record<string, number>;
  selectRow: (entityId: string, index: number) => void;
  toast: (msg: string) => void;
  askAgent: (agentId: string, prompt: string) => void;
  entity: (id: string) => Entity | undefined;
  projectId?: string;
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
