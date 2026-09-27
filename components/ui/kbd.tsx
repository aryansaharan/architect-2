import { cn } from "@/lib/utils";

/** Keyboard key, shadcn-style. */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-1 rounded-[5px] border border-[#d9d3c6] bg-raised px-1 font-mono text-[10.5px] font-medium text-[#55524a] shadow-[inset_0_-1px_0_rgb(26_26_23/0.06)]",
        className,
      )}
      {...props}
    />
  );
}

export function KbdGroup({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="kbd-group" className={cn("inline-flex items-center gap-1", className)} {...props} />;
}
