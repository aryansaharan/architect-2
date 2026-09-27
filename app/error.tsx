"use client";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="min-h-screen">
      <header className="mx-auto flex h-14 max-w-6xl items-center px-5 sm:px-6">
        <Logo />
      </header>
      <div className="mx-auto max-w-md px-5 pb-16 pt-16 text-center sm:pt-24">
        <p className="font-sketch text-[13px] text-muted-foreground">Something went wrong</p>
        <h1 className="mt-3 font-display text-[46px] leading-none sm:text-[54px]">That wasn&apos;t supposed to happen.</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">Nothing you made was lost. Try again, or go back to your projects.</p>
        {error.digest && <p className="mt-3 font-mono text-[11px] text-faint">Reference {error.digest}</p>}
        <div className="mt-8 flex justify-center gap-2">
          <Button variant="outline" className="h-10 bg-panel px-4" onClick={() => reset()}>
            <RotateCcw /> Try again
          </Button>
          <Button asChild className="h-10 px-4">
            <Link href="/home">Your projects</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
