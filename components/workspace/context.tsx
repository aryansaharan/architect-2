"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Blueprint, ObjectRef } from "@/lib/blueprint/schema";
import { parseRef, refToString } from "@/lib/blueprint/schema";
import type { CheckpointMeta, LedgerRow, ProjectSettings, WorkOrderRow, BuildState, HandoffRow } from "@/lib/db/types";
import type { CreditMeter } from "@/lib/prices";
import { useBuildRunner, type BuildRunner } from "./use-build-runner";

export type WorkspaceData = {
  project: {
    id: string;
    name: string;
    buildState: BuildState;
    isDemo: boolean;
    settings: ProjectSettings;
    source: "describe" | "import";
    brief: string;
    currentCheckpointId: string | null;
  };
  blueprint: Blueprint;
  checkpoints: CheckpointMeta[];
  ledger: LedgerRow[];
  /** This project's spend and its optional spending cap (enforced on changes and AI helpers). */
  usage: { credits: number; cap: number };
  /** The person's own credits this month: the meter in the top bar. */
  credits: CreditMeter;
  liveSlug: string | null;
  user: { name: string; isAnonymous: boolean; avatarUrl: string | null };
  handoffs: HandoffRow[];
  pendingWorkOrder: WorkOrderRow | null;
  llm: "live" | "offline";
};

type Ctx = WorkspaceData & {
  selected: ObjectRef | null;
  select: (ref: ObjectRef | null) => void;
  scope: ObjectRef | null;
  setScope: (ref: ObjectRef | null) => void;
  composerFocusKey: number;
  focusComposer: (scope?: ObjectRef | null) => void;
  build: BuildRunner;
  handoffTarget: ObjectRef | null;
  openHandoff: (ref: ObjectRef | null) => void;
  closeHandoff: () => void;
};

const WorkspaceContext = createContext<Ctx | null>(null);

export function WorkspaceProvider({ data, children }: { data: WorkspaceData; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = parseRef(params.get("sel"));
  const [scope, setScope] = useState<ObjectRef | null>(null);
  const [composerFocusKey, setFocusKey] = useState(0);
  const [handoffTarget, setHandoffTarget] = useState<ObjectRef | null>(null);

  const select = useCallback(
    (ref: ObjectRef | null) => {
      const sp = new URLSearchParams(params.toString());
      if (ref) sp.set("sel", refToString(ref));
      else sp.delete("sel");
      const q = sp.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const focusComposer = useCallback((s?: ObjectRef | null) => {
    if (s !== undefined) setScope(s);
    setFocusKey((k) => k + 1);
  }, []);

  const build = useBuildRunner({ projectId: data.project.id, blueprint: data.blueprint, buildState: data.project.buildState });

  const value = useMemo<Ctx>(
    () => ({
      ...data,
      selected,
      select,
      scope,
      setScope,
      composerFocusKey,
      focusComposer,
      build,
      handoffTarget,
      openHandoff: (ref) => setHandoffTarget(ref ?? { type: "brief", id: "meta" }),
      closeHandoff: () => setHandoffTarget(null),
    }),
    [data, selected, select, scope, composerFocusKey, focusComposer, build, handoffTarget],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
