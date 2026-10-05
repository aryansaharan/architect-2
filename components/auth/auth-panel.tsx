"use client";
import { useState } from "react";
import { ArrowRight, CircleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoogleMark } from "@/components/brand/logo";

const ERRORS: Record<string, string> = {
  auth: "That sign-in link didn't work. Try again, or continue as a guest.",
  oauth: "Google sent you back without signing you in. Try again.",
  identity_exists: "That account already exists. Sign in with it directly. Your guest work stays in the guest session.",
  demo: "We couldn't start a guest session just now. Try again in a moment.",
  setup: "Sign-in isn't switched on for this copy of Prod AI yet.",
  provider: "That way of signing in isn't switched on here yet. Try another, or continue as a guest.",
};

/** Supabase's own error text, said plainly: the common cases by name, anything else without internals. */
function authError(raw: string): string {
  // The built-in email sender allows only a few sign-in emails an hour across the whole site.
  if (/rate limit|too many|security purposes/i.test(raw)) return "Email sign-in is busy right now. Continue with Google, or try the email link again later.";
  if (/invalid.*email|email.*invalid|unable to validate email/i.test(raw)) return "That email address doesn't look right. Check it and try again.";
  if (/signups? not allowed|disabled/i.test(raw)) return "New sign-ups are paused for a moment. Continue as a guest, or try again later.";
  console.error("sign-in failed:", raw);
  return "Sign-in didn't go through. Try again, or continue as a guest.";
}

function Or({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3 text-meta text-faint">
      <span className="h-px flex-1 bg-hairline" /> {children} <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}

export function AuthPanel({ next, guestNext, error, isGuest }: { next: string; guestNext: string; error?: string; isGuest: boolean }) {
  const [pending, setPending] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(error ? (ERRORS[error] ?? ERRORS.auth) : null);
  // Guests normally link a provider to keep their work. If that account already exists
  // (or they choose to), sign in to it instead; the guest project stays with the guest session.
  const [linking, setLinking] = useState(isGuest && error !== "identity_exists");

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function oauth(provider: "google" | "github") {
    setPending(provider);
    setMessage(null);
    const supabase = createClient();
    const { error } = linking
      ? await supabase.auth.linkIdentity({ provider, options: { redirectTo: redirectTo() } })
      : await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } });
    if (error) {
      setPending(null);
      setMessage(/not enabled|unsupported/i.test(error.message) ? ERRORS.provider : authError(error.message));
    }
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setPending("email");
    setMessage(null);
    const supabase = createClient();
    if (linking) {
      const { data, error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: redirectTo() });
      if (error) {
        setPending(null);
        setMessage(authError(error.message));
        return;
      }
      // Where email confirmations are off, the address is confirmed on the spot and no email is sent: the guest
      // is already a member, with all their work. Refresh the session (it still says "guest") and carry on.
      const u = data.user;
      const confirmed = Boolean(u?.email_confirmed_at) && !u?.new_email && u?.email?.toLowerCase() === email.trim().toLowerCase();
      if (confirmed) {
        setPending("member");
        await supabase.auth.refreshSession();
        // A full navigation, so every page is drawn again for a member.
        window.location.assign(next);
        return;
      }
      setPending(null);
      setSent(true);
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    setPending(null);
    if (error) setMessage(authError(error.message));
    else setSent(true);
  }

  return (
    <div className="w-full">
      {/* Signing in is what this page is for, and what lets Claude plan from your own words. */}
      <Button size="cta" className="w-full" onClick={() => oauth("google")} disabled={!!pending}>
        <span className="grid size-6 place-items-center rounded-full bg-raised" aria-hidden>
          <GoogleMark />
        </span>
        {pending === "google" ? "Opening Google…" : linking ? "Keep this work with Google" : "Continue with Google"}
      </Button>
      {isGuest && (
        <button
          type="button"
          onClick={() => {
            setLinking((l) => !l);
            setMessage(null);
          }}
          className="mt-1.5 min-h-9 w-full text-center text-meta text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-foreground"
        >
          {linking ? "Already have an account? Sign in to it instead" : "Keep this guest work instead"}
        </button>
      )}

      <Or>or get a sign-in link by email</Or>

      {sent ? (
        <div role="status" className="fade-up rounded-md border border-hairline bg-canvas p-4 text-body">
          <p className="font-pencil text-note leading-tight">Check your inbox</p>
          <p className="mt-2 text-muted-foreground">We sent a sign-in link to {email}. It works once and expires in an hour.</p>
        </div>
      ) : (
        <form onSubmit={magicLink} className="flex gap-2">
          <label htmlFor="email" className="sr-only">Your email</label>
          <Input id="email" type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" autoComplete="email" />
          <Button type="submit" size="lg" variant="outline" className="shrink-0" disabled={!!pending}>
            {pending === "email" ? "Sending…" : pending === "member" ? "Signing you in…" : "Email me a link"}
          </Button>
        </form>
      )}

      {message && (
        <p role="alert" className="mt-4 flex gap-2 rounded-md border border-hairline-hi bg-canvas px-3 py-2.5 text-body text-foreground">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {message}
        </p>
      )}

      <Or>or</Or>

      {/* A full navigation: /start sets the guest session cookie, then sends you on. */}
      <Button asChild size="lg" variant="outline" className="w-full">
        <a href={`/start?next=${encodeURIComponent(guestNext)}`}>
          {isGuest ? "Carry on as a guest" : "Continue as a guest"} <ArrowRight />
        </a>
      </Button>
      <p className="mt-2.5 text-center text-meta text-muted-foreground">
        {isGuest ? "Everything you've made so far is still there. Guests start from the closest starter plan." : "No account needed. Guests start from the closest starter plan instead of their own words. Sign in any time to keep your work."}
      </p>
    </div>
  );
}
