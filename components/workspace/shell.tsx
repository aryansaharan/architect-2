"use client";
import { Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { WorkspaceProvider, useWorkspace, type WorkspaceData } from "./context";
import { TopBar } from "./top-bar";
import { Margin } from "./rail";
import { Inspector } from "./inspector/inspector";
import { HandoffDialog } from "./handoff-dialog";
import { CommandK } from "./command-k";
import { RecordedRepairContext } from "./use-build-runner";
import { ComposerDockProvider } from "./composer-dock";
import { projectSection, type RailPref } from "./rail-pref";
import type { WorkOrderRow } from "@/lib/db/types";
import { DUR, EASE, SPRING } from "@/lib/motion";

/**
 * A project: the top bar, then the page, then the notes margin on the right.
 * On the Sheet (/p/[id]) the margin is open beside the page; elsewhere it is a slim "Notes" tab;
 * below 1024px it is a bottom sheet behind a slim "Notes" bar, stacked under the page so it never
 * covers what's on it. The page fills the space in between.
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
 * Older shared links can still carry ?tour=1 from a quick tour that no longer exists. Drop the
 * parameter quietly: no server round trip, and a reload or a shared link stays clean.
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

/**
 * Switching tabs: the new page fades in (150ms) as the pencil underline slides to its tab. Only when the
 * section changes, never on arrival, and set before the first paint so the page never flashes in first.
 */
function useTabFade(ref: React.RefObject<HTMLDivElement | null>, projectId: string) {
  const section = projectSection(usePathname(), projectId);
  const reduce = useReducedMotion();
  const last = useRef(section);
  useLayoutEffect(() => {
    if (last.current === section) return;
    last.current = section;
    if (!ref.current || reduce) return;
    const a = animate(ref.current, { opacity: [0, 1] }, { duration: DUR.hover, ease: EASE });
    return () => a.stop();
  }, [ref, section, reduce]);
}

function ShellLayout({ railPref, children }: { railPref: RailPref; children: React.ReactNode }) {
  const ws = useWorkspace();
  const page = useRef<HTMLDivElement>(null);
  useDropTourParam();
  useTabFade(page, ws.project.id);
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <TopBar />
      {/* Below 1024px this stacks: the page, then the notes bar (the margin itself is a bottom sheet over both). */}
      <div className="relative flex min-h-0 flex-1 max-lg:flex-col">
        {/* The page and the inspector share the space left of the margin; below xl the inspector floats over the page. */}
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <main id="main" className="flex min-w-0 flex-1 flex-col">
            <div ref={page} className="relative min-h-0 flex-1">
              {children}
            </div>
          </main>
          <AnimatePresence initial={false}>
            {ws.selected && (
              <motion.div
                key="inspector"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ ...SPRING, opacity: { duration: DUR.hover } }}
                className="overflow-hidden max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-40 max-xl:bg-canvas max-xl:shadow-float"
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
