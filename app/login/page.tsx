import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { AuthPanel } from "@/components/auth/auth-panel";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

const safe = (v: unknown): string | null => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : null);

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

        <div className="panel mt-7 rounded-2xl p-5 sm:p-6">
          <AuthPanel next={next} guestNext={guestNext} error={error} isGuest={isGuest} />
        </div>

        <p className="mt-8 text-center text-[13px] text-muted-foreground">
          <Link href="/" className="underline-offset-4 hover:text-foreground hover:underline">Back to the start</Link>
        </p>
      </div>
    </main>
  );
}
