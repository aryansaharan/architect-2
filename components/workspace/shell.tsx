"use client";
import { Suspense, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { WorkspaceProvider, useWorkspace, type WorkspaceData } from "./context";
import { TopBar } from "./top-bar";
import { Rail } from "./rail";
import { Inspector } from "./inspector/inspector";
import { HandoffDialog } from "./handoff-dialog";
import { CommandK } from "./command-k";
import { RecordedRepairContext } from "./use-build-runner";

export function WorkspaceShell({ data, children }: { data: WorkspaceData; children: React.ReactNode }) {
  // The build's recorded fix (newest first), so "Replay how it was built" matches the history.
  const recordedFix = data.ledger.find((r) => r.kind === "repair" && r.blame === "system_fix") ?? null;
  return (
    <Suspense>
      <RecordedRepairContext.Provider value={recordedFix}>
        <WorkspaceProvider data={data}>
          <ShellLayout>{children}</ShellLayout>
        </WorkspaceProvider>
      </RecordedRepairContext.Provider>
    </Suspense>
  );
}

function ShellLayout({ children }: { children: React.ReactNode }) {
  const ws = useWorkspace();
  const [railOpen, setRailOpen] = useState(false);
  useEffect(() => {
    const open = () => setRailOpen(true);
    window.addEventListener("architect:open-rail", open);
    return () => window.removeEventListener("architect:open-rail", open);
  }, []);
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <div className="max-lg:hidden">
          <Rail />
        </div>
        <main id="main" className="relative min-w-0 flex-1">
          {children}
        </main>
        <AnimatePresence initial={false}>
          {ws.selected && (
            <motion.div
              key="inspector"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 360, damping: 38, opacity: { duration: 0.18 } }}
              className="overflow-hidden max-xl:absolute max-xl:inset-y-12 max-xl:right-0 max-xl:z-40 max-xl:shadow-2xl"
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
