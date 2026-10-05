"use client";
import { useEffect, useState } from "react";
import motion from "./entry-motion.module.css";

/** The tab the account header showed last, in this tab of the browser. */
let lastTab: string | null = null;

/**
 * The pencil line under the current tab. When you move from one tab to another (Projects to
 * Settings), it's drawn under the new one, left to right, so you see where you went. On a fresh
 * load, or coming back to the same tab from a project, it's simply there.
 */
export function EntryTabLine({ tab, className, children }: { tab: string; className?: string; children: React.ReactNode }) {
  // Read once, when the line first appears. On a full page load this is null, matching the server.
  const [moved] = useState(() => lastTab !== null && lastTab !== tab);
  useEffect(() => {
    lastTab = tab;
  }, [tab]);
  return (
    <span aria-hidden className={moved ? `${className ?? ""} ${motion.tabDraw}` : className}>
      {children}
    </span>
  );
}
