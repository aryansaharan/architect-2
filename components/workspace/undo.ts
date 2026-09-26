"use client";
import { toast } from "sonner";
import { restoreCheckpoint } from "@/lib/actions/checkpoints";

/** "Undo" on a toast: go back to the save point from just before the change. */
export async function undoTo(projectId: string, checkpointId: string, refresh: () => void) {
  const r = await restoreCheckpoint(projectId, checkpointId);
  if (!r.ok) return void toast.error(r.error ?? "Couldn't undo");
  toast.success("Undone", { description: "Back where you were. The change is still kept as a save point." });
  refresh();
}
