/**
 * The notes margin: whether it is open on the Sheet, and which part of a
 * project a path is on. Shared by the server layout (reads the cookie so the
 * first paint already has the right width) and the client margin (reads and
 * writes localStorage, mirrored to the cookie).
 *
 * The preference only applies on the Sheet ("auto" and "open" show the margin,
 * "collapsed" folds it to a slim "Notes" tab). Everywhere else the margin
 * starts folded and opens when you ask for it.
 *
 * Plain functions only: the server imports this file too, and the browser
 * helpers below touch `window` only when they are called.
 */
export type RailPref = "auto" | "open" | "collapsed";

export const RAIL_COOKIE = "prodai-rail";
export const RAIL_STORAGE_KEY = "prodai:rail";

export function parseRailPref(v: string | null | undefined): RailPref {
  return v === "open" || v === "collapsed" ? v : "auto";
}

const RAIL_EVENT = "prodai:rail-pref";

export function subscribeRail(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(RAIL_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(RAIL_EVENT, cb);
  };
}

export function readRail(): RailPref {
  try {
    return parseRailPref(window.localStorage.getItem(RAIL_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

export function writeRail(v: RailPref) {
  try {
    window.localStorage.setItem(RAIL_STORAGE_KEY, v);
  } catch {
    // Private mode: the cookie below still remembers it.
  }
  // Mirrored to a cookie so the server paints the right width on the next load.
  document.cookie = `${RAIL_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new Event(RAIL_EVENT));
}

/** Fired to open the notes: the margin on a desktop, the bottom sheet on a phone. */
export const OPEN_NOTES_EVENT = "prodai:open-notes";

/** Show the notes: the margin from 1024px wide, the bottom sheet on smaller screens. */
export function openNotes() {
  window.dispatchEvent(new Event(OPEN_NOTES_EVENT));
}

/**
 * The part of a project a path is on: "" for the Sheet (/p/[id]), else the next
 * segment ("agents", "ship", "blueprint", "preview", "code", "handoffs").
 */
export function projectSection(pathname: string, projectId: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const at = parts.indexOf(projectId);
  return at === -1 ? "" : (parts[at + 1] ?? "");
}

/**
 * How the margin behaves on each part of a project:
 * - "sheet": open beside the Sheet (unless you folded it), the place notes are written.
 * - "tab": folded to a slim "Notes" tab that opens it (Publish and the Under the hood pages).
 * - "quiet": AI helpers, whose playground has its own text box. The margin stays folded
 *   there until you open it yourself, so there is only one box to type in.
 */
export type MarginMode = "sheet" | "tab" | "quiet";

export function marginModeFor(section: string): MarginMode {
  if (section === "") return "sheet";
  if (section === "agents") return "quiet";
  return "tab";
}
