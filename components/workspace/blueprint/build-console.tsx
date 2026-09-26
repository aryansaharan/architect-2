"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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
      <motion.section
        aria-label="Build progress"
        aria-live="polite"
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="aurora panel-raised pointer-events-auto w-full max-w-[860px] rounded-2xl"
      >
        <div className="h-1 overflow-hidden rounded-t-2xl bg-deep">
          <motion.div className="bg-solstice relative h-full shadow-[0_0_16px_rgb(141_255_158/0.8)]" animate={{ width: `${Math.round(b.progress * 100)}%` }} transition={{ type: "spring", stiffness: 90, damping: 20 }}>
            <span className="shimmer absolute inset-0" />
          </motion.div>
        </div>
        <div className="flex items-center gap-4 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-amber/30 bg-amber-soft">
            <Loader2 className="size-4 animate-spin text-amber" />
          </span>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <p className="micro-label">{b.mode === "replay" ? "Replay · nothing is charged" : finishing ? "Saving" : b.status === "repair" ? "Paused · waiting for you" : `Step ${Math.min(done + 1, steps.length)} of ${steps.length}`}</p>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={finishing ? "finishing" : b.status === "repair" ? "repair" : (cur?.id ?? "working")}
                initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -14, filter: "blur(4px)" }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="mt-0.5 truncate text-[14px] font-medium">{finishing ? "Saving the build as a save point…" : b.status === "repair" ? "Wonderwork caught a problem" : cur?.title ?? "Working…"}</p>
                {cur?.detail && !finishing && <p className="truncate text-[12px] text-muted-foreground">{cur.detail}</p>}
              </motion.div>
            </AnimatePresence>
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
          <div className="code-face max-h-48 overflow-y-auto rounded-b-2xl border-t border-hairline px-4 py-3 text-[11.5px] leading-relaxed">
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
      </motion.section>
    </div>
  );
}
