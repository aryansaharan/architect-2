"use client";
import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EXAMPLES } from "./examples";

const TILT = ["-rotate-[1.5deg]", "rotate-[1deg]", "-rotate-[0.5deg]", "rotate-[1.5deg]"];

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
  minLength = 1,
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
    <div className={cn("panel rounded-2xl", className)}>
      <div className="px-5 pt-4 sm:px-8 sm:pt-6">
        <label htmlFor={id} className={showLabel ? "font-pencil text-[30px] leading-none text-foreground sm:text-[34px]" : "sr-only"}>
          {label}
        </label>
        <textarea
          id={id}
          ref={box}
          rows={rows}
          autoFocus={autoFocus}
          value={value}
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
          className={cn("paper-lines block w-full resize-none bg-transparent pt-[7px] font-pencil text-[23px] text-foreground outline-none placeholder:text-faint sm:text-[25px]", showLabel ? "mt-2" : "mt-0")}
        />
        {tooShort && (
          <p role="status" className="pb-1 text-[13px] text-muted-foreground">
            A little more, please. One sentence about who it&apos;s for and what it should do is plenty.
          </p>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2.5 border-t border-dashed border-hairline-hi px-5 py-4 sm:px-8">
        {examples && (
          <>
            <span className="w-full font-sketch text-[12px] text-faint sm:w-auto">Or start from</span>
            {EXAMPLES.map((ex, i) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => {
                  onChange(ex.prompt);
                  setTooShort(false);
                  box.current?.focus();
                }}
                className={cn(
                  "sticky-note rounded-[3px] px-2.5 pb-1 pt-0.5 font-pencil text-[19px] leading-tight text-foreground transition-transform duration-200 hover:rotate-0",
                  TILT[i % TILT.length],
                  value === ex.prompt && "outline outline-1 outline-brand/50",
                )}
              >
                {ex.label}
              </button>
            ))}
          </>
        )}
        <Button className="ml-auto h-10 px-4 text-[14px]" onClick={submit}>
          {submitLabel} <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
