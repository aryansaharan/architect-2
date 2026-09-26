"use client";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A tab failed to render. The rest of the studio keeps working. */
export default function TabError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="panel max-w-md rounded-2xl p-6 text-center">
        <p className="micro-label text-ask">This view hit a problem</p>
        <p className="mt-2 text-[15px] font-medium">Nothing in your project was changed.</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Your plan, save points and activity are safe. Try loading this view again, or go back to the Blueprint.</p>
        {error.digest && <p className="mt-3 font-mono text-[11px] text-faint">Reference {error.digest}</p>}
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" onClick={() => reset()}><RotateCcw /> Try again</Button>
          <Button asChild><Link href="./blueprint">Open the Blueprint</Link></Button>
        </div>
      </div>
    </div>
  );
}
