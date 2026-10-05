import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { AuthPanel } from "@/components/auth/auth-panel";
import { getSessionUser } from "@/lib/auth";
import motion from "@/components/motion/entry-motion.module.css";

export const metadata = { title: "Sign in" };

/**
 * Where to go after signing in: a path on this site, or null. Parsed the way a browser would, so
 * "//evil.com" and "/\evil.com" (both another site to a browser) are refused. Same rule as app/start.
 */
function safe(v: unknown): string | null {
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return null;
  try {
    const url = new URL(v, "http://x");
    return url.origin === "http://x" ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}

/** Notices from the guest and demo rate limits (app/start, app/demo). Sign-in errors are AuthPanel's. */
const NOTICES: Record<string, string> = {
  busy: "Too many new guest sessions from your network. Sign in with Google or email instead.",
  demo_busy: "Too many example projects were opened from your network in the last hour. Sign in with Google or email, or continue as a guest and start your own.",
};

/** The note someone wrote on the landing page, if that's where they came from. */
function noteFrom(next: string): string | null {
  if (!next.startsWith("/new?")) return null;
  const prompt = new URLSearchParams(next.slice(next.indexOf("?") + 1)).get("prompt")?.trim();
  return prompt ? prompt.slice(0, 280) : null;
}

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const asked = safe(sp.next);
  const next = asked ?? "/home";
  // Guests start with a blank sheet unless they were on their way somewhere.
  const guestNext = asked ?? "/new";
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const notice = error ? NOTICES[error] : undefined;
  const user = await getSessionUser();
  if (user && !user.isAnonymous && !error) redirect(next);
  const isGuest = Boolean(user?.isAnonymous);
  const note = noteFrom(next);

  return (
    <main id="main" className="min-h-screen">
      <header className="mx-auto flex h-14 max-w-6xl items-center px-5 sm:px-6">
        <Logo />
      </header>
      <div className="mx-auto w-full max-w-md px-5 pb-16 pt-8 sm:pt-14">
        <h1 className="font-pencil text-title">{isGuest ? "Keep your work" : "Let's get you started"}</h1>
        <p className="mt-3 text-lead text-muted-foreground">
          {isGuest
            ? "You're trying Prod AI as a guest. Sign in and everything you've made comes with you, and Claude plans your next app from your own words."
            : "Sign in and Claude plans your app from your own words, and everything you make is kept."}
        </p>

        {note && (
          // The note from the landing page, placed here with a small settle: it came with you.
          <figure className={`sticky-note mt-6 -rotate-[0.6deg] px-4 pb-3 pt-2.5 ${motion.notePlaced}`}>
            <figcaption className="text-meta text-muted-foreground">Your note is safe. You&apos;ll pick up right here:</figcaption>
            <blockquote className="mt-1 line-clamp-3 font-pencil text-note leading-tight text-foreground">{note}</blockquote>
          </figure>
        )}

        {notice && (
          <p role="alert" className="mt-6 flex gap-2 rounded-md border border-hairline-hi bg-panel px-3 py-2.5 text-body text-foreground">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {notice}
          </p>
        )}

        <div className="panel mt-6 rounded-md p-5 sm:p-6">
          <AuthPanel next={next} guestNext={guestNext} error={notice ? undefined : error} isGuest={isGuest} />
        </div>

        <p className="mt-6 text-center text-ui text-muted-foreground">
          <Link href="/" className="inline-flex min-h-9 items-center transition-colors duration-150 hover:text-foreground">Back to the start</Link>
        </p>
      </div>
    </main>
  );
}
