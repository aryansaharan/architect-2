import { cn } from "@/lib/utils";
import type { AgentTool } from "@/lib/blueprint/schema";
import type { Blame, BuildState } from "@/lib/db/types";

export function StatusBadge({ state, live }: { state: BuildState; live?: boolean }) {
  const map = {
    draft: { label: "Plan", cls: "border-hairline text-muted-foreground" },
    building: { label: "Building…", cls: "border-amber/40 text-amber" },
    built: { label: "Built", cls: "border-read/30 text-read" },
  } as const;
  const s = live && state === "built" ? { label: "Live", cls: "border-read/40 bg-read/10 text-read" } : map[state];
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-medium", s.cls)}>
      {(live && state === "built") || state === "building" ? <span className={cn("size-1.5 rounded-full", state === "building" ? "bg-amber pulse-ring" : "bg-read pulse-read")} /> : null}
      {s.label}
    </span>
  );
}

export const ACCESS_STYLE: Record<AgentTool["access"], { dot: string; text: string; border: string; bg: string; label: string }> = {
  read: { dot: "bg-read", text: "text-read", border: "border-read/30", bg: "bg-read/10", label: "Read" },
  write: { dot: "bg-change", text: "text-change", border: "border-change/30", bg: "bg-change/10", label: "Change" },
  irreversible: { dot: "bg-ask", text: "text-ask", border: "border-ask/30", bg: "bg-ask/10", label: "Can't undo" },
};

export function AccessChip({ access, children, className }: { access: AgentTool["access"]; children?: React.ReactNode; className?: string }) {
  const s = ACCESS_STYLE[access];
  return (
    <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium", s.border, s.bg, s.text, className)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {children ?? s.label}
    </span>
  );
}

export function BlameBadge({ blame, credits }: { blame: Blame; credits: number }) {
  if (blame === "system_fix")
    return <span className="inline-flex h-5 items-center rounded-full border border-fix/30 bg-fix/10 px-2 text-[11px] font-medium text-fix">Our fix · free</span>;
  if (blame === "teammate")
    return <span className="inline-flex h-5 items-center rounded-full border border-change/30 bg-change/10 px-2 text-[11px] font-medium text-change">Teammate</span>;
  if (blame === "agent")
    return <span className="inline-flex h-5 items-center rounded-full border border-hairline px-2 text-[11px] font-medium text-muted-foreground">Agent · {fmt(credits)}</span>;
  return <span className="inline-flex h-5 items-center rounded-full border border-hairline px-2 text-[11px] font-medium text-muted-foreground">{credits > 0 ? `Your request · ${fmt(credits)}` : "Your request · free"}</span>;
}

function fmt(n: number) {
  const v = Math.round(n * 10) / 10;
  return `${Number.isInteger(v) ? v : v.toFixed(1)} cr`;
}

export function Avatar({ name, hue, size = 28, className }: { name: string; hue: number; size?: number; className?: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-lg font-semibold", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        // A soft tint of the person's hue with ink-dark letters: readable on paper.
        background: `hsl(${hue} 42% 93%)`,
        color: `hsl(${hue} 45% 30%)`,
        boxShadow: `inset 0 0 0 1px hsl(${hue} 30% 62% / 0.35)`,
      }}
    >
      {letters}
    </span>
  );
}
