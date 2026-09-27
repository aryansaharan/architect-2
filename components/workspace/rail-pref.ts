/**
 * Whether the chat rail is open, collapsed to a slim strip, or left to the
 * default ("auto": open from 1280px wide, slim below). Shared by the server
 * layout (reads the cookie so the first paint is right) and the client rail
 * (reads and writes localStorage, mirrored to the cookie).
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

/** Show the chat: the side rail on a desktop (from 1024px), the slide-over sheet on smaller screens. */
export function openChat() {
  if (window.matchMedia("(min-width: 1024px)").matches) writeRail("open");
  else window.dispatchEvent(new Event("architect:open-rail"));
}
