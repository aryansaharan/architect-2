"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Blocks, Bot, Check, Database, Loader2, Plug } from "lucide-react";

export type PartialDraft = {
  name?: string;
  tagline?: string;
  entities?: { name?: string; plural?: string }[];
  connections?: { name?: string; kind?: string }[];
  agents?: { name?: string; role?: string; tools?: { name?: string; access?: string }[] }[];
  screens?: { title?: string; kind?: string }[];
};

export function usePlanStream(initialMode: "live" | "offline") {
  const router = useRouter();
  const [draft, setDraft] = useState<PartialDraft>({});
  const [mode, setMode] = useState<"live" | "offline">(initialMode);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [running, setRunning] = useState(false);
  const started = useRef(0);

  useEffect(() => {
    if (!running || done) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [running, done]);

  async function start(url: string, body: unknown, redirect: (projectId: string) => string) {
    setRunning(true);
    setError(null);
    setNote(null);
    setDraft({});
    setDone(false);
    started.current = Date.now();
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Planning failed");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.t === "status") setMode(e.mode);
          if (e.t === "partial") setDraft(e.draft ?? {});
          if (e.t === "note") {
            setNote(e.text);
            setMode("offline");
          }
          if (e.t === "error") throw new Error(e.message);
          if (e.t === "done") {
            setDone(true);
            setTimeout(() => router.push(redirect(e.projectId)), 900);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Planning failed");
    }
  }

  return { draft, mode, note, error, elapsed, done, running, start };
}

export function PlanningView({ s, eyebrow, onRetry }: { s: ReturnType<typeof usePlanStream>; eyebrow: string; onRetry: () => void }) {
  const { draft, mode, note, error, elapsed, done } = s;
  const cols = [
    { title: "Screens", icon: Blocks, items: (draft.screens ?? []).map((x) => x?.title).filter(Boolean) as string[] },
    { title: "Agents", icon: Bot, items: (draft.agents ?? []).map((a) => a?.name).filter(Boolean) as string[] },
    { title: "Data", icon: Database, items: (draft.entities ?? []).map((e) => e?.plural ?? e?.name).filter(Boolean) as string[] },
    { title: "Connections", icon: Plug, items: (draft.connections ?? []).map((c) => c?.name).filter(Boolean) as string[] },
  ];
  const risky = (draft.agents ?? []).flatMap((a) => a?.tools ?? []).filter((t) => t?.access === "irreversible").length;
  const phase = !draft.name ? "Reading…" : !draft.entities?.length ? "Deciding what the app needs to remember…" : !draft.agents?.length ? "Choosing outside systems…" : !draft.screens?.length ? "Hiring agents and deciding what each may do…" : done ? "Plan ready." : "Laying out the screens people will use…";
  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="micro-label">{eyebrow} · {mode === "live" ? "planning with Claude" : "offline mode · starter plan"}</p>
          <h1 className="mt-2 font-display text-[40px] leading-tight">{draft.name ?? "Planning…"}</h1>
          <p className="mt-1 text-[14px] text-muted-foreground" aria-live="polite">{draft.tagline ?? phase}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[12px] tabular-nums text-muted-foreground">{elapsed}s</p>
          <p className="text-[12px] text-faint">{done ? "opening the plan…" : phase}</p>
        </div>
      </div>
      {note && <p className="mt-4 rounded-lg border border-amber/30 bg-amber-soft px-3 py-2 text-[13px]">{note}</p>}
      {error && (
        <div className="mt-4 rounded-lg border border-ask/30 bg-ask/10 px-3 py-2 text-[13px] text-ask">
          {error} <button className="underline" onClick={onRetry}>Try again</button>
        </div>
      )}
      <div className="dot-grid mt-6 grid gap-6 rounded-2xl border border-hairline p-6 md:grid-cols-4">
        {cols.map((c) => (
          <div key={c.title}>
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-foreground/80"><c.icon className="size-3.5 text-muted-foreground" />{c.title}<span className="font-mono text-faint">{c.items.length || ""}</span></p>
            <ul className="mt-3 space-y-2.5">
              {c.items.map((it, i) => <li key={it + i} className="panel animate-in fade-in slide-in-from-bottom-1 rounded-lg px-3 py-2.5 text-[13px] duration-300">{it}</li>)}
              {!done && Array.from({ length: Math.max(1, 3 - c.items.length) }).map((_, i) => <li key={`sk-${i}`} className="shimmer h-10 rounded-lg border border-hairline" />)}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-[12.5px] text-muted-foreground">
        {risky > 0 && <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-ask" />{risky} action{risky === 1 ? "" : "s"} can&apos;t be undone — they&apos;ll ask a person first</span>}
        {mode === "live" && !done && elapsed > 25 && <span>Careful planning takes about a minute. Everything appears here as it&apos;s decided.</span>}
        {done && <span className="inline-flex items-center gap-1.5 text-read"><Check className="size-3.5" />Saved as save point #1</span>}
        {!done && !error && <Loader2 className="ml-auto size-4 animate-spin text-amber" />}
      </div>
    </div>
  );
}
