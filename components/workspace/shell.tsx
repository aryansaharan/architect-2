"use client";
import { Suspense, useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { WorkspaceProvider, useWorkspace, type WorkspaceData } from "./context";
import { TopBar } from "./top-bar";
import { Rail } from "./rail";
import { Inspector } from "./inspector/inspector";
import { HandoffDialog } from "./handoff-dialog";
import { CommandK } from "./command-k";

export function WorkspaceShell({ data, children }: { data: WorkspaceData; children: React.ReactNode }) {
  return (
    <Suspense>
      <WorkspaceProvider data={data}>
        <ShellLayout>{children}</ShellLayout>
      </WorkspaceProvider>
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
        {ws.selected && (
          <div className="max-xl:absolute max-xl:inset-y-12 max-xl:right-0 max-xl:z-40 max-xl:shadow-2xl">
            <Inspector />
          </div>
        )}
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
