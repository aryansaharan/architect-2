"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CodeView } from "@/components/arch/code-view";
import { filesFor, generateFiles } from "@/lib/codegen/files";
import type { ObjectRef } from "@/lib/blueprint/schema";
import { Segmented } from "@/components/arch/segmented";
import { useWorkspace } from "../context";

export function CodeFace({ objectRef }: { objectRef: ObjectRef }) {
  const ws = useWorkspace();
  const files = useMemo(() => {
    if (objectRef.type === "connection") {
      const all = generateFiles(ws.blueprint);
      return all.filter((f) => f.path === ".env.example");
    }
    if (objectRef.type === "block") {
      const screen = ws.blueprint.screens.find((s) => [...s.regions.main, ...s.regions.side].some((b) => b.id === objectRef.id));
      return screen ? filesFor(ws.blueprint, { type: "screen", id: screen.id }) : [];
    }
    if (objectRef.type === "entity") {
      const all = generateFiles(ws.blueprint);
      return [...all.filter((f) => f.objectRef?.type === "entity" && f.objectRef.id === objectRef.id), ...all.filter((f) => f.path === "supabase/schema.sql")];
    }
    return filesFor(ws.blueprint, objectRef);
  }, [ws.blueprint, objectRef]);
  const [active, setActive] = useState(0);
  const file = files[Math.min(active, files.length - 1)];
  if (!file) return <p className="py-6 text-center text-ui text-muted-foreground">No generated files for this one.</p>;
  return (
    <div className="-mx-4">
      <div className="overflow-x-auto border-b border-hairline px-4 pb-2">
        <Segmented ariaLabel="File" size="xs" value={String(Math.min(active, files.length - 1))} onChange={(v) => setActive(Number(v))} options={files.map((f, i) => ({ value: String(i), title: f.path, label: <span className="font-mono">{f.path.split("/").pop()}</span> }))} />
      </div>
      <p className="truncate px-4 pt-2 font-mono text-badge text-faint">{file.path}</p>
      <CodeView code={file.content} lang={file.lang} className="mt-1 max-h-[60vh] border-y border-hairline" />
      <div className="px-4 pt-3">
        <Link href={`/p/${ws.project.id}/code?file=${encodeURIComponent(file.path)}`} className="text-meta text-brand underline decoration-dotted underline-offset-4">
          Open in Code and GitHub →
        </Link>
      </div>
    </div>
  );
}
