"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CodeView } from "@/components/arch/code-view";
import { filesFor, generateFiles } from "@/lib/codegen/files";
import type { ObjectRef } from "@/lib/blueprint/schema";
import { cn } from "@/lib/utils";
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
  if (!file) return <p className="py-6 text-center text-[12.5px] text-muted-foreground">No generated files for this object.</p>;
  return (
    <div className="-mx-4">
      <div className="flex gap-1 overflow-x-auto border-b border-hairline px-4 pb-2">
        {files.map((f, i) => (
          <button key={f.path} onClick={() => setActive(i)} aria-pressed={i === active} className={cn("shrink-0 rounded-md px-2 py-1 font-mono text-[11px]", i === active ? "border border-hairline bg-panel text-foreground" : "border border-transparent text-muted-foreground hover:text-foreground")}>
            {f.path.split("/").pop()}
          </button>
        ))}
      </div>
      <p className="truncate px-4 pt-2 font-mono text-[10.5px] text-faint">{file.path}</p>
      <CodeView code={file.content} lang={file.lang} className="mt-1 max-h-[60vh] border-y border-hairline" />
      <div className="px-4 pt-3">
        <Link href={`/p/${ws.project.id}/code?file=${encodeURIComponent(file.path)}`} className="text-[12px] text-amber underline-offset-4 hover:underline">
          Open in the Code tab →
        </Link>
      </div>
    </div>
  );
}
