import { cn } from "@/lib/utils";

/** Keyboard key, shadcn-style. */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-1 rounded-[5px] border border-hairline-hi bg-deep px-1 font-mono text-[10.5px] font-medium text-muted-foreground shadow-[inset_0_-1px_0_rgb(255_255_255/0.04)]",
        className,
      )}
      {...props}
    />
  );
}

export function KbdGroup({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="kbd-group" className={cn("inline-flex items-center gap-1", className)} {...props} />;
}
