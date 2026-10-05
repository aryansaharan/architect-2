import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The mark: a quick pencil circle, the one people draw around what they want, with a drop of ink
 * at its centre where it becomes real. The circle redraws once on hover (.logo-trail).
 */
const LOOP = "M22.9 7.9C19.4 5.2 12.2 5.9 8.9 9.8 5.8 13.5 6.8 20.6 11.1 23.4c4.4 2.9 11.5 1.6 13.9-2.7 2.2-3.9.8-9.1-3.6-11.4-1.9-1-4.4-1.4-6.7-.9";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="4 3 25 25" className={cn("size-5 overflow-visible", className)} aria-hidden>
      <path className="logo-trail" pathLength={1} d={LOOP} fill="none" stroke="var(--brand)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16.4" cy="16" r="2.8" fill="var(--foreground)" />
    </svg>
  );
}

/**
 * The name as it's written: "prod", its o drawn as the pencil circle around a drop of ink, and a small
 * "AI". Sized by the font size you give it (a brand asset, so its sizes sit outside the type scale).
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline font-bold leading-none tracking-[-0.03em] text-foreground", className)}>
      <span aria-hidden className="inline-flex items-baseline">
        pr
        <svg viewBox="5 4 23 23" className="mx-[-0.01em] size-[0.6em] translate-y-[0.11em] overflow-visible">
          <path className="logo-trail" pathLength={1} d={LOOP} fill="none" stroke="var(--brand)" strokeWidth="2.9" strokeLinecap="round" />
          <circle cx="16.4" cy="16" r="2.7" fill="currentColor" />
        </svg>
        d
      </span>
      <span aria-hidden className="ml-[0.28em] inline-block -translate-y-[1.15em] text-[0.4em] tracking-[0.08em] text-brand">
        AI
      </span>
      <span className="sr-only">Prod AI</span>
    </span>
  );
}

export function Logo({ href = "/", className, compact }: { href?: string; className?: string; compact?: boolean }) {
  return (
    <Link href={href} className={cn("group inline-flex min-h-9 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand/60", className)} aria-label="Prod AI home">
      {compact ? <LogoMark className="size-6" /> : <Wordmark className="text-[24px]" />}
    </Link>
  );
}

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4", className)} fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4", className)} aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" />
    </svg>
  );
}
