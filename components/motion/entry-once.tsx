"use client";
import { useEffect, useState, useSyncExternalStore } from "react";

const noop = () => () => {};
const keyOf = (id: string) => `prodai:entry:${id}`;

/** Whether this entry effect already played in this browser tab. */
export function seenThisSession(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(keyOf(id)) === "1";
  } catch {
    return false;
  }
}

export function markSeen(id: string) {
  try {
    window.sessionStorage.setItem(keyOf(id), "1");
  } catch {
    // Storage blocked: the effect may play again, which is harmless.
  }
}

/**
 * Wraps something whose CSS entrance (components/motion/entry-motion.module.css) should play once per
 * session: the first time it's seen. After that, on a reload or on coming back to the page, it is
 * simply there: data-entry-seen switches the animations off.
 *
 * The content is in the server HTML from the first paint. On a full page load a tiny inline script,
 * run before the first paint, marks the wrapper as seen if it already played this session, so
 * nothing replays and nothing flashes. On a client-side navigation the same check happens in render.
 */
export function EntryOnce({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const [seen] = useState(() => seenThisSession(id));
  // True while hydrating the server HTML, false afterwards and on client-side renders (where an inline script would never run).
  const hydrating = useSyncExternalStore(noop, () => false, () => true);
  useEffect(() => markSeen(id), [id]);
  return (
    <>
      <div className={className} data-entry-seen={seen ? "" : undefined} suppressHydrationWarning>
        {children}
      </div>
      {hydrating && (
        <script
          dangerouslySetInnerHTML={{
            __html: `try{sessionStorage.getItem(${JSON.stringify(keyOf(id))})==="1"&&document.currentScript.previousElementSibling.setAttribute("data-entry-seen","")}catch(e){}`,
          }}
        />
      )}
    </>
  );
}
