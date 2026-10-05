"use client";
import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import motion from "@/components/motion/entry-motion.module.css";
import { cn } from "@/lib/utils";
import { MAX_BRIEF, MIN_BRIEF } from "./brief-limits";
import { EXAMPLES } from "./examples";

const TILT = ["-rotate-[1.5deg]", "rotate-[1deg]", "-rotate-[0.5deg]", "rotate-[1.5deg]"];

/** The counter appears this close to the most a note can hold. */
const COUNT_FROM = MAX_BRIEF - 200;

/**
 * The place you write: a sheet of ruled paper, your words in pencil, a few example
 * notes to start from, and one button. Used on the landing page, Home and New project.
 */
export function WritingSheet({
  id,
  value,
  onChange,
  onSubmit,
  label = "What do you want to make?",
  showLabel = true,
  submitLabel = "Make it",
  minLength = MIN_BRIEF,
  rows = 4,
  autoFocus,
  examples = true,
  placeholder = "A place where refund requests come in, get checked against the order, and wait for me before any money goes back.",
  className,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  label?: string;
  showLabel?: boolean;
  submitLabel?: string;
  minLength?: number;
  rows?: number;
  autoFocus?: boolean;
  examples?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [tooShort, setTooShort] = useState(false);
  const counting = value.length >= COUNT_FROM;

  const submit = () => {
    const text = value.trim();
    if (text.length < minLength) {
      setTooShort(text.length > 0);
      box.current?.focus();
      return;
    }
    onSubmit(text);
  };

  return (
    <div className={cn("panel rounded-md", className)}>
      <div className="px-5 pt-4 sm:px-8 sm:pt-6">
        <label htmlFor={id} className={showLabel ? "font-pencil text-section text-foreground" : "sr-only"}>
          {label}
        </label>
        <textarea
          id={id}
          ref={box}
          rows={rows}
          autoFocus={autoFocus}
          value={value}
          maxLength={MAX_BRIEF}
          aria-describedby={counting ? `${id}-count` : undefined}
          onChange={(e) => {
            onChange(e.target.value);
            if (tooShort) setTooShort(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          // The ruled lines darken a touch while you write (motion.rules): the sheet is yours.
          className={cn("paper-lines block w-full resize-none bg-transparent pt-[7px] font-pencil text-note leading-8 text-foreground outline-none placeholder:text-faint", motion.rules, showLabel ? "mt-2" : "mt-0")}
        />
        {tooShort && (
          <p role="status" className="pb-1 text-meta text-muted-foreground">
            A little more, please. One sentence about who it&apos;s for and what it should do is plenty.
          </p>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2.5 border-t border-dashed border-hairline-hi px-5 py-4 sm:px-8">
        {examples && (
          <>
            <span className="w-full font-sketch text-sketch text-faint sm:w-auto">Or start from</span>
            {EXAMPLES.map((ex, i) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => {
                  onChange(ex.prompt);
                  setTooShort(false);
                  box.current?.focus();
                }}
                aria-pressed={value === ex.prompt}
                className={cn(
                  // A note settles straight under your hand, and presses down when picked. It never lifts.
                  "sticky-note min-h-9 px-2.5 py-1 font-pencil text-note leading-tight text-foreground transition-transform duration-150 ease-paper hover:rotate-0 active:translate-y-px",
                  TILT[i % TILT.length],
                  value === ex.prompt && "ring-1 ring-brand/30",
                )}
              >
                {ex.label}
              </button>
            ))}
          </>
        )}
        <div className="ml-auto flex items-center gap-3">
          {/* Quiet until the note nears the most the planner reads. */}
          {counting && (
            <span id={`${id}-count`} className={cn("text-meta tabular-nums", value.length >= MAX_BRIEF ? "text-muted-foreground" : "text-faint")}>
              <span className="sr-only">Characters used: </span>
              {value.length.toLocaleString("en-US")} / {MAX_BRIEF.toLocaleString("en-US")}
            </span>
          )}
          <Button size="cta" onClick={submit}>
            {submitLabel} <ArrowRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
