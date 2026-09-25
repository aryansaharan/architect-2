"use client";
import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { CodeView } from "@/components/arch/code-view";
import { cn } from "@/lib/utils";

export function FrameworkTabs({ items }: { items: { id: string; label: string; file: string; lang: "py" | "ts"; code: string; notes: string[] }[] }) {
  const [active, setActive] = useState(items[0]?.id);
  const cur = items.find((i) => i.id === active) ?? items[0];
  if (!cur) return null;
  return (
    <div className="panel-raised overflow-hidden rounded-2xl">
      <div className="flex gap-1 overflow-x-auto border-b border-hairline px-3 py-2" role="tablist" aria-label="Frameworks">
        {items.map((i) => (
          <button key={i.id} role="tab" aria-selected={i.id === cur.id} onClick={() => setActive(i.id)} className={cn("shrink-0 rounded-md px-2.5 py-1 text-[12px]", i.id === cur.id ? "bg-raised text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {i.label}
          </button>
        ))}
      </div>
      <div className="grid md:grid-cols-[1fr_260px]">
        <div className="min-w-0 border-hairline md:border-r">
          <p className="border-b border-hairline px-4 py-2 font-mono text-[11px] text-faint">agents/settlement/{cur.file}</p>
          <CodeView code={cur.code} lang={cur.lang} className="h-[380px]" />
        </div>
        <div className="p-4">
          <p className="micro-label flex items-center gap-1.5"><CircleAlert className="size-3" />What doesn&apos;t translate</p>
          <ul className="mt-3 space-y-3">
            {cur.notes.map((n) => (
              <li key={n} className="text-[12.5px] leading-relaxed text-muted-foreground">{n}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
