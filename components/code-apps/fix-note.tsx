"use client";
import { useEffect, useId, useRef } from "react";
import { motion } from "motion/react";
import { NotebookPen, RotateCcw, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DUR, EASE } from "@/lib/motion";
import type { CodeFile } from "@/lib/code-apps/schema";
import { codeLine, plainError, whereWords, type FixError } from "./plain-error";
import { MAX_REPAIRS } from "./use-code-run";

const reduce = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Something in the code didn't work: the real error (where, what, in plain words, and the line itself when
 * it's handy) and "Fix it (free)". After three fixes in a row that didn't take, it says so and asks the
 * person to describe what they want instead.
 */
export function FixNote({
  errors,
  source,
  files,
  repairs,
  repairing,
  problem,
  onRepair,
  onRestart,
  onNote,
}: {
  errors: FixError[];
  source: "build" | "start" | "runtime" | null;
  files: CodeFile[] | undefined;
  repairs: number;
  repairing: boolean;
  problem: string | null;
  onRepair: () => void;
  /** The app didn't start in time: try starting the same build again. */
  onRestart?: () => void;
  onNote: () => void;
}) {
  const id = useId();
  const box = useRef<HTMLElement>(null);
  const fixBtn = useRef<HTMLButtonElement>(null);
  const stuck = repairs >= MAX_REPAIRS;
  const first = errors[0];
  const key = `${first?.message ?? ""}|${first?.file ?? ""}`;

  // Bring the note into view once per error, and hand the keyboard to the fix.
  useEffect(() => {
    if (!key) return;
    box.current?.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "nearest" });
    fixBtn.current?.focus({ preventScroll: true });
  }, [key]);

  const title = source === "build" ? "It didn't build" : source === "start" ? "It didn't start" : "It hit an error while running";
  const eyebrow = source === "runtime" ? "Caught while you tried it · fixing it is free" : "Caught before you saw it · fixing it is free";
  const shown = errors.slice(0, 3);

  return (
    <motion.section
      ref={box}
      role="alert"
      aria-labelledby={`${id}-t`}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: DUR.panel, ease: EASE }}
      className="sketch mt-6 scroll-mt-6 border-fix/70 bg-panel p-5 sm:p-6"
    >
      <p className="font-sketch text-sketch text-fix">{eyebrow}</p>
      <h2 id={`${id}-t`} className="mt-1 font-pencil text-section text-foreground">
        {title}
      </h2>

      <ul className="mt-3 space-y-4">
        {shown.map((e, i) => {
          const plain = plainError(e.message);
          const where = whereWords(e);
          const line = codeLine(files, e);
          return (
            <li key={i} className="min-w-0">
              <p className="text-body text-foreground">{plain}</p>
              {where && <p className="mt-0.5 font-mono text-badge text-muted-foreground">{where}</p>}
              {line && (
                <pre className="code-face mt-1.5 overflow-x-auto rounded-md border border-hairline px-2.5 py-1.5 text-code text-foreground">
                  {e.line ? <span className="mr-3 select-none tabular-nums text-faint">{e.line}</span> : null}
                  {line}
                </pre>
              )}
              {plain !== e.message.trim() && <p className="mt-1 break-words font-mono text-badge text-faint">{e.message.slice(0, 300)}</p>}
            </li>
          );
        })}
      </ul>
      {errors.length > shown.length && <p className="mt-3 text-meta text-muted-foreground">And {errors.length - shown.length} more like it. A fix looks at all of them.</p>}

      {problem && <p className="mt-4 text-meta text-foreground">{problem}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-dashed border-hairline pt-4">
        {stuck ? (
          <>
            <p className="min-w-0 flex-1 basis-64 text-body text-foreground">
              Prod AI has tried {MAX_REPAIRS} fixes in a row and it still breaks. Describe what you want it to do in a note, in your own words, and Claude starts from that.
            </p>
            <Button size="lg" onClick={onNote}>
              <NotebookPen aria-hidden /> Write a note
            </Button>
          </>
        ) : (
          <>
            <Button ref={fixBtn} size="lg" disabled={repairing} onClick={onRepair}>
              <Wrench aria-hidden /> {repairing ? "Fixing it…" : "Fix it"}
              {!repairing && <span className="font-normal opacity-80">· free</span>}
            </Button>
            <p className="min-w-0 flex-1 basis-56 text-meta text-muted-foreground">
              Claude reads the error and the files, fixes them and saves a new version. Free, never charged. Then it builds again.
              {repairs > 0 ? ` Fix ${repairs + 1} of ${MAX_REPAIRS}.` : ""}
            </p>
          </>
        )}
        {/* It only took too long (a slow network, say): starting it again may be all it needs. */}
        {source === "start" && first?.source === "start" && onRestart && !repairing && (
          <Button variant="ghost" className="text-muted-foreground" onClick={onRestart}>
            <RotateCcw aria-hidden /> Try starting it again
          </Button>
        )}
      </div>
    </motion.section>
  );
}
