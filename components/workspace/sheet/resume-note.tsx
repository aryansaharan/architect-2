"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelBuild } from "@/lib/actions/build";
import type { InterruptedBuild } from "../use-build-runner";
import { useSheet } from "./use-sheet";

/**
 * The server says this project is mid-build but nothing here is running it (the tab was closed or
 * reloaded). The price was already taken, so resuming is free; stopping refunds it. Same calls as the
 * plan map's resume dock: ws.build.start() resumes without charging again, cancelBuild refunds.
 */
export function ResumeNote({ build }: { build: InterruptedBuild }) {
  const ws = useSheet();
  const router = useRouter();
  const [busy, setBusy] = useState<"resume" | "stop" | null>(null);
  // What was taken when the build started (the newest build quote in the history).
  const paid = ws.ledger.find((r) => r.kind === "work_order")?.credits ?? 0;
  const where = build.step ? ` at step ${build.step} of ${build.total}` : "";
  return (
    <section aria-labelledby="sheet-resume-title" className="sketch-soft fade-up mt-7 bg-brand-soft p-5 sm:p-6">
      <h2 id="sheet-resume-title" className="font-display text-[30px] leading-[1.1] text-foreground sm:text-[34px]">
        Your build was interrupted{where}
      </h2>
      <p className="mt-2 max-w-[62ch] text-[13.5px] leading-relaxed text-muted-foreground">
        {build.atRepair ? "It was waiting for you to pick a fix. " : ""}
        {paid > 0 ? `The ${paid} credits you already paid still cover it. ` : ""}
        Resume picks up where it stopped, or stop now and get the credits back.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="lg"
          className="h-10 rounded-lg px-4 text-[14px]"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("resume");
            await ws.build.start();
            setBusy(null);
          }}
        >
          <RotateCw aria-hidden /> {busy === "resume" ? "Resuming…" : "Resume · free"}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="h-10 text-muted-foreground"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("stop");
            const r = await cancelBuild(ws.project.id).catch(() => ({ ok: false as const, error: "Couldn't reach Prod AI. Try again." }));
            setBusy(null);
            if (!r.ok) return void toast.error(r.error);
            ws.build.dismiss();
            toast.success("Stopped. Nothing was charged", { description: "The credits went back on your demo balance." });
            router.refresh();
          }}
        >
          <Undo2 aria-hidden /> {busy === "stop" ? "Stopping…" : "Stop · refunded"}
        </Button>
      </div>
    </section>
  );
}
