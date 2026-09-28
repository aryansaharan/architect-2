import { cn } from "@/lib/utils";

/**
 * The one pill: a short status or count. Tones follow docs/DESIGN.md: read, change, ask and fix
 * mean access and repair only; ok is success and live; brand is the current selection.
 */
export type PillTone = "neutral" | "brand" | "ok" | "read" | "change" | "ask" | "fix";

const TONE: Record<PillTone, string> = {
  neutral: "border-hairline-hi bg-panel text-muted-foreground",
  brand: "border-brand/30 bg-brand-soft text-brand",
  ok: "border-ok/30 bg-brand-soft text-ok",
  read: "border-read/30 bg-read/10 text-read",
  change: "border-change/30 bg-change/10 text-change",
  ask: "border-ask/30 bg-ask/10 text-ask",
  fix: "border-fix/30 bg-fix/10 text-fix",
};

export function Pill({ tone = "neutral", size = "sm", dot, className, children }: { tone?: PillTone; size?: "sm" | "md"; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-medium", size === "sm" ? "h-5 px-2 text-badge" : "h-6 px-2.5 text-meta", TONE[tone], className)}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
