"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelBuild } from "@/lib/actions/build";
import { stoppedWords, type InterruptedBuild } from "../use-build-runner";
import { useSheet } from "./use-sheet";

/**
 * The server says this project is mid-build but nothing here is running it (the tab was closed or
 * reloaded). Making it real is free, so resuming and stopping are too. Same calls as the plan map's
 * resume dock: ws.build.start() resumes, cancelBuild stops (refunding a build charged under the earlier pricing).
 */
export function ResumeNote({ build }: { build: InterruptedBuild }) {
  const ws = useSheet();
  const router = useRouter();
  const [busy, setBusy] = useState<"resume" | "stop" | null>(null);
  // The step it reached is a figure: said in print, not in the pencil heading.
  const where = build.step ? `It stopped at step ${build.step} of ${build.total}. ` : "";
  return (
    <section aria-labelledby="sheet-resume-title" className="sketch-soft fade-up mt-7 bg-brand-soft p-5 sm:p-6">
      <h2 id="sheet-resume-title" className="font-pencil text-section text-foreground">
        Your build was interrupted
      </h2>
      <p className="mt-2 max-w-[62ch] text-body tabular-nums text-muted-foreground">
        {where}
        {build.atRepair ? "It was waiting for you to pick a fix. " : ""}
        Resume picks up where it stopped, or stop it and keep the sketch as it was.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="lg"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("resume");
            await ws.build.start();
            setBusy(null);
          }}
        >
          <RotateCw aria-hidden /> {busy === "resume" ? "Resuming…" : "Resume"}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="text-muted-foreground"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("stop");
            const r = await cancelBuild(ws.project.id).catch(() => ({ ok: false as const, error: "Couldn't reach Prod AI. Try again." }));
            setBusy(null);
            if (!r.ok) return void toast.error(r.error);
            ws.build.dismiss();
            toast.success("Stopped", { description: stoppedWords(r.refunded, "Your sketch is exactly as you left it.") });
            router.refresh();
          }}
        >
          <Undo2 aria-hidden /> {busy === "stop" ? "Stopping…" : "Stop"}
        </Button>
      </div>
    </section>
  );
}
