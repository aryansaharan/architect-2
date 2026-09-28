"use client";
import Link from "next/link";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="min-h-screen">
      <header className="mx-auto flex h-14 max-w-6xl items-center px-5 sm:px-6">
        <Logo />
      </header>
      <div className="mx-auto max-w-md px-5 pb-16 pt-16 text-center sm:pt-24">
        <p className="inline-flex items-center gap-1.5 text-ui font-medium text-foreground">
          <CircleAlert className="size-4" aria-hidden />
          Something went wrong
        </p>
        <h1 className="mt-3 font-pencil text-title">That wasn&apos;t supposed to happen.</h1>
        <p className="mt-3 text-lead text-muted-foreground">Nothing you made was lost. Try again, or go back to your projects.</p>
        {error.digest && <p className="mt-3 text-meta text-faint">Reference <span className="font-mono text-badge">{error.digest}</span></p>}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Button variant="outline" size="cta" onClick={() => reset()}>
            <RotateCcw /> Try again
          </Button>
          <Button asChild size="cta">
            <Link href="/home">Your projects</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
