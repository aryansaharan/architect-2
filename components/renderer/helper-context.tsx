"use client";
import { createContext, useContext } from "react";

/**
 * Who may talk to a published app's AI helpers, for its chat blocks (components/renderer/chat-block.tsx).
 * The server decides again on every message (app/api/apps/[slug]/chat); this only picks which chat to show.
 * Provide it around the live app's SpecApp. Without it, a chat block asks the server once whether its
 * helper is open to this person, and reads the app's slug from the /live/<slug> address.
 */
export type HelperAccess = {
  slug: string;
  role: "owner" | "member" | "visitor";
  /** The owner lets visitors talk to the helpers on public pages (settings.app.publicHelpers). */
  publicHelpers: boolean;
  /** Email is set up on this Prod AI (a yes or no from the server, never the key), so an approved email really goes out. */
  emailReady: boolean;
  /** Read the app's records again after a helper changed one (or a change was undone from the chat). */
  onRecordsChanged?: () => void;
};

export const HelperAccessContext = createContext<HelperAccess | null>(null);
export const HelperAccessProvider = HelperAccessContext.Provider;

export function useHelperAccess(): HelperAccess | null {
  return useContext(HelperAccessContext);
}

/** Fired on window after a helper changed records, for anything that shows them. */
export const RECORDS_CHANGED_EVENT = "prodai:records-changed";
