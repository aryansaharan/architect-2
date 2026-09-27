"use client";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSheet } from "./use-sheet";

/** Nothing sketched yet: point to the one place to start, the margin. */
export function EmptySheet() {
  const ws = useSheet();
  return (
    <div className="py-10 text-center">
      <p className="font-display text-[44px] leading-none text-foreground">A blank sheet</p>
      <p className="mx-auto mt-3 max-w-[46ch] font-pencil text-[22px] leading-snug text-muted-foreground">
        Write what you want in the margin, in your own words, and Prod AI will sketch it here.
      </p>
      <Button size="lg" className="mt-6 h-11 rounded-lg px-5 text-[15px]" onClick={() => ws.focusComposer(null)}>
        <NotebookPen aria-hidden /> Write in the margin
      </Button>
    </div>
  );
}
