import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { AuthPanel } from "@/components/auth/auth-panel";
import { getSessionUser } from "@/lib/auth";

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
        <h1 className="font-display text-[48px] leading-none sm:text-[58px]">{isGuest ? "Keep your work" : "Let's get you started"}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
          {isGuest
            ? "You're trying Prod AI as a guest. Sign in and everything you've made comes with you."
            : "Sign in to keep what you make. Or look around as a guest first, and keep your work later."}
        </p>

        {note && (
          <figure className="sticky-note mt-7 -rotate-[0.6deg] rounded-[3px] px-4 pb-3 pt-2.5">
            <figcaption className="font-sketch text-[11.5px] text-muted-foreground">Your note is safe. You&apos;ll pick up right here:</figcaption>
            <blockquote className="mt-1 line-clamp-3 font-pencil text-[21px] leading-snug text-foreground">{note}</blockquote>
          </figure>
        )}

        {notice && (
          <p role="alert" className="mt-7 rounded-md border border-ask/30 bg-ask/[0.06] px-3 py-2 text-[13px] text-ask">
            {notice}
          </p>
        )}

        <div className="panel mt-7 rounded-2xl p-5 sm:p-6">
          <AuthPanel next={next} guestNext={guestNext} error={notice ? undefined : error} isGuest={isGuest} />
        </div>

        <p className="mt-8 text-center text-[13px] text-muted-foreground">
          <Link href="/" className="underline-offset-4 hover:text-foreground hover:underline">Back to the start</Link>
        </p>
      </div>
    </main>
  );
}
