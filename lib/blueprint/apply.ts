import { BlueprintSchema, clipToLimits, type Blueprint } from "./schema";
import { applyOperation } from "./pointer";
import { integrityErrors } from "./validate";
import { estimate } from "./estimate";
import type { ChangeOperation } from "@/lib/db/types";

export type ApplyResult = { ok: true; blueprint: Blueprint } | { ok: false; error: string };

/** Apply JSON-pointer operations to a copy, then re-validate schema + integrity. */
export function applyOps(bp: Blueprint, ops: ChangeOperation[]): ApplyResult {
  const next = structuredClone(bp) as unknown;
  try {
    for (const op of ops) applyOperation(next, op);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "could not apply change" };
  }
  const parsed = BlueprintSchema.safeParse(clipToLimits(next));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid blueprint" };
  const errs = integrityErrors(parsed.data);
  if (errs.length) return { ok: false, error: errs[0] };
  parsed.data.estimate = estimate(parsed.data);
  return { ok: true, blueprint: parsed.data };
}

export function markBuilt(bp: Blueprint): Blueprint {
  const next = structuredClone(bp);
  next.screens.forEach((s) => (s.status = "built"));
  return next;
}
