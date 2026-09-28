"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createClient } from "@/lib/supabase/client";
import { SampleBanner, UndoToast, useLiveData, type ClientView } from "./live-data";
import { accentFor, SpecApp } from "./spec-app";
import { HelperAccessProvider } from "./helper-context";

const REASONS = [
  { value: "phishing", label: "Phishing or impersonation" },
  { value: "spam", label: "Spam" },
  { value: "harmful", label: "Harmful content" },
  { value: "other", label: "Other" },
];

/** "Report this page": a reason and optional details, sent to Prod AI (app/api/report). The publisher isn't told who sent it. */
function ReportLink({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0].value);
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, reason, details: details.trim() }) });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "That didn't go through. Try again in a moment.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Try again in a moment.");
      setState("idle");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="shrink-0 text-slate-500 underline-offset-2 transition-colors hover:text-slate-900 hover:underline">Report this page</button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-80 border-slate-200 bg-white p-3 text-[12.5px] text-slate-700">
        {state === "sent" ? (
          <div className="space-y-2">
            <p className="font-semibold text-slate-900">Thanks for telling us</p>
            <p className="text-slate-500">We&apos;ll look at this page. The person who published it isn&apos;t told who reported it.</p>
            <button onClick={() => setOpen(false)} className="rounded-md border border-slate-200 px-2 py-0.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900">Close</button>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-2.5">
            <p className="font-semibold text-slate-900">Report this page</p>
            <label className="block space-y-1">
              <span className="text-slate-500">What&apos;s wrong?</span>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="block h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-slate-900 outline-none focus-visible:border-slate-400">
                {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-slate-500">Details (optional)</span>
              <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} className="block w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-900 outline-none focus-visible:border-slate-400" />
            </label>
            {error && <p role="alert" className="text-rose-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-50 hover:text-slate-900">Cancel</button>
              <button type="submit" disabled={state === "sending"} className="rounded-md bg-slate-900 px-2.5 py-1 font-medium text-white hover:bg-slate-800 disabled:opacity-50">{state === "sending" ? "Sending…" : "Send report"}</button>
            </div>
          </form>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Who is looking, as the server read it from their session. Guests have no email, so an invitation can never match them. */
export type LiveViewer = { signedIn: boolean; guest: boolean; email: string | null; name: string };

/** A private app's front door, in the app's own look: its name, that it's private, and how to get in. */
function PrivateWall({ app, slug, viewer }: { app: { name: string; primary: string }; slug: string; viewer: LiveViewer }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const accent = accentFor(app.primary, app.name);
  const withEmail = viewer.signedIn && !viewer.guest && viewer.email;
  const signIn = `/login?next=/live/${slug}`;
  // Someone signed in with the wrong address signs out first, then chooses another account.
  const switchAccount = async () => {
    setLeaving(true);
    await createClient().auth.signOut().catch(() => undefined);
    router.push(signIn);
  };
  return (
    <main className="grid min-h-0 flex-1 place-items-center overflow-y-auto bg-slate-50 px-4 py-10 font-sans text-slate-900 antialiased" style={{ "--app-primary": app.primary } as React.CSSProperties}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
        <span aria-hidden className="mx-auto grid size-11 place-items-center rounded-xl text-[17px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${app.primary}, ${accent})` }}>
          {app.name.slice(0, 1).toUpperCase()}
        </span>
        <h1 className="mt-4 text-[17px] font-semibold tracking-tight">{app.name}</h1>
        <p className="mt-1 inline-flex items-center gap-1.5 text-[13.5px] text-slate-600"><Lock className="size-3.5" aria-hidden />This app is private</p>
        {withEmail ? (
          <>
            <p className="mt-4 text-[13px] leading-relaxed text-slate-500">
              You&apos;re signed in as <span className="font-medium text-slate-800">{viewer.email}</span>. Ask the app&apos;s owner to invite this address.
            </p>
            <button type="button" onClick={() => void switchAccount()} disabled={leaving} className="mt-5 text-[12.5px] text-slate-500 underline underline-offset-4 hover:text-slate-900 disabled:opacity-60">
              Use a different account
            </button>
          </>
        ) : (
          <>
            <p className="mt-4 text-[13px] leading-relaxed text-slate-500">Sign in with the email address the owner invited.</p>
            <Link href={signIn} className="mt-5 inline-flex h-9 items-center rounded-lg px-4 text-[13.5px] font-medium text-white shadow-sm transition-opacity hover:opacity-90" style={{ background: app.primary }}>
              Sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** The app with its records, for whoever the server let in: the team gets every screen, a visitor the public pages. */
function LiveScreens({ slug, view, viewer, device }: { slug: string; view: ClientView; viewer: LiveViewer; device: "desktop" | "phone" }) {
  const live = useLiveData(slug, view);
  const team = view.role !== "visitor";
  const card = team ? { name: viewer.name, initials: initialsOf(viewer.name), note: view.role === "owner" ? "Owner" : (viewer.email ?? "Team member") } : undefined;
  return (
    <>
      {team && live.hasSample && <SampleBanner owner={view.role === "owner"} onClear={live.clearSamples} />}
      <div className="relative min-h-0 flex-1">
        <HelperAccessProvider value={{ slug, role: view.role, publicHelpers: view.publicHelpers, onRecordsChanged: () => void live.refresh() }}>
          <SpecApp bp={live.bp} mode="live" device={device} data={live.data} viewer={card} />
        </HelperAccessProvider>
        <UndoToast undo={live.undo} onUndo={() => void live.undoLast()} onDismiss={live.dismissUndo} />
      </div>
    </>
  );
}

export function LiveApp({ app, view, viewer, publishedAt, slug }: { app: { name: string; primary: string }; view: ClientView | null; viewer: LiveViewer; publishedAt: string; slug: string }) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const visitor = view?.role === "visitor";
  // The date is formatted in UTC so the server and every visitor's browser render the same text (no hydration mismatch).
  return (
    <div data-crisp className="flex h-dvh flex-col bg-slate-50">
      {view ? <LiveScreens slug={slug} view={view} viewer={viewer} device={device} /> : <PrivateWall app={app} slug={slug} viewer={viewer} />}
      <div className="flex items-center gap-3 border-t border-slate-200 bg-white px-4 py-1.5 text-[11.5px] text-slate-500">
        <Link href="/" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0.5 pl-1.5 pr-2.5 font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900">
          <LogoMark className="size-3.5" /> Built with Prod AI
        </Link>
        <span className="min-w-0 truncate">Live version · published {new Date(publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span>
        {visitor && view.hasSample && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-slate-500" title="The records on this page are examples, not real data">Example data</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {visitor &&
            (viewer.signedIn && !viewer.guest && viewer.email ? (
              <span className="hidden max-w-[16rem] truncate sm:inline" title="Ask the app's owner to invite this address to see its team screens">Signed in as {viewer.email}</span>
            ) : (
              <Link href={`/login?next=/live/${slug}`} className="shrink-0 text-slate-500 underline-offset-2 transition-colors hover:text-slate-900 hover:underline">Team sign in</Link>
            ))}
          <ReportLink slug={slug} />
          {view && (
            <button onClick={() => setDevice((d) => (d === "desktop" ? "phone" : "desktop"))} className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
              {device === "desktop" ? "Phone view" : "Desktop view"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
