"use client";
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { WorkspaceProvider, useWorkspace, type WorkspaceData } from "./context";
import { TopBar } from "./top-bar";
import { Margin } from "./rail";
import { Inspector } from "./inspector/inspector";
import { HandoffDialog } from "./handoff-dialog";
import { CommandK } from "./command-k";
import { RecordedRepairContext } from "./use-build-runner";
import { ComposerDockProvider } from "./composer-dock";
import type { RailPref } from "./rail-pref";
import type { WorkOrderRow } from "@/lib/db/types";

/**
 * A project: the top bar, then the page, then the notes margin on the right.
 * On the Sheet (/p/[id]) the margin is open beside the page; elsewhere it is a slim "Notes" tab;
 * below 1024px it is a bottom sheet behind a "Notes" button. The page fills the space in between.
 */
export function WorkspaceShell({ data, railPref = "auto", changeOrders = [], children }: { data: WorkspaceData; railPref?: RailPref; changeOrders?: WorkOrderRow[]; children: React.ReactNode }) {
  // The build's recorded fix (newest first), so "Replay how it was built" matches the history.
  const recordedFix = data.ledger.find((r) => r.kind === "repair" && r.blame === "system_fix") ?? null;
  return (
    <Suspense>
      <RecordedRepairContext.Provider value={recordedFix}>
        <WorkspaceProvider data={data}>
          <ComposerDockProvider changeOrders={changeOrders}>
            <ShellLayout railPref={railPref}>{children}</ShellLayout>
          </ComposerDockProvider>
        </WorkspaceProvider>
      </RecordedRepairContext.Provider>
    </Suspense>
  );
}

/**
 * The old quick tour was opened with ?tour=1 (the demo link still adds it). There is no tour now,
 * so drop the parameter quietly: no server round trip, and a reload or a shared link stays clean.
 */
function useDropTourParam() {
  const params = useSearchParams();
  const pathname = usePathname();
  useEffect(() => {
    if (!params.has("tour")) return;
    const sp = new URLSearchParams(params.toString());
    sp.delete("tour");
    const q = sp.toString();
    window.history.replaceState(null, "", `${pathname}${q ? `?${q}` : ""}${window.location.hash}`);
  }, [params, pathname]);
}

function ShellLayout({ railPref, children }: { railPref: RailPref; children: React.ReactNode }) {
  const ws = useWorkspace();
  useDropTourParam();
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        {/* The page and the inspector share the space left of the margin; below xl the inspector floats over the page. */}
        <div className="relative flex min-w-0 flex-1">
          <main id="main" className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">{children}</div>
          </main>
          <AnimatePresence initial={false}>
            {ws.selected && (
              <motion.div
                key="inspector"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 360, damping: 38, opacity: { duration: 0.18 } }}
                className="overflow-hidden max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-40 max-xl:bg-canvas max-xl:shadow-[-18px_0_40px_-28px_rgb(26_26_23/0.4)]"
              >
                <Inspector />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <Margin initialPref={railPref} />
      </div>
      <HandoffDialog />
      <CommandK />
    </div>
  );
}
