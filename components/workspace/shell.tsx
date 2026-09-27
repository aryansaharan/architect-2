"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { WorkspaceProvider, useWorkspace, type WorkspaceData } from "./context";
import { TopBar } from "./top-bar";
import { Rail } from "./rail";
import { Inspector } from "./inspector/inspector";
import { HandoffDialog } from "./handoff-dialog";
import { CommandK } from "./command-k";
import { RecordedRepairContext } from "./use-build-runner";
import { ComposerDock, ComposerDockProvider } from "./composer-dock";
import type { RailPref } from "./rail-pref";

export function WorkspaceShell({ data, railPref = "auto", children }: { data: WorkspaceData; railPref?: RailPref; children: React.ReactNode }) {
  // The build's recorded fix (newest first), so "Replay how it was built" matches the history.
  const recordedFix = data.ledger.find((r) => r.kind === "repair" && r.blame === "system_fix") ?? null;
  return (
    <Suspense>
      <RecordedRepairContext.Provider value={recordedFix}>
        <WorkspaceProvider data={data}>
          <ComposerDockProvider>
            <ShellLayout railPref={railPref}>{children}</ShellLayout>
          </ComposerDockProvider>
        </WorkspaceProvider>
      </RecordedRepairContext.Provider>
    </Suspense>
  );
}

function ShellLayout({ railPref, children }: { railPref: RailPref; children: React.ReactNode }) {
  const ws = useWorkspace();
  const [railOpen, setRailOpen] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLElement>(null);
  useEffect(() => {
    const open = () => setRailOpen(true);
    window.addEventListener("architect:open-rail", open);
    return () => window.removeEventListener("architect:open-rail", open);
  }, []);
  // Below xl the inspector floats over the view. Keep it above the composer dock, which grows with a Work Order.
  useEffect(() => {
    const d = dock.current;
    const r = row.current;
    if (!d || !r) return;
    const ro = new ResizeObserver(() => r.style.setProperty("--dock-h", `${d.offsetHeight}px`));
    ro.observe(d);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar />
      <div ref={row} className="relative flex min-h-0 flex-1">
        <div className="max-lg:hidden">
          <Rail collapsible initialPref={railPref} />
        </div>
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">{children}</div>
          <ComposerDock ref={dock} />
        </main>
        <AnimatePresence initial={false}>
          {ws.selected && (
            <motion.div
              key="inspector"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 360, damping: 38, opacity: { duration: 0.18 } }}
              className="overflow-hidden max-xl:absolute max-xl:bottom-[var(--dock-h,0px)] max-xl:right-0 max-xl:top-0 max-xl:z-40 max-xl:bg-canvas max-xl:shadow-2xl"
            >
              <Inspector />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Sheet open={railOpen} onOpenChange={setRailOpen}>
        <SheetContent side="left" className="w-[320px] p-0">
          <SheetTitle className="sr-only">Brief and activity</SheetTitle>
          <Rail />
        </SheetContent>
      </Sheet>
      <HandoffDialog />
      <CommandK />
    </div>
  );
}
