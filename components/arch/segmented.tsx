"use client";
import { useId } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = { value: T; label: React.ReactNode; title?: string };

/** Segmented control with a thumb that springs between options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
  size?: "xs" | "sm";
  className?: string;
  ariaLabel: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex items-center rounded-lg border border-hairline bg-deep p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-200",
              size === "xs" ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-[12.5px]",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                aria-hidden
                className="absolute inset-0 rounded-md bg-raised shadow-[0_1px_2px_rgb(26_26_23/0.08)] ring-1 ring-hairline-hi"
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
              />
            )}
            <span className="relative z-[1] inline-flex items-center gap-1.5">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
