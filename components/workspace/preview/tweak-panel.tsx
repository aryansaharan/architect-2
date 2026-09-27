"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, MessageSquarePlus, Plus, Trash2, X } from "lucide-react";
import type { Block, Blueprint } from "@/lib/blueprint/schema";
import { BLOCK_LABELS } from "@/lib/blueprint";
import { tweakBlock, type BlockTweak } from "@/lib/actions/blueprint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deriveKpi, screenEntityId } from "@/components/renderer/kpi";
import { undoTo } from "../undo";
import { useWorkspace } from "../context";

/**
 * Free, deterministic edits to one block. Bigger asks go to the composer as a Work Order.
 * Rendered docked beside the preview (see preview-view.tsx), so it never covers the block it edits.
 */
export function TweakPanel({ projectId, block, bp, onClose, onAsk }: { projectId: string; block: Block; bp: Blueprint; onClose: () => void; onAsk: () => void }) {
  const router = useRouter();
  const ws = useWorkspace();
  const [pending, start] = useTransition();
  const entity = "entityId" in block && block.entityId ? bp.entities.find((e) => e.id === block.entityId) : undefined;
  const [title, setTitle] = useState("title" in block ? (block.title ?? "") : "");
  const [cols, setCols] = useState<string[]>(block.type === "table" ? block.columns : []);
  const [labels, setLabels] = useState<string[]>(block.type === "kpis" ? block.items.map((i) => i.label) : block.type === "actions" ? block.buttons.map((b) => b.label) : block.type === "detail" ? block.actions.map((a) => a.label) : []);
  const [submit, setSubmit] = useState(block.type === "form" ? block.submitLabel : "");
  const [md, setMd] = useState(block.type === "text" ? block.markdown : "");

  const save = (patches: BlockTweak[], msg: string) =>
    start(async () => {
      const prev = ws.project.currentCheckpointId;
      for (const p of patches) {
        const r = await tweakBlock(projectId, block.id, p);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
      }
      toast.success(msg, {
        description: "Free · no model involved · saved as a save point",
        duration: 9000,
        action: prev ? { label: "Undo", onClick: () => void undoTo(projectId, prev, () => router.refresh()) } : undefined,
      });
      router.refresh();
      onClose();
    });

  const patches = (): BlockTweak[] => {
    const out: BlockTweak[] = [];
    if ("title" in block && title !== (block.title ?? "")) out.push({ title });
    if (block.type === "table" && cols.join() !== block.columns.join()) out.push({ columns: cols });
    if (block.type === "kpis") labels.forEach((l, i) => l !== block.items[i].label && out.push({ itemLabel: { index: i, label: l } }));
    if (block.type === "actions") labels.forEach((l, i) => l !== block.buttons[i].label && out.push({ buttonLabel: { index: i, label: l } }));
    if (block.type === "detail") labels.forEach((l, i) => l !== block.actions[i].label && out.push({ buttonLabel: { index: i, label: l } }));
    if (block.type === "form" && submit !== block.submitLabel) out.push({ submitLabel: submit });
    if (block.type === "text" && md !== block.markdown) out.push({ markdown: md });
    return out;
  };
  const changes = patches();
  const move = (i: number, d: -1 | 1) => setCols((c) => {
    const n = [...c];
    const j = i + d;
    if (j < 0 || j >= n.length) return c;
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const label = (f: string) => entity?.fields.find((x) => x.name === f)?.label ?? f;
  // KPI tiles count from the records when their label says what to count, so renaming one can change its number.
  const kpiScreen = block.type === "kpis" ? bp.screens.find((s) => [...s.regions.main, ...s.regions.side].some((b) => b.id === block.id)) : undefined;
  const kpiValue = (i: number, l: string) => (block.type === "kpis" && block.items[i] ? deriveKpi({ ...block.items[i], label: l }, bp, screenEntityId(bp, kpiScreen?.id)) : null);

  return (
    <div className="flex h-full min-h-0 flex-col text-foreground" onClick={(e) => e.stopPropagation()}>
      <div className="flex shrink-0 items-center justify-between border-b border-hairline px-3 py-2.5">
        <div>
          <p className="micro-label text-amber">Tweak · free</p>
          <p className="text-[13px] font-medium">{BLOCK_LABELS[block.type]}{entity ? ` · ${entity.plural}` : ""}</p>
        </div>
        <button onClick={onClose} aria-label="Close" title="Close (Esc)" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {"title" in block && (
          <label className="block">
            <span className="micro-label">Title</span>
            <Input className="mt-1 h-8" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        )}
        {block.type === "table" && (
          <div>
            <span className="micro-label">Columns · top shows first (leftmost)</span>
            <ul className="mt-1.5 space-y-1" aria-label="Column order">
              {cols.map((c, i) => (
                <li
                  key={c}
                  tabIndex={0}
                  aria-label={`${label(c)}, column ${i + 1} of ${cols.length}. Alt plus up or down arrow moves it.`}
                  onKeyDown={(e) => {
                    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                    e.preventDefault();
                    move(i, e.key === "ArrowUp" ? -1 : 1);
                  }}
                  className="flex items-center gap-1 rounded-md border border-hairline bg-deep/60 px-2 py-1 text-[12.5px] outline-none focus-visible:border-amber/60"
                >
                  <span className="w-4 shrink-0 font-mono text-[10.5px] text-faint">{i + 1}</span>
                  <span className="flex-1 truncate">{label(c)}</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={`Move ${label(c)} up`} title="Move up (Alt+↑)"><ArrowUp className="size-3" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === cols.length - 1} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={`Move ${label(c)} down`} title="Move down (Alt+↓)"><ArrowDown className="size-3" /></button>
                  <button onClick={() => setCols((x) => (x.length > 1 ? x.filter((y) => y !== c) : x))} className="rounded p-0.5 text-muted-foreground hover:text-ask" aria-label={`Hide ${label(c)}`}><X className="size-3" /></button>
                </li>
              ))}
            </ul>
            {entity && entity.fields.some((f) => !cols.includes(f.name)) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {entity.fields.filter((f) => !cols.includes(f.name)).map((f) => (
                  <button key={f.name} onClick={() => setCols((x) => [...x, f.name].slice(0, 8))} className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
                    <Plus className="size-3" />{f.label ?? f.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {labels.length > 0 && (
          <div>
            <span className="micro-label">{block.type === "kpis" ? "Labels" : "Button text"}</span>
            <div className="mt-1.5 space-y-1.5">
              {labels.map((l, i) => {
                const k = kpiValue(i, l);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <Input className="h-8 min-w-0 flex-1" value={l} onChange={(e) => setLabels((x) => x.map((y, j) => (j === i ? e.target.value : y)))} />
                    {k && <span className="w-[72px] shrink-0 truncate text-right font-mono text-[11.5px] tabular-nums" title={k.derived ? "Counted from the records" : "As written in the plan: the label doesn't say what to count"}><span className={k.derived ? "text-read" : "text-muted-foreground"}>{k.value}</span></span>}
                  </div>
                );
              })}
            </div>
            {block.type === "kpis" && <p className="mt-1.5 text-[11px] leading-snug text-faint">Green numbers are counted from the records on this screen and update as you rename.</p>}
          </div>
        )}
        {block.type === "form" && (
          <label className="block">
            <span className="micro-label">Submit button</span>
            <Input className="mt-1 h-8" value={submit} onChange={(e) => setSubmit(e.target.value)} />
          </label>
        )}
        {block.type === "text" && (
          <label className="block">
            <span className="micro-label">Text</span>
            <Textarea className="mt-1 text-[12.5px]" rows={5} value={md} onChange={(e) => setMd(e.target.value)} />
          </label>
        )}
        {(block.type === "chat" || block.type === "timeline" || block.type === "list" || block.type === "detail") && (
          <p className="text-[12px] text-muted-foreground">Want it to behave differently? That&apos;s a bigger change. Ask for it and you&apos;ll get a Work Order with the price first.</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-hairline p-3">
        <Button size="sm" className="h-8" disabled={pending || changes.length === 0} onClick={() => save(changes, "Tweaked")}>
          {pending ? <Loader2 className="animate-spin" /> : null} Save · free
        </Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={onAsk}><MessageSquarePlus /> Ask for more</Button>
        <Button size="icon-sm" variant="ghost" className="ml-auto size-8 text-muted-foreground hover:text-ask" disabled={pending} onClick={() => save([{ hidden: true }], "Removed from the screen")} aria-label="Remove block from screen">
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
