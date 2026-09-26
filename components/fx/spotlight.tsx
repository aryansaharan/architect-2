"use client";
import { useRef } from "react";
import { cn } from "@/lib/utils";

/** A surface that catches a soft warm light where the cursor is. */
export function Spotlight({ children, className, as: Tag = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "li" | "section" }) {
  const ref = useRef<HTMLElement>(null);
  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={cn("spotlight", className)}
      onMouseMove={(e: React.MouseEvent<HTMLElement>) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </Tag>
  );
}
