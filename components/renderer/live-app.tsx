"use client";
import { useState } from "react";
import Link from "next/link";
import type { Blueprint } from "@/lib/blueprint/schema";
import { LogoMark } from "@/components/brand/logo";
import { SpecApp } from "./spec-app";

export function LiveApp({ bp, publishedAt }: { bp: Blueprint; publishedAt: string }) {
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
        <button onClick={() => setDevice((d) => (d === "desktop" ? "phone" : "desktop"))} className="ml-auto shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
          {device === "desktop" ? "Phone view" : "Desktop view"}
        </button>
      </div>
    </div>
  );
}
