"use client";
import { useState } from "react";
import { ChevronUp, FastForward, Loader2, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/arch/segmented";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";

export function BuildConsole() {
  const ws = useWorkspace();
  const b = ws.build;
  const [logs, setLogs] = useState(false);
  const steps = b.steps.filter((s) => s.kind === "step");
  const done = b.completed.length;
  const cur = b.current?.kind === "step" ? b.current : null;
  const finishing = b.status === "finishing";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-5">
      <section aria-label="Build progress" aria-live="polite" className="panel-raised pointer-events-auto w-full max-w-[860px] overflow-hidden rounded-2xl">
        <div className="h-1 bg-deep">
          <div className="h-full bg-amber transition-[width] duration-500 ease-out" style={{ width: `${Math.round(b.progress * 100)}%` }} />
        </div>
        <div className="flex items-center gap-4 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-amber/30 bg-amber-soft">
            <Loader2 className="size-4 animate-spin text-amber" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="micro-label">{b.mode === "replay" ? "Replay · nothing is charged" : finishing ? "Saving" : b.status === "repair" ? "Paused — waiting for you" : `Step ${Math.min(done + 1, steps.length)} of ${steps.length}`}</p>
            <p className="mt-0.5 truncate text-[14px] font-medium">{finishing ? "Saving the build as a save point…" : b.status === "repair" ? "Architect caught a problem" : cur?.title ?? "Working…"}</p>
            {cur?.detail && !finishing && <p className="truncate text-[12px] text-muted-foreground">{cur.detail}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Segmented<string>
              ariaLabel="Speed"
              size="xs"
              value={String(b.speed)}
              onChange={(v) => b.setSpeed(Number(v))}
              options={[
                { value: "1", label: "1×" },
                { value: "4", label: "4×" },
                { value: "12", label: <><FastForward className="size-3" />Skip</> },
              ]}
            />
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setLogs((l) => !l)} aria-expanded={logs}>
              <Terminal /> {logs ? "Hide" : "Show"} what it&apos;s doing <ChevronUp className={cn("transition-transform", !logs && "rotate-180")} />
            </Button>
          </div>
        </div>
        {logs && (
          <div className="code-face max-h-48 overflow-y-auto border-t border-hairline px-4 py-3 text-[11.5px] leading-relaxed">
            {b.completed.slice(-6).map((s) => (
              <div key={s.id} className="text-foreground/60">
                <span className="text-read">✓</span> {s.title}
                {s.file && <span className="text-faint"> · {s.file}</span>}
              </div>
            ))}
            {cur && (
              <div className="mt-1">
                <span className="text-amber">›</span> {cur.title}
                {cur.file && <span className="text-faint"> · {cur.file}</span>}
                {cur.logs?.map((l, i) => (
                  <div key={i} className="pl-4 text-foreground/50">{l}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
