"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        {typeof eyebrow === "string" ? <p className="font-sketch text-sketch text-muted-foreground">{eyebrow}</p> : eyebrow}
        <p className="text-meta text-faint sm:ml-auto">{mode === "live" ? "Sketching with Claude" : "Starting from a ready-made sketch"}</p>
      </div>
      <h1 className="mt-4 font-pencil text-title">{draft.name ?? <span className="text-faint">Sketching…</span>}</h1>
      <p className="mt-3 min-h-[1.55em] text-lead text-muted-foreground">{draft.tagline ?? ""}</p>

      {note && (
        <p className="mt-4 flex max-w-2xl gap-2 rounded-md border border-hairline bg-panel px-3 py-2.5 text-body text-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          {note}
        </p>
      )}
      {error && (
        <div role="alert" className="mt-4 flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-hairline-hi bg-panel px-3 py-2 text-body text-foreground">
          <p className="flex min-w-0 flex-1 gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}

      <div className="dot-grid mt-6 grid gap-8 rounded-md border border-hairline p-5 sm:p-7 lg:grid-cols-[1fr_250px]">
        <section aria-label="Screens">
          <Label title="Screens" count={screens.length} />
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:gap-4">
            {screens.map((x, i) => (
              <li key={`${i}-${x.title}`} className="sketch fade-up min-w-0 bg-panel/70 px-3 pb-2.5 pt-2.5 sm:px-4 sm:pb-3 sm:pt-3">
                <p className="truncate font-sketch text-sketch text-foreground">{x.title}</p>
                <Wireframe layout={layoutOf(x.kind, i)} seed={i + 3} className="mt-2 block h-auto w-full" />
              </li>
            ))}
            {working &&
              Array.from({ length: Math.max(1, 4 - screens.length) }).map((_, i) => (
                <li key={`empty-${i}`} className="sketch-soft grid min-h-[100px] place-items-center sm:min-h-[150px]" aria-hidden>
                  {i === 0 && <span className="font-pencil text-note leading-tight text-faint">{screens.length ? "and…" : "screens go here"}</span>}
                </li>
              ))}
          </ul>
        </section>

        <aside aria-label="AI helpers and data" className="space-y-7">
          <section>
            <Label title="AI helpers" count={helpers.length} />
            <ul className="mt-3 space-y-3">
              {helpers.map((h, i) => (
                <li key={`${i}-${h.name}`} className={cn("sticky-note fade-up px-3.5 pb-2.5 pt-1.5", TILT[i % TILT.length])}>
                  <p className="font-pencil text-note leading-tight text-foreground">{h.name}</p>
                  {h.role && <p className="mt-0.5 line-clamp-2 text-meta text-muted-foreground">{h.role}</p>}
                  {h.risky > 0 && <p className="mt-1 text-meta text-ask">Asks first before {h.risky} {h.risky === 1 ? "thing" : "things"} it can&apos;t undo</p>}
                </li>
              ))}
              {working && helpers.length === 0 && <li className="sketch-soft h-16" aria-hidden />}
            </ul>
          </section>
          <PencilList title="Remembers" items={remembers} working={working} />
          <PencilList title="Connects to" items={connects} working={working} />
        </aside>
      </div>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <p className={cn("font-pencil text-note leading-tight", done ? "text-brand" : "text-foreground")} aria-live="polite">
          {phase}
        </p>
        <span className="text-meta tabular-nums text-faint">{elapsed}s</span>
        {done && <span className="text-meta text-muted-foreground">Saved as version 1.</span>}
      </div>
      <div className="mt-1.5 space-y-1 text-body text-muted-foreground">
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

/** A sketch label with its count beside it: the label in lettering, the figure in print. */
function Label({ title, count }: { title: string; count: number }) {
  return (
    <h2 className="flex items-baseline gap-1.5 font-sketch text-sketch text-muted-foreground">
      {title}
      {count > 0 && <span className="font-sans text-meta tabular-nums text-faint">{count}</span>}
    </h2>
  );
}

function PencilList({ title, items, working }: { title: string; items: string[]; working: boolean }) {
  return (
    <section>
      <Label title={title} count={0} />
      {items.length ? (
        <ul className="mt-1.5 space-y-0.5">
          {items.map((x) => (
            <li key={x} className="fade-up font-pencil text-note leading-tight text-foreground">
              {x}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 font-pencil text-note leading-tight text-faint">{working ? "…" : "Nothing"}</p>
      )}
    </section>
  );
}
