import Link from "next/link";
import { cn } from "@/lib/utils";

/** The mark: a W drawn as a firefly's light trail, its head glowing on the swarm's rhythm. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5 overflow-visible", className)} aria-hidden>
      <defs>
        <linearGradient id="ww-trail" x1="3" y1="12" x2="21" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3fe0c5" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#8dff9e" />
          <stop offset="1" stopColor="#dfff4f" />
        </linearGradient>
        <radialGradient id="ww-head">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset="0.35" stopColor="#dfff4f" />
          <stop offset="1" stopColor="#dfff4f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path
        className="logo-trail"
        pathLength={1}
        d="M3.2 6.6C4.6 12.6 6 17.6 8 17.6c1.9 0 2.6-6.5 4-6.5s2.1 6.5 4 6.5c1.8 0 2.9-4.7 4.2-9.9"
        fill="none"
        stroke="url(#ww-trail)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle className="logo-head" cx="20.4" cy="6.4" r="4.2" fill="url(#ww-head)" />
      <circle cx="20.4" cy="6.4" r="1.25" fill="#fffbe0" />
    </svg>
  );
}

export function Logo({ href = "/", className, compact }: { href?: string; className?: string; compact?: boolean }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-amber/60", className)} aria-label="Wonderwork home">
      <LogoMark />
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight text-foreground">Wonderwork</span>
      )}
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
