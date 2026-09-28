import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { roughLine, roughRect } from "@/components/landing/sketches";

export const metadata: Metadata = { title: "Page not found" };

/** An empty page, drawn in pencil with a dog-eared corner. */
function BlankPage() {
  return (
    <svg viewBox="0 0 120 140" className="mx-auto h-auto w-24" aria-hidden>
      <rect x="14" y="10" width="90" height="120" fill="var(--panel)" />
      <path d={roughRect(14, 10, 90, 120, 4)} fill="none" stroke="var(--graphite)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M84 10 L104 30 L84 30 Z" fill="var(--canvas)" />
      <path d={roughLine(84, 10, 84, 30, 6, 0.5) + roughLine(84, 30, 104, 30, 7, 0.5) + roughLine(84, 10, 104, 30, 8, 0.5)} fill="none" stroke="var(--graphite)" strokeWidth="1.3" strokeLinecap="round" />
      {[52, 68, 84, 100].map((y, i) => (
        <path key={y} d={roughLine(26, y, 92, y, 20 + i, 0.4)} fill="none" stroke="rgb(44 98 201 / 0.22)" strokeWidth="0.9" />
      ))}
    </svg>
  );
}

export default function NotFound() {
  return (
    <main id="main" className="min-h-screen">
      <header className="mx-auto flex h-14 max-w-6xl items-center px-5 sm:px-6">
        <Logo />
      </header>
      <div className="mx-auto max-w-lg px-5 pb-16 pt-14 text-center sm:pt-20">
        <BlankPage />
        <p className="mt-8 font-sketch text-sketch text-muted-foreground">Page not found</p>
        <h1 className="mt-2 font-pencil text-title">
          This page <em>isn&apos;t here.</em>
        </h1>
        <p className="mt-3 text-lead text-muted-foreground">The link may be old, or the project may belong to another account. Your own projects are one click away.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline" size="cta">
            <Link href="/">Back to the start</Link>
          </Button>
          <Button asChild size="cta">
            <Link href="/home">
              Your projects <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
