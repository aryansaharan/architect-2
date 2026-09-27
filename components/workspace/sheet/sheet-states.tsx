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
      <Button size="lg" className="btn-solstice mt-6 h-11 rounded-lg px-5 text-[15px]" onClick={() => ws.focusComposer(null)}>
        <NotebookPen aria-hidden /> Write in the margin
      </Button>
    </div>
  );
}

/**
 * While the sheet loads: the same sheet of paper, with its parts outlined in faint dashed pencil.
 * Still, on purpose: nothing shimmers or pulses. Needs no workspace, so a route's loading.tsx can render it.
 */
export function SheetSkeleton() {
  return (
    <div className="h-full min-h-0 overflow-hidden bg-canvas" aria-busy="true" aria-label="Loading your sheet">
      <div className="mx-auto w-full max-w-[980px] px-2.5 py-5 sm:px-6 sm:py-9">
        <div className="panel rounded-[6px] px-4 py-7 sm:px-10 sm:py-10">
          <p className="font-pencil text-[22px] text-muted-foreground">Getting your sheet…</p>
          <div aria-hidden className="mt-3 h-11 w-2/3 max-w-[420px] rounded-[4px] border border-dashed border-hairline-hi" />
          <div aria-hidden className="mt-3 h-4 w-1/2 max-w-[360px] rounded-[3px] border border-dashed border-hairline" />
          <div aria-hidden className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="sketch-soft p-3.5">
                <div className="h-3.5 w-1/2 rounded-[2px] border border-dashed border-hairline" />
                <div className="mt-3 aspect-[16/10] rounded-[3px] border border-dashed border-hairline" />
                <div className="mt-3 h-3 w-4/5 rounded-[2px] border border-dashed border-hairline" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
