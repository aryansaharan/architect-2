"use client";
import { useRef } from "react";
import { cn } from "@/lib/utils";

export type PencilOption<T extends string> = { value: T; label: React.ReactNode; title?: string; ariaLabel?: string };

/**
 * A small choice of a few options (device, playback speed), drawn like pencil tabs on paper.
 * One tab stop for the group; arrow keys move between options, as a radio group should.
 */
export function PencilRadio<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: PencilOption<T>[];
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const at = Math.max(0, options.findIndex((o) => o.value === value));
  const move = (i: number) => {
    const n = (i + options.length) % options.length;
    onChange(options[n].value);
    refs.current[n]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex items-center gap-0.5 rounded-md border border-hairline bg-panel p-0.5", className)}>
      {options.map((o, i) => {
        const active = i === at;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.ariaLabel}
            title={o.title}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i + 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i - 1);
              }
            }}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 text-[12.5px] font-medium transition-colors duration-150",
              active ? "bg-amber-soft text-amber ring-1 ring-amber/30" : "text-muted-foreground hover:bg-deep hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
