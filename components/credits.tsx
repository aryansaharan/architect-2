import { PRICE_LIST, type CreditMeter } from "@/lib/prices";
import { cn } from "@/lib/utils";

/** "240 of 300 credits": what a signed-in person has used of this month's free credits. */
export function meterWords(m: CreditMeter): string {
  return `${Math.round(m.used)} of ${m.allowance} credits`;
}

/** How much of this month's credits is used, as a thin bar. */
export function MeterBar({ m, className }: { m: CreditMeter; className?: string }) {
  const pct = m.allowance ? Math.min(1, m.used / m.allowance) : 0;
  return (
    <div aria-hidden className={cn("h-1.5 overflow-hidden rounded-full bg-deep", className)}>
      <div className={cn("h-full rounded-full", pct > 0.9 ? "bg-foreground/70" : "bg-brand")} style={{ width: `${Math.max(2, pct * 100)}%` }} />
    </div>
  );
}

/** What costs credits and what's free: the same list wherever prices are explained. */
export function PriceList({ className }: { className?: string }) {
  return (
    <div className={className}>
      <ul className="space-y-1 text-ui">
        {PRICE_LIST.map((p) => (
          <li key={p.what} className="flex justify-between gap-4 border-b border-dashed border-hairline pb-1">
            <span>{p.what}</span>
            <span className="shrink-0 tabular-nums">{p.credits} credits</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-meta text-muted-foreground">
        Free: making it real, publishing, quotes, rule-based changes, starter plans and scripted answers. A call that fails is never charged. On your published app, visitors&apos; messages use your credits.
      </p>
    </div>
  );
}
