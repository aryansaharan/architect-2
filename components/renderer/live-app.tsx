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
    <div className="flex h-dvh flex-col bg-slate-50">
      <div className="min-h-0 flex-1" onClick={() => undefined}>
        <SpecApp bp={bp} mode="live" device={device} />
      </div>
      <div className="flex items-center gap-3 border-t border-slate-200 bg-white px-4 py-1.5 text-[11.5px] text-slate-500">
        <Link href="/" className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-slate-900">
          <LogoMark className="size-3.5" /> Built with Wonderwork
        </Link>
        <span>Live version · published {new Date(publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} · demo agents answer from the sample data</span>
        <button onClick={() => setDevice((d) => (d === "desktop" ? "phone" : "desktop"))} className="ml-auto rounded border border-slate-200 px-2 py-0.5 hover:bg-slate-50">
          {device === "desktop" ? "Phone view" : "Desktop view"}
        </button>
      </div>
    </div>
  );
}
