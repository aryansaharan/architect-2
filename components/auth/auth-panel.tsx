"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Mail, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GitHubMark, GoogleMark } from "@/components/brand/logo";

const ERRORS: Record<string, string> = {
  auth: "That sign-in link didn't work. Try again, or use the demo.",
  oauth: "The provider sent us back without signing you in. Try again.",
  identity_exists: "That account already exists. Sign in with it directly — your guest project stays in the guest session.",
  demo: "We couldn't start a guest session just now. Try again in a moment.",
  setup: "Sign-in isn't configured on this deployment yet.",
  provider: "That sign-in method isn't switched on for this deployment yet. Try another, or use the demo.",
};

export function AuthPanel({ next, error, isGuest }: { next: string; error?: string; isGuest: boolean }) {
  const [pending, setPending] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(error ? (ERRORS[error] ?? ERRORS.auth) : null);

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function oauth(provider: "google" | "github") {
    setPending(provider);
    setMessage(null);
    const supabase = createClient();
    const { error } = isGuest
      ? await supabase.auth.linkIdentity({ provider, options: { redirectTo: redirectTo() } })
      : await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } });
    if (error) {
      setPending(null);
      setMessage(/not enabled|unsupported/i.test(error.message) ? ERRORS.provider : error.message);
    }
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setPending("email");
    setMessage(null);
    const supabase = createClient();
    const { error } = isGuest
      ? await supabase.auth.updateUser({ email }, { emailRedirectTo: redirectTo() })
      : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    setPending(null);
    if (error) setMessage(error.message);
    else setSent(true);
  }

  return (
    <div className="w-full max-w-sm">
      <div className="space-y-2.5">
        <Button variant="outline" size="lg" className="h-11 w-full justify-center gap-2.5 text-[14px]" onClick={() => oauth("google")} disabled={!!pending}>
          {pending === "google" ? <Loader2 className="animate-spin" /> : <GoogleMark />}
          {isGuest ? "Keep this work — continue with Google" : "Continue with Google"}
        </Button>
        <Button variant="outline" size="lg" className="h-11 w-full justify-center gap-2.5 text-[14px]" onClick={() => oauth("github")} disabled={!!pending}>
          {pending === "github" ? <Loader2 className="animate-spin" /> : <GitHubMark />}
          Continue with GitHub
        </Button>
      </div>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-hairline" /> or get a sign-in link <span className="h-px flex-1 bg-hairline" />
      </div>

      {sent ? (
        <div role="status" className="panel rounded-lg p-4 text-sm">
          <p className="font-medium">Check your inbox</p>
          <p className="mt-1 text-muted-foreground">We sent a sign-in link to {email}. It works once and expires in an hour.</p>
        </div>
      ) : (
        <form onSubmit={magicLink} className="flex gap-2">
          <label htmlFor="email" className="sr-only">Work email</label>
          <Input id="email" type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" autoComplete="email" />
          <Button type="submit" size="lg" variant="secondary" className="h-11 px-3" disabled={!!pending} aria-label="Email me a sign-in link">
            {pending === "email" ? <Loader2 className="animate-spin" /> : <Mail />}
          </Button>
        </form>
      )}

      {message && (
        <p role="alert" className="mt-4 rounded-md border border-ask/30 bg-ask/10 px-3 py-2 text-[13px] text-ask">
          {message}
        </p>
      )}

      {!isGuest && (
        <div className="mt-8 rounded-xl border border-amber/25 bg-amber-soft p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground"><Sparkles className="size-4 text-amber" /> Just looking?</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Open a finished project with real data, no account needed. You can keep it later.</p>
          <Button asChild className="mt-3 w-full" size="lg">
            <Link href="/demo">Try the demo — no account <ArrowRight /></Link>
          </Button>
        </div>
      )}
    </div>
  );
}
