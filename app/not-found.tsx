import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main id="main" className="relative grid min-h-screen place-items-center overflow-hidden px-6">
      <div aria-hidden className="solstice-orb left-1/2 top-[-45%] h-[680px] w-[680px] -translate-x-1/2 opacity-[0.24]" />
      <div className="relative max-w-lg text-center">
        <div className="flex justify-center"><Logo /></div>
        <p className="micro-label mt-10">404 · not on the blueprint</p>
        <h1 className="mt-3 font-display text-[48px] leading-[1.05] tracking-tight">This page <em className="text-solstice">isn&apos;t here.</em></h1>
        <p className="mt-3 text-[14px] text-muted-foreground">The link may be old, or the project may belong to another account. Your own projects are one click away.</p>
        <div className="mt-7 flex justify-center gap-2">
          <Button asChild variant="outline"><Link href="/">Overview</Link></Button>
          <Button asChild className="btn-solstice"><Link href="/home">Your projects <ArrowRight /></Link></Button>
        </div>
      </div>
    </main>
  );
}
