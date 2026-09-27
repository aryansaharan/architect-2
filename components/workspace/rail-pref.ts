/**
 * Whether the activity rail is open, collapsed to a slim strip, or left to the
 * default ("auto": open from 1600px wide, slim below). Shared by the server
 * layout (reads the cookie so the first paint is right) and the client rail
 * (reads and writes localStorage, mirrored to the cookie).
 */
export type RailPref = "auto" | "open" | "collapsed";

export const RAIL_COOKIE = "prodai-rail";
export const RAIL_STORAGE_KEY = "prodai:rail";

export function parseRailPref(v: string | null | undefined): RailPref {
  return v === "open" || v === "collapsed" ? v : "auto";
}
