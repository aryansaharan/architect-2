"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, GitPullRequest, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildTimeLabel } from "@/lib/blueprint/estimate";
import { plannedRuns } from "@/lib/build/report";
import { PRICE } from "@/lib/prices";
import { useChangeOrderOpen } from "../composer-dock";
import { PencilRadio } from "./pencil-radio";
import { plural, useSheet } from "./use-sheet";

/** "What you asked for": the person's own words, in pencil. Long ones fold to three lines, with a way to read the rest. */
export function BriefNote({ brief, label = "What you asked for" }: { brief: string; label?: string }) {
  const [open, setOpen] = useState(false);
  // Folded only when three lines really can't hold it at this width.
  const [overflows, setOverflows] = useState(false);
  const para = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const text = brief.trim();
  useLayoutEffect(() => {
    const el = para.current;
    if (!el || open) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, text]);
  if (!text) return null;
  const long = overflows || open;
  return (
    <section aria-labelledby={`${id}-h`} className="mt-7">
      <h2 id={`${id}-h`} className="font-sketch text-sketch text-muted-foreground">{label}</h2>
      <p ref={para} id={`${id}-t`} className={`mt-1.5 border-l-2 border-hairline-hi pl-4 font-pencil text-note leading-snug text-foreground/85 ${open ? "" : "line-clamp-3"}`}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-t`}
          onClick={() => setOpen((o) => !o)}
          className="ml-4 mt-1 rounded-sm text-meta font-medium text-brand underline decoration-dotted underline-offset-4 hover:text-brand-hi"
        >
          {open ? "Show less" : "Show all of it"}
        </button>
      )}
    </section>
  );
}

/**
 * The note before the build and the one button. Making it real is free; the test runs are played by Claude,
 * PRICE.testRun each, and the note says so before anything runs, with a way to skip them. Guests, and anyone
 * whose credits don't cover them, are told the test runs will be skipped and why. Pressing Make it real starts
 * the real build with ws.build.start, the same call as the plan map's "Make it real".
 */
export function ReadyNote() {
  const ws = useSheet();
  const bp = ws.blueprint;
  const [starting, setStarting] = useState(false);
  const changeWaiting = useChangeOrderOpen();
  const runs = plannedRuns(bp.agents).length;
  const cost = runs * PRICE.testRun;
  const left = Math.floor(ws.credits.left);
  const why = ws.user.isAnonymous ? "guest" : ws.llm === "offline" ? "offline" : left < cost ? "credits" : null;
  const [play, setPlay] = useState<"yes" | "no">(runs && !why ? "yes" : "no");
  const withTests = runs > 0 && !why && play === "yes";
  const time = buildTimeLabel(withTests ? runs : 0);
  const readyId = useId();

  return (
    <section aria-labelledby={readyId} className="mt-12 border-t border-dashed border-hairline-hi pt-7">
      {/* The heading in pencil; the facts in print. */}
      <h2 id={readyId} className="font-pencil text-section text-foreground">
        Ready when you are
      </h2>
      <p className="mt-2 text-lead text-foreground">
        Prod AI checks the plan and writes and compiles the code, <span className="font-semibold">free</span>
        {withTests ? (
          <>
            . Then Claude plays {plural(runs, "test run")} with your AI helpers, <span className="tabular-nums font-semibold">{cost} credits</span>.
          </>
        ) : (
          "."
        )}{" "}
        It takes <span className="tabular-nums">{time.real}</span>.
      </p>
      {runs > 0 && !why && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-meta text-muted-foreground">Test runs</span>
          <PencilRadio<"yes" | "no">
            label="Play the test runs with Claude"
            value={play}
            onChange={setPlay}
            options={[
              { value: "yes", label: `Play them · ${cost} credits` },
              { value: "no", label: "Skip for now" },
            ]}
          />
        </div>
      )}
      {runs > 0 && why && (
        <p className="mt-2 max-w-[66ch] text-body text-muted-foreground">
          {why === "guest" ? (
            <>
              Its {plural(runs, "test run")} are played by Claude, so they need you signed in ({PRICE.testRun} credits each).{" "}
              <Link href={`/login?next=${encodeURIComponent(`/p/${ws.project.id}`)}`} className="text-brand underline decoration-dotted underline-offset-4 hover:text-brand-hi">
                Sign in
              </Link>{" "}
              for free credits every month, or make it real now without them.
            </>
          ) : why === "offline" ? (
            "Claude isn't available right now, so its test runs will be skipped. Run them later from AI helpers."
          ) : (
            `Its ${plural(runs, "test run")} need ${cost} credits and you have ${left} left, so they'll be skipped. Run them later from AI helpers.`
          )}
        </p>
      )}
      <p className="mt-1 text-body text-muted-foreground">Nothing is built until you press Make it real.</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          size="cta"
          disabled={starting || changeWaiting}
          onClick={async () => {
            setStarting(true);
            await ws.build.start({ tests: withTests });
            setStarting(false);
          }}
        >
          {starting ? "Getting started…" : "Make it real"}
          {!starting && <ArrowRight aria-hidden />}
        </Button>
        <Button variant="ghost" size="lg" className="text-muted-foreground" onClick={() => ws.focusComposer(null)}>
          <NotebookPen aria-hidden /> Change something first
        </Button>
      </div>

      <div className="mt-3 space-y-1 text-meta text-muted-foreground">
        {changeWaiting && <p className="text-foreground">A change note is waiting for your OK in the margin. Decide on it first, then make it real.</p>}
        <p>Stop at any time. If a test run catches a problem, fixing it is free.</p>
      </div>
    </section>
  );
}

/** An imported repo isn't rebuilt: it's mapped as it is, and the first change opens as a pull request. */
export function MappedNote() {
  const ws = useSheet();
  return (
    <section aria-label="Imported project" className="mt-12 border-t border-dashed border-hairline-hi pt-7">
      <h2 className="font-pencil text-section text-foreground">Mapped from your repo. It&apos;s untouched.</h2>
      <p className="mt-2 text-body text-muted-foreground">Nothing was built. There&apos;s nothing to make real: it already is.</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button size="cta" onClick={() => ws.focusComposer(null)}>
          <NotebookPen aria-hidden /> Write your first change note
        </Button>
        <p className="inline-flex items-center gap-1.5 text-meta text-muted-foreground">
          <GitPullRequest className="size-3.5 shrink-0" aria-hidden />
          Write it in the margin. It opens as a pull request on your repo.
        </p>
      </div>
    </section>
  );
}
