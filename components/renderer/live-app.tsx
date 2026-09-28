"use client";
import { useState } from "react";
import Link from "next/link";
import type { Blueprint } from "@/lib/blueprint/schema";
import { LogoMark } from "@/components/brand/logo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SpecApp } from "./spec-app";

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

export function LiveApp({ bp, publishedAt, slug }: { bp: Blueprint; publishedAt: string; slug: string }) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  // The date is formatted in UTC so the server and every visitor's browser render the same text (no hydration mismatch).
  return (
    <div data-crisp className="flex h-dvh flex-col bg-slate-50">
      <div className="min-h-0 flex-1" onClick={() => undefined}>
        <SpecApp bp={bp} mode="live" device={device} />
      </div>
      <div className="flex items-center gap-3 border-t border-slate-200 bg-white px-4 py-1.5 text-[11.5px] text-slate-500">
        <Link href="/" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0.5 pl-1.5 pr-2.5 font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900">
          <LogoMark className="size-3.5" /> Built with Prod AI
        </Link>
        <span className="min-w-0 truncate">Live version · published {new Date(publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} · AI helpers in this demo answer from its sample data</span>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <ReportLink slug={slug} />
          <button onClick={() => setDevice((d) => (d === "desktop" ? "phone" : "desktop"))} className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
            {device === "desktop" ? "Phone view" : "Desktop view"}
          </button>
        </div>
      </div>
    </div>
  );
}
