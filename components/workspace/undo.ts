"use client";
import { toast } from "sonner";
import { restoreCheckpoint } from "@/lib/actions/checkpoints";

/** The id of the toast that offers "Undo" back to this version, so undoing from anywhere else can close it. */
export const undoToastId = (checkpointId: string) => `undo-${checkpointId}`;

/** "Undo" on a toast: go back to the version from just before the change. Never throws, offline included. */
export async function undoTo(projectId: string, checkpointId: string, refresh: () => void) {
  let r: Awaited<ReturnType<typeof restoreCheckpoint>>;
  try {
    r = await restoreCheckpoint(projectId, checkpointId);
  } catch {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return void toast.error(offline ? "You're offline" : "Couldn't undo just now", { description: offline ? "Nothing changed. Undo again when you're back." : "Nothing changed. Try again." });
  }
  if (!r.ok) return void toast.error(r.error ?? "Couldn't undo");
  // Undone from the notes: the change's own toast would otherwise still offer the same Undo.
  toast.dismiss(undoToastId(checkpointId));
  toast.success("Undone", { description: "Back where you were. The change is still kept as a version." });
  refresh();
}
