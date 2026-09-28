"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
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
  if (/rate limit|too many|security purposes/i.test(raw)) return "Too many sign-in emails just now. Wait a minute, then try again.";
  if (/invalid.*email|email.*invalid|unable to validate email/i.test(raw)) return "That email address doesn't look right. Check it and try again.";
  if (/signups? not allowed|disabled/i.test(raw)) return "New sign-ups are paused for a moment. Continue as a guest, or try again later.";
  console.error("sign-in failed:", raw);
  return "Sign-in didn't go through. Try again, or continue as a guest.";
}

function Or({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3 font-sketch text-[12px] text-faint">
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
    const { error } = linking
      ? await supabase.auth.updateUser({ email }, { emailRedirectTo: redirectTo() })
      : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    setPending(null);
    if (error) setMessage(authError(error.message));
    else setSent(true);
  }

  return (
    <div className="w-full">
      <Button variant="outline" size="lg" className="h-11 w-full justify-center gap-2.5 bg-panel text-[14px]" onClick={() => oauth("google")} disabled={!!pending}>
        <GoogleMark />
        {pending === "google" ? "Opening Google…" : linking ? "Keep this work with Google" : "Continue with Google"}
      </Button>
      {isGuest && (
        <button
          type="button"
          onClick={() => {
            setLinking((l) => !l);
            setMessage(null);
          }}
          className="mt-2.5 w-full text-center text-[12.5px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {linking ? "Already have an account? Sign in to it instead" : "Keep this guest work instead"}
        </button>
      )}

      <Or>or get a sign-in link by email</Or>

      {sent ? (
        <div role="status" className="rounded-lg border border-hairline bg-canvas p-4 text-[14px]">
          <p className="font-pencil text-[22px] leading-none">Check your inbox</p>
          <p className="mt-2 text-muted-foreground">We sent a sign-in link to {email}. It works once and expires in an hour.</p>
        </div>
      ) : (
        <form onSubmit={magicLink} className="flex gap-2">
          <label htmlFor="email" className="sr-only">Your email</label>
          <Input id="email" type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 bg-panel" autoComplete="email" />
          <Button type="submit" size="lg" variant="outline" className="h-11 shrink-0 bg-panel px-3.5" disabled={!!pending}>
            {pending === "email" ? "Sending…" : "Email me a link"}
          </Button>
        </form>
      )}

      {message && (
        <p role="alert" className="mt-4 rounded-md border border-ask/30 bg-ask/[0.06] px-3 py-2 text-[13px] text-ask">
          {message}
        </p>
      )}

      <Or>or</Or>

      {/* A full navigation: /start sets the guest session cookie, then sends you on. */}
      <Button asChild size="lg" className="h-11 w-full text-[14px]">
        <a href={`/start?next=${encodeURIComponent(guestNext)}`}>
          {isGuest ? "Carry on as a guest" : "Continue as a guest"} <ArrowRight />
        </a>
      </Button>
      <p className="mt-2.5 text-center text-[12.5px] text-muted-foreground">
        {isGuest ? "Everything you've made so far is still there." : "No account needed. Sign in later to keep your work."}
      </p>
    </div>
  );
}
