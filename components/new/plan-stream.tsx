"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Wireframe } from "@/components/landing/sketches";
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


/** The screen kinds the planner uses, drawn as the nearest wireframe. Offline plans have no kind, so they vary by position. */
const LAYOUT: Record<string, string> = { queue: "single", dashboard: "dashboard", report: "dashboard", detail: "split", assistant: "split", form: "form" };
const layoutOf = (kind: string | undefined, i: number) => (kind && LAYOUT[kind]) || ["dashboard", "split", "single", "form"][i % 4];

const TILT = ["-rotate-[1.2deg]", "rotate-[0.8deg]", "-rotate-[0.4deg]"];

/** The plan as a sketch forming: screens drawn in pencil, AI helpers on sticky notes, a pencil line saying what's happening. */
export function PlanningView({ s, eyebrow, onRetry }: { s: ReturnType<typeof usePlanStream>; eyebrow: React.ReactNode; onRetry: () => void }) {
  const { draft, mode, note, error, elapsed, done } = s;
  const screens = (draft.screens ?? []).filter((x) => x?.title);
  const helpers = (draft.agents ?? []).filter((a) => a?.name).map((a) => ({ name: a.name!, role: a.role, risky: (a.tools ?? []).filter((t) => t?.access === "irreversible").length }));
  const remembers = (draft.entities ?? []).map((e) => e?.plural ?? e?.name).filter((x): x is string => Boolean(x));
  const connects = (draft.connections ?? []).map((c) => c?.name).filter((x): x is string => Boolean(x));
  const risky = helpers.reduce((n, h) => n + h.risky, 0);
  const working = !done && !error;
  const phase = error
    ? "The pencil slipped."
    : done
      ? "Sketch ready. Opening your sheet…"
      : !draft.name
        ? "Reading your note…"
        : !draft.entities?.length
          ? "Working out what it needs to remember…"
          : !draft.agents?.length
            ? "Choosing what it connects to…"
            : !draft.screens?.length
              ? "Adding AI helpers, and what each may do…"
              : "Drawing the screens people will use…";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {typeof eyebrow === "string" ? <p className="font-sketch text-[12.5px] text-muted-foreground">{eyebrow}</p> : eyebrow}
        <p className="font-sketch text-[12px] text-faint sm:ml-auto">{mode === "live" ? "Sketching with Claude" : "Offline, so starting from a ready-made sketch"}</p>
      </div>
      <h1 className="mt-4 font-display text-[46px] leading-none sm:text-[60px]">{draft.name ?? <span className="text-faint">Sketching…</span>}</h1>
      <p className="mt-3 min-h-[1.5em] text-[15px] leading-relaxed text-muted-foreground">{draft.tagline ?? ""}</p>

      {note && <p className="sticky-note mt-5 inline-block rounded-[3px] px-3 py-2 text-[13.5px]">{note}</p>}
      {error && (
        <p role="alert" className="mt-5 rounded-lg border border-ask/30 bg-ask/[0.06] px-3 py-2 text-[13.5px] text-ask">
          {error}{" "}
          <button className="font-medium underline underline-offset-2" onClick={onRetry}>
            Try again
          </button>
        </p>
      )}

      <div className="dot-grid mt-6 grid gap-8 rounded-2xl border border-hairline p-5 sm:p-7 lg:grid-cols-[1fr_250px]">
        <section aria-label="Screens">
          <h2 className="font-sketch text-[12.5px] text-muted-foreground">Screens{screens.length ? ` · ${screens.length}` : ""}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:gap-4">
            {screens.map((x, i) => (
              <li key={`${i}-${x.title}`} className="sketch fade-up min-w-0 bg-panel/70 px-3 pb-2.5 pt-2.5 sm:px-4 sm:pb-3 sm:pt-3">
                <p className="truncate font-sketch text-[13px] text-foreground sm:text-[14px]">{x.title}</p>
                <Wireframe layout={layoutOf(x.kind, i)} seed={i + 3} className="mt-2 block h-auto w-full" />
              </li>
            ))}
            {working &&
              Array.from({ length: Math.max(1, 4 - screens.length) }).map((_, i) => (
                <li key={`empty-${i}`} className="sketch-soft grid min-h-[100px] place-items-center sm:min-h-[150px]" aria-hidden>
                  {i === 0 && <span className="font-pencil text-[19px] text-faint">{screens.length ? "and…" : "screens go here"}</span>}
                </li>
              ))}
          </ul>
        </section>

        <aside aria-label="AI helpers and data" className="space-y-7">
          <section>
            <h2 className="font-sketch text-[12.5px] text-muted-foreground">AI helpers{helpers.length ? ` · ${helpers.length}` : ""}</h2>
            <ul className="mt-3 space-y-3">
              {helpers.map((h, i) => (
                <li key={`${i}-${h.name}`} className={cn("sticky-note fade-up rounded-[3px] px-3.5 pb-2.5 pt-1.5", TILT[i % TILT.length])}>
                  <p className="font-pencil text-[22px] leading-tight text-foreground">{h.name}</p>
                  {h.role && <p className="line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">{h.role}</p>}
                  {h.risky > 0 && <p className="mt-1 text-[12px] text-ask">Asks first before {h.risky} {h.risky === 1 ? "thing" : "things"} it can&apos;t undo</p>}
                </li>
              ))}
              {working && helpers.length === 0 && <li className="sketch-soft h-16 rounded-[3px]" aria-hidden />}
            </ul>
          </section>
          <PencilList title="Remembers" items={remembers} working={working} />
          <PencilList title="Connects to" items={connects} working={working} />
        </aside>
      </div>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <p className={cn("font-pencil text-[24px] leading-tight", done ? "text-brand" : "text-foreground")} aria-live="polite">
          {phase}
        </p>
        <span className="font-mono text-[12px] tabular-nums text-faint">{elapsed}s</span>
        {done && <span className="text-[13px] text-muted-foreground">Saved as your first save point.</span>}
      </div>
      <div className="mt-1.5 space-y-1 text-[13px] text-muted-foreground">
        {risky > 0 && (
          <p>
            {risky} {risky === 1 ? "action" : "actions"} can&apos;t be undone, so {risky === 1 ? "it asks" : "they ask"} a person first.
          </p>
        )}
        {mode === "live" && working && elapsed > 25 && <p>Careful sketching takes about a minute. Everything appears here as it&apos;s decided.</p>}
      </div>
    </div>
  );
}

function PencilList({ title, items, working }: { title: string; items: string[]; working: boolean }) {
  return (
    <section>
      <h2 className="font-sketch text-[12.5px] text-muted-foreground">{title}</h2>
      {items.length ? (
        <ul className="mt-1.5 space-y-0.5">
          {items.map((x) => (
            <li key={x} className="fade-up font-pencil text-[20px] leading-snug text-foreground">
              {x}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 font-pencil text-[20px] text-faint">{working ? "…" : "Nothing"}</p>
      )}
    </section>
  );
}
