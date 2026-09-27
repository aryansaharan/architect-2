import type { Block, Screen } from "@/lib/blueprint/schema";
import { cn } from "@/lib/utils";

/** A pencil wireframe of a block: graphite marks on paper, the app's own colour for its buttons. */
function Shape({ b, large }: { b: Block; large?: boolean }) {
  const bar = "rounded-[2px] bg-foreground/[0.18]";
  const faint = "rounded-[2px] bg-foreground/[0.08]";
  switch (b.type) {
    case "kpis":
      return (
        <div className="flex gap-1">
          {b.items.slice(0, 4).map((_, i) => (
            <div key={i} className={cn("flex-1 rounded-[3px] border border-foreground/[0.14] p-1", large && "p-1.5")}>
              <div className={cn(faint, "h-1 w-2/3")} />
              <div className={cn(bar, "mt-1 h-1.5 w-1/2")} />
            </div>
          ))}
        </div>
      );
    case "table":
      return (
        <div className="rounded-[3px] border border-foreground/[0.14] p-1">
          <div className={cn("h-1.5 w-full rounded-[2px] bg-foreground/[0.12]")} />
          {Array.from({ length: large ? 5 : 3 }).map((_, i) => (
            <div key={i} className="mt-1 flex gap-1">
              <div className={cn(bar, "h-1 w-1/4")} />
              <div className={cn(faint, "h-1 flex-1")} />
              <div className={cn(faint, "h-1 w-1/6")} />
            </div>
          ))}
        </div>
      );
    case "list":
      return (
        <div className="space-y-1 rounded-[3px] border border-foreground/[0.14] p-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="size-1.5 rounded-full bg-foreground/25" />
              <div className={cn(bar, "h-1 w-1/3")} />
              <div className={cn(faint, "ml-auto h-1 w-1/6")} />
            </div>
          ))}
        </div>
      );
    case "detail":
      return (
        <div className="grid grid-cols-2 gap-1 rounded-[3px] border border-foreground/[0.14] p-1">
          {Array.from({ length: large ? 6 : 4 }).map((_, i) => (
            <div key={i}>
              <div className={cn(faint, "h-0.5 w-1/2")} />
              <div className={cn(bar, "mt-0.5 h-1 w-3/4")} />
            </div>
          ))}
        </div>
      );
    case "form":
      return (
        <div className="space-y-1 rounded-[3px] border border-foreground/[0.14] p-1">
          {Array.from({ length: large ? 4 : 3 }).map((_, i) => (
            <div key={i} className="h-1.5 rounded-[2px] border border-foreground/[0.14]" />
          ))}
          <div className="h-1.5 w-1/3 rounded-[2px]" style={{ background: "var(--thumb-primary, var(--brand))" }} />
        </div>
      );
    case "chat":
      return (
        <div className="space-y-1 rounded-[3px] border border-foreground/[0.14] p-1">
          <div className={cn(faint, "h-1.5 w-2/3")} />
          <div className="ml-auto h-1.5 w-1/2 rounded-[2px]" style={{ background: "var(--thumb-primary, var(--brand))", opacity: 0.55 }} />
          <div className={cn(faint, "h-1.5 w-3/5")} />
        </div>
      );
    case "timeline":
      return (
        <div className="space-y-1 rounded-[3px] border border-foreground/[0.14] p-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className={cn("size-1.5 rounded-full", i === 0 ? "bg-foreground/45" : "bg-foreground/15")} />
              <div className={cn(faint, "h-1 flex-1")} />
            </div>
          ))}
        </div>
      );
    case "text":
      return (
        <div className="space-y-0.5 p-0.5">
          <div className={cn(bar, "h-1 w-1/2")} />
          <div className={cn(faint, "h-0.5 w-full")} />
          <div className={cn(faint, "h-0.5 w-5/6")} />
        </div>
      );
    case "actions":
      return (
        <div className="flex gap-1">
          <div className="h-1.5 w-1/4 rounded-[2px]" style={{ background: "var(--thumb-primary, var(--brand))" }} />
          <div className="h-1.5 w-1/4 rounded-[2px] border border-foreground/20" />
        </div>
      );
  }
}

export function ScreenThumb({ screen, large, primary }: { screen: Screen; large?: boolean; primary?: string }) {
  const side = screen.regions.side ?? [];
  const style = primary ? ({ "--thumb-primary": primary } as React.CSSProperties) : undefined;
  if (screen.layout === "form") {
    return (
      <div className="flex gap-1.5" style={style}>
        <div className="mx-auto w-3/5 space-y-1">{screen.regions.main.map((b) => <Shape key={b.id} b={b} large={large} />)}</div>
        {side.length > 0 && <div className="w-1/4 space-y-1">{side.map((b) => <Shape key={b.id} b={b} large={large} />)}</div>}
      </div>
    );
  }
  return (
    <div className="flex gap-1.5" style={style}>
      <div className="min-w-0 flex-1 space-y-1">{screen.regions.main.map((b) => <Shape key={b.id} b={b} large={large} />)}</div>
      {side.length > 0 && <div className={cn("space-y-1", screen.layout === "split" ? "w-[38%]" : "w-[32%]")}>{side.map((b) => <Shape key={b.id} b={b} large={large} />)}</div>}
    </div>
  );
}
