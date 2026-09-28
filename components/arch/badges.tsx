import { cn } from "@/lib/utils";
import type { AgentTool } from "@/lib/blueprint/schema";

export const ACCESS_STYLE: Record<AgentTool["access"], { dot: string; text: string; border: string; bg: string; label: string }> = {
  read: { dot: "bg-read", text: "text-read", border: "border-read/30", bg: "bg-read/10", label: "Read" },
  write: { dot: "bg-change", text: "text-change", border: "border-change/30", bg: "bg-change/10", label: "Change" },
  irreversible: { dot: "bg-ask", text: "text-ask", border: "border-ask/30", bg: "bg-ask/10", label: "Can't undo" },
};

export function AccessChip({ access, children, className }: { access: AgentTool["access"]; children?: React.ReactNode; className?: string }) {
  const s = ACCESS_STYLE[access];
  return (
    <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-badge font-medium", s.border, s.bg, s.text, className)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {children ?? s.label}
    </span>
  );
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
