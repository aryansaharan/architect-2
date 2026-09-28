"use client";
import { cn } from "@/lib/utils";

/**
 * An on/off switch drawn on paper: a hairline track that turns brand green when on.
 * A real switch for assistive tech (role="switch", aria-checked), one tab stop, Space or Enter toggles.
 */
export function Switch({ checked, onChange, label, disabled, className }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 ease-paper outline-none focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-brand bg-brand" : "border-hairline-hi bg-deep hover:border-line-strong",
        className,
      )}
    >
      <span aria-hidden className={cn("size-3.5 rounded-full bg-panel shadow-hair transition-transform duration-150 ease-paper", checked ? "translate-x-[18px]" : "translate-x-[2px]")} />
    </button>
  );
}
