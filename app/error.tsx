"use client";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="relative grid min-h-screen place-items-center overflow-hidden px-6">
      <div aria-hidden className="solstice-orb left-1/2 top-[-40%] h-[620px] w-[620px] -translate-x-1/2 opacity-[0.2]" />
      <div className="panel relative max-w-md rounded-2xl p-7 text-center">
        <p className="micro-label text-ask">Something went wrong</p>
        <h1 className="mt-2 font-display text-[34px] leading-tight">That wasn&apos;t supposed to happen.</h1>
        <p className="mt-2 text-[13.5px] text-muted-foreground">Nothing you built was lost. Try again, or head back to your projects.</p>
        {error.digest && <p className="mt-3 font-mono text-[11px] text-faint">Reference {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" onClick={() => reset()}><RotateCcw /> Try again</Button>
          <Button asChild><Link href="/home">Your projects</Link></Button>
        </div>
      </div>
    </main>
  );
}
