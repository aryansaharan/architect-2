"use client";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, GitPullRequest, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { creditsUsd } from "@/lib/format";
import { simulatedDuration } from "@/lib/blueprint/estimate";
import { buildTimeline, totalDuration } from "@/lib/sim/buildTimeline";
import { useChangeOrderOpen } from "../composer-dock";
import { useSheet } from "./use-sheet";

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
 * The price note and the one button. Pressing Make it real starts the build with
 * ws.build.start, the same call as the plan map's "Make it real", so the charge, refunds and resume all work the same.
 */
export function PriceNote() {
  const ws = useSheet();
  const bp = ws.blueprint;
  const est = bp.estimate;
  const [starting, setStarting] = useState(false);
  const changeWaiting = useChangeOrderOpen();
  const remaining = Math.max(0, ws.usage.cap - ws.usage.credits);
  const over = est.credits > remaining;
  // How long you'll wait here. That the build is a visual is said once, on the build itself.
  const wait = useMemo(() => simulatedDuration(totalDuration(buildTimeline(bp))), [bp]);
  const priceId = useId();

  return (
    <section aria-labelledby={priceId} className="mt-12 border-t border-dashed border-hairline-hi pt-7">
      {/* The heading in pencil; the price in print, so the figures read as figures. */}
      <h2 id={priceId} className="font-pencil text-section text-foreground">
        Ready when you are
      </h2>
      <p className="mt-2 text-lead text-foreground">
        Making it real costs <span className="font-semibold tabular-nums">about {est.credits} credits</span>{" "}
        <span className="tabular-nums text-muted-foreground">(≈ {creditsUsd(est.credits)})</span> and takes <span className="tabular-nums">about {wait}</span>.
      </p>
      <p className="mt-0.5 text-body text-muted-foreground">Nothing is built until you press Make it real.</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          size="cta"
          disabled={starting || over || changeWaiting}
          onClick={async () => {
            setStarting(true);
            await ws.build.start();
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

      <div className="mt-3 space-y-1 text-meta tabular-nums text-muted-foreground">
        {changeWaiting && <p className="text-foreground">A change note is waiting for your OK in the margin. Decide on it first, then make it real.</p>}
        {over ? (
          // Going past the cap can be undone (raise it), so this is ink with an icon, not rose.
          <p className="flex items-start gap-1.5 text-foreground">
            <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              This would go past your monthly cap ({Math.round(remaining)} of {ws.usage.cap} credits left).{" "}
              <Link href="/settings#usage" className="text-brand underline decoration-dotted underline-offset-4 hover:text-brand-hi">
                Raise it in Settings
              </Link>{" "}
              first.
            </span>
          </p>
        ) : (
          <p>Stop at any time and the credits come back. If something breaks on our side, fixing it is free. {Math.round(remaining)} of your {ws.usage.cap} credits left this month.</p>
        )}
        <details className="group">
          <summary className="w-fit cursor-pointer rounded-sm underline decoration-dotted underline-offset-4 hover:text-foreground">Where the price comes from</summary>
          <ul className="mt-2 max-w-[340px] space-y-1 text-meta tabular-nums text-foreground/80">
            {est.breakdown.map((b) => (
              <li key={b.label} className="flex justify-between gap-6 border-b border-dashed border-hairline pb-1">
                <span>{b.label.replace(/\bagents\b/, "AI helpers").replace(/\bapproval gates\b/, "ask-first steps")}</span>
                <span>{b.credits} credits</span>
              </li>
            ))}
          </ul>
        </details>
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
      <p className="mt-2 text-body text-muted-foreground">Nothing was built or charged. There&apos;s nothing to make real: it already is.</p>
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
