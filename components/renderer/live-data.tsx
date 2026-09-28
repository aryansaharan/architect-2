"use client";
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import type { Blueprint } from "@/lib/blueprint/schema";
import type { AppRole } from "@/lib/apps/access";
import type { AppRecord } from "@/lib/apps/records";
import type { LiveData, RecordValues, WriteOutcome } from "./app-context";
import { RECORDS_CHANGED_EVENT } from "./helper-context";

/** What the server decided this person gets of a published app (lib/apps/live.ts liveView), minus the sign-in wall case. */
export type ClientView = {
  role: AppRole;
  bp: Blueprint;
  records: Record<string, AppRecord[]>;
  canCreate: Record<string, string[]>;
  canEdit: boolean;
  hasSample: boolean;
  /** The owner lets visitors talk to the AI helpers on public pages. */
  publicHelpers: boolean;
};

type Undo = { key: number; msg: string; changeId?: string; busy?: boolean };

const OFFLINE = "Couldn't reach the app. Check your connection and try again.";

async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; body: Record<string, unknown> | null }> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init, headers: init?.body ? { "content-type": "application/json" } : undefined });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, body };
  } catch {
    return { ok: false, body: { error: OFFLINE } };
  }
}

const failed = (body: Record<string, unknown> | null, fallback: string): WriteOutcome => ({ ok: false, error: typeof body?.error === "string" ? body.error : fallback });

/**
 * A published app's records in the browser. The renderer reads each entity's rows from the blueprint,
 * so the blueprint handed to it carries the current records (newest first) as those rows, with a
 * parallel list of record ids so a detail view or an edit knows which record it is on. After every
 * write the records are read again from the server, which alone decides what this person may see.
 */
export function useLiveData(slug: string, view: ClientView) {
  const [records, setRecords] = useState(view.records);
  const [hasSample, setHasSample] = useState(view.hasSample);
  const [undo, setUndo] = useState<Undo | null>(null);
  const base = `/api/apps/${slug}`;

  const refresh = useCallback(async () => {
    const { ok, body } = await call(`${base}/records`);
    if (!ok || !body?.records) return;
    setRecords(body.records as Record<string, AppRecord[]>);
    setHasSample(Boolean(body.hasSample));
  }, [base]);

  const bp = useMemo<Blueprint>(
    () => ({ ...view.bp, entities: view.bp.entities.map((e) => ({ ...e, sample: (records[e.id] ?? []).map((r) => r.data) })) }),
    [view.bp, records],
  );
  const ids = useMemo(() => Object.fromEntries(Object.entries(records).map(([e, rows]) => [e, rows.map((r) => r.id)])), [records]);

  const show = useCallback((u: Omit<Undo, "key">) => setUndo({ ...u, key: Date.now() + Math.random() }), []);

  const data = useMemo<LiveData>(
    () => ({
      canEdit: view.canEdit,
      hasSample,
      recordId: (entityId, index) => ids[entityId]?.[index],
      indexOf: (entityId, id) => ids[entityId]?.indexOf(id) ?? -1,
      createRecord: async (entityId: string, values: RecordValues, formId?: string) => {
        const { ok, body } = await call(`${base}/records`, { method: "POST", body: JSON.stringify({ entityId, values, formId }) });
        if (!ok) return failed(body, "That didn't go through. Try again.");
        await refresh();
        return { ok: true };
      },
      updateRecord: async (entityId: string, index: number, values: RecordValues) => {
        const id = ids[entityId]?.[index];
        if (!id) return { ok: false, error: "That record is gone" };
        const { ok, body } = await call(`${base}/records/${id}`, { method: "PATCH", body: JSON.stringify({ values }) });
        if (!ok) return failed(body, "Couldn't save that change. Try again.");
        const record = body?.record as AppRecord | undefined;
        if (record) setRecords((all) => ({ ...all, [entityId]: (all[entityId] ?? []).map((r) => (r.id === record.id ? record : r)) }));
        show({ msg: "Saved.", changeId: typeof body?.changeId === "string" ? body.changeId : undefined });
        await refresh();
        return { ok: true };
      },
    }),
    [view.canEdit, hasSample, ids, base, refresh, show],
  );

  const undoLast = useCallback(async () => {
    if (!undo?.changeId || undo.busy) return;
    setUndo({ ...undo, busy: true });
    const { ok, body } = await call(`${base}/undo`, { method: "POST", body: JSON.stringify({ changeId: undo.changeId }) });
    if (ok) await refresh();
    show({ msg: ok ? "Change undone." : typeof body?.error === "string" ? body.error : "Couldn't undo that. Try again." });
  }, [undo, base, refresh, show]);

  const clearSamples = useCallback(async (): Promise<WriteOutcome> => {
    const { ok, body } = await call(`${base}/samples`, { method: "DELETE" });
    if (!ok) return failed(body, "Couldn't clear the sample data. Try again.");
    await refresh();
    show({ msg: "Sample data cleared." });
    return { ok: true };
  }, [base, refresh, show]);

  // An AI helper changed a record (or its change was undone from the chat): show the app as it is now.
  useEffect(() => {
    const again = () => void refresh();
    window.addEventListener(RECORDS_CHANGED_EVENT, again);
    return () => window.removeEventListener(RECORDS_CHANGED_EVENT, again);
  }, [refresh]);

  return { bp, data, hasSample, refresh, clearSamples, undo, undoLast, dismissUndo: () => setUndo(null) };
}

/** "Saved." with Undo after a change, in the app's own slate look. */
export function UndoToast({ undo, onUndo, onDismiss }: { undo: Undo | null; onUndo: () => void; onDismiss: () => void }) {
  const expire = useEffectEvent(() => onDismiss());
  useEffect(() => {
    if (!undo || undo.busy) return;
    const t = setTimeout(() => expire(), undo.changeId ? 8000 : 3200);
    return () => clearTimeout(t);
  }, [undo]);
  if (!undo) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div role="status" className="pointer-events-auto flex items-center gap-3 rounded-lg bg-slate-900 py-2 pl-3 pr-2 text-[12.5px] text-white shadow-lg animate-in fade-in slide-in-from-bottom-2">
        <Check className="size-3.5 text-emerald-400" />
        {undo.msg}
        {undo.changeId && (
          <button type="button" onClick={onUndo} disabled={undo.busy} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium text-white ring-1 ring-inset ring-white/25 hover:bg-white/10 disabled:opacity-60">
            {undo.busy ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
            Undo
          </button>
        )}
      </div>
    </div>
  );
}

/** The team's reminder that the app still holds its sample data; the owner can clear it (after a confirm). */
export function SampleBanner({ owner, onClear }: { owner: boolean; onClear: () => Promise<WriteOutcome> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clear = async () => {
    setBusy(true);
    setError(null);
    const result = await onClear();
    setBusy(false);
    if (result.ok) setConfirming(false);
    else setError(result.error);
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[12.5px] text-amber-900">
      <span className="min-w-0">{confirming ? "Delete every sample record? Records people added stay. This can't be undone." : "This app still has its sample data."}</span>
      {error && <span role="alert" className="text-rose-700">{error}</span>}
      {owner && (
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {confirming ? (
            <>
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="rounded-md px-2 py-0.5 text-amber-900 hover:bg-amber-100">Keep it</button>
              <button type="button" onClick={() => void clear()} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-0.5 font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                {busy && <Loader2 className="size-3 animate-spin" />}
                Delete sample data
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="rounded-md border border-amber-300 bg-white px-2.5 py-0.5 font-medium text-amber-900 hover:bg-amber-100">Clear sample data</button>
          )}
        </span>
      )}
    </div>
  );
}
