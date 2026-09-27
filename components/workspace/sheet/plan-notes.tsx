"use client";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, GitPullRequest, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { creditsUsd } from "@/lib/format";
import { buildTimeLabel } from "@/lib/blueprint/estimate";
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
      <h2 id={`${id}-h`} className="font-pencil text-[21px] text-muted-foreground">{label}</h2>
      <p ref={para} id={`${id}-t`} className={`mt-1 border-l-2 border-hairline-hi pl-4 font-pencil text-[23px] leading-[1.25] text-foreground/85 ${open ? "" : "line-clamp-3"}`}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-t`}
          onClick={() => setOpen((o) => !o)}
          className="ml-4 mt-1 rounded-sm text-[12.5px] font-medium text-brand underline decoration-dotted underline-offset-4 hover:text-brand-hi"
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
  // The production estimate and this demo's simulated playback, each said for what it is.
  const time = useMemo(() => buildTimeLabel(est.minutes, totalDuration(buildTimeline(bp))), [bp, est.minutes]);
  const priceId = useId();

  return (
    <section aria-labelledby={priceId} className="mt-12 border-t border-dashed border-hairline-hi pt-7">
      <h2 id={priceId} className="sr-only">Price</h2>
      <div className="paper-lines rounded-[3px] px-1 sm:px-3">
        {/* Written on the ruled lines: each line of text sits on one 32px rule. */}
        <p className="font-pencil text-[25px] leading-[32px] text-foreground">
          Making it real: <span className="whitespace-nowrap">about {est.credits} credits (≈ {creditsUsd(est.credits)}) ·</span>{" "}
          <span className="whitespace-nowrap">{time.here},</span> <span className="whitespace-nowrap">{time.real}</span>
        </p>
        <p className="font-pencil text-[22px] leading-[32px] text-muted-foreground">Nothing is built until you press Make it real.</p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          className="h-11 rounded-lg px-5 text-[15px]"
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
        <Button variant="ghost" className="h-11 px-3 text-[14px] text-muted-foreground" onClick={() => ws.focusComposer(null)}>
          <NotebookPen aria-hidden /> Change something first
        </Button>
      </div>

      <div className="mt-3 space-y-1 text-[12.5px] text-muted-foreground">
        {changeWaiting && <p className="text-foreground">A change note is waiting for your OK in the margin. Decide on it first, then make it real.</p>}
        {over ? (
          <p className="text-ask">
            This would go past your monthly cap ({Math.round(remaining)} of {ws.usage.cap} credits left).{" "}
            <Link href="/settings" className="underline underline-offset-4">Raise it in Settings</Link> first.
          </p>
        ) : (
          <p>Stop at any time and the credits come back. If something breaks on our side, fixing it is free. {Math.round(remaining)} of your {ws.usage.cap} credits left this month.</p>
        )}
        <details className="group">
          <summary className="w-fit cursor-pointer rounded-sm underline decoration-dotted underline-offset-4 hover:text-foreground">Where the price comes from</summary>
          <ul className="mt-2 max-w-[340px] space-y-1 font-sketch text-[12.5px] text-foreground/80">
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
      <div className="paper-lines rounded-[3px] px-1 sm:px-3">
        <p className="font-pencil text-[27px] leading-[32px] text-foreground">Mapped from your repo. It&apos;s untouched.</p>
        <p className="font-pencil text-[22px] leading-[32px] text-muted-foreground">Nothing was built or charged. There&apos;s nothing to make real: it already is.</p>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button size="lg" className="h-11 rounded-lg px-5 text-[15px]" onClick={() => ws.focusComposer(null)}>
          <NotebookPen aria-hidden /> Write your first change note
        </Button>
        <p className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <GitPullRequest className="size-3.5 shrink-0" aria-hidden />
          Write it in the margin. It opens as a pull request on your repo.
        </p>
      </div>
    </section>
  );
}
