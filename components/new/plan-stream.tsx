"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Blocks, Bot, Check, Database, Loader2, Plug } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

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
  const agents = (draft.agents ?? []).filter((a) => a?.name);
  const cols = [
    { title: "Screens", icon: Blocks, items: (draft.screens ?? []).map((x) => ({ label: x?.title, risky: 0 })).filter((x) => x.label) },
    { title: "Agents", icon: Bot, items: agents.map((a) => ({ label: a.name, risky: (a.tools ?? []).filter((t) => t?.access === "irreversible").length })) },
    { title: "Data", icon: Database, items: (draft.entities ?? []).map((e) => ({ label: e?.plural ?? e?.name, risky: 0 })).filter((x) => x.label) },
    { title: "Connections", icon: Plug, items: (draft.connections ?? []).map((c) => ({ label: c?.name, risky: 0 })).filter((x) => x.label) },
  ] as { title: string; icon: typeof Blocks; items: { label: string; risky: number }[] }[];
  const risky = agents.flatMap((a) => a.tools ?? []).filter((t) => t?.access === "irreversible").length;
  const phase = !draft.name ? "Reading your brief…" : !draft.entities?.length ? "Deciding what the app needs to remember…" : !draft.agents?.length ? "Choosing outside systems…" : !draft.screens?.length ? "Hiring agents and deciding what each may do…" : done ? "Plan ready." : "Laying out the screens people will use…";
  const working = !done && !error;
  return (
    <div className="relative mx-auto max-w-5xl">
      <div aria-hidden className="pointer-events-none absolute -inset-x-40 -top-40 h-[520px] bg-[radial-gradient(ellipse_at_50%_30%,rgb(245_165_36/0.12),transparent_60%)]" />
      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="micro-label flex items-center gap-2">
            {working && <span className="relative flex size-1.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-amber opacity-70" /><span className="relative inline-flex size-1.5 rounded-full bg-amber" /></span>}
            {eyebrow} · {mode === "live" ? "planning with Claude" : "offline mode · starter plan"}
          </p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.h1 key={draft.name ?? "planning"} initial={{ opacity: 0, y: 12, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8, filter: "blur(6px)" }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-2 font-display text-[44px] leading-tight">
              {draft.name ?? <span className="text-shimmer">Planning…</span>}
            </motion.h1>
          </AnimatePresence>
          <p className={cn("mt-1 text-[14px]", draft.tagline ? "text-muted-foreground" : "text-shimmer")} aria-live="polite">{draft.tagline ?? phase}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[12px] tabular-nums text-muted-foreground">{elapsed}s</p>
          <p className={cn("text-[12px]", working ? "text-shimmer" : "text-faint")}>{done ? "opening the plan…" : phase}</p>
        </div>
      </div>
      {note && <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="relative mt-4 rounded-lg border border-amber/30 bg-amber-soft px-3 py-2 text-[13px]">{note}</motion.p>}
      {error && (
        <div className="relative mt-4 rounded-lg border border-ask/30 bg-ask/10 px-3 py-2 text-[13px] text-ask">
          {error} <button className="underline" onClick={onRetry}>Try again</button>
        </div>
      )}
      <div className={cn("dot-grid relative mt-6 grid gap-6 rounded-2xl border p-6 transition-[border-color,box-shadow] duration-700 md:grid-cols-4", working ? "aurora border-transparent" : done ? "border-read/40 shadow-[0_0_0_1px_rgb(61_214_140/0.25),0_0_70px_-20px_rgb(61_214_140/0.45)]" : "border-hairline")}>
        {working && <span className="scanline" aria-hidden />}
        {cols.map((c, ci) => (
          <div key={c.title} className="relative">
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-foreground/80"><c.icon className="size-3.5 text-muted-foreground" />{c.title}<span className="font-mono text-faint">{c.items.length || ""}</span></p>
            <ul className="mt-3 space-y-2.5">
              <AnimatePresence initial={false}>
                {c.items.map((it, i) => (
                  <motion.li
                    key={`${c.title}-${i}-${it.label}`}
                    layout
                    initial={{ opacity: 0, y: 10, scale: 0.95, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { type: "spring", stiffness: 380, damping: 28 } }}
                    className={cn("panel flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px]", done && "border-read/25")}
                    style={done ? { transitionDelay: `${(ci * 4 + i) * 40}ms` } : undefined}
                  >
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    {it.risky > 0 && <span className="shrink-0 rounded-full border border-ask/30 bg-ask/10 px-1.5 py-px text-[10px] text-ask">{it.risky} asks first</span>}
                  </motion.li>
                ))}
              </AnimatePresence>
              {!done && Array.from({ length: Math.max(1, 3 - c.items.length) }).map((_, i) => <li key={`sk-${i}`} className="shimmer h-10 rounded-lg border border-hairline" />)}
            </ul>
          </div>
        ))}
      </div>
      <div className="relative mt-4 flex flex-wrap items-center gap-4 text-[12.5px] text-muted-foreground">
        {risky > 0 && <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-ask" />{risky} action{risky === 1 ? "" : "s"} can&apos;t be undone — they&apos;ll ask a person first</span>}
        {mode === "live" && working && elapsed > 25 && <span>Careful planning takes about a minute. Everything appears here as it&apos;s decided.</span>}
        {done && <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="inline-flex items-center gap-1.5 text-read"><Check className="size-3.5" />Saved as save point #1</motion.span>}
        {working && <Loader2 className="ml-auto size-4 animate-spin text-amber" />}
      </div>
    </div>
  );
}
