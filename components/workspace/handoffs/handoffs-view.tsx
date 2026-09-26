"use client";
import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CircleDot, Eye, Loader2, MessageSquareText, UsersRound } from "lucide-react";
import type { HandoffRow } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/arch/badges";
import { Segmented } from "@/components/arch/segmented";
import { CodeView } from "@/components/arch/code-view";
import { TimeAgo } from "@/components/time-ago";
import { objectLabel, resolveRef } from "@/lib/blueprint";
import { filesFor, generateFiles } from "@/lib/codegen/files";
import { agentSummary, connectionSummary, screenSummary } from "@/lib/blueprint/describe";
import { resolveHandoff } from "@/lib/actions/handoff";
import { hash } from "@/lib/sim/hash";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";

export function HandoffsView({ initial }: { initial?: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const list = ws.handoffs;
  const [id, setId] = useState(initial && list.some((h) => h.id === initial) ? initial : list[0]?.id);
  const h = list.find((x) => x.id === id);
  const [view, setView] = useState<"teammate" | "you">("teammate");

  if (!list.length)
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="max-w-sm">
          <UsersRound className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-[14px] font-medium">No handoffs yet</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Use “Ask a teammate” on any screen, agent or connection. They get the object, your brief, your recent requests and the latest diff, and you get a plain-English answer back.</p>
          <Button className="mt-4" variant="outline" onClick={() => ws.openHandoff(null)}><UsersRound /> Ask a teammate</Button>
        </div>
      </div>
    );

  return (
    <div className="flex h-full min-h-0">
      <ul className="w-[300px] shrink-0 space-y-1.5 overflow-y-auto border-r border-hairline p-3 max-md:hidden">
        <li className="micro-label px-1 pb-1">Handoffs · {list.filter((x) => x.status !== "resolved").length} open</li>
        {list.map((x) => (
          <li key={x.id}>
            <button onClick={() => { setId(x.id); router.replace(`${pathname}?h=${x.id}`, { scroll: false }); }} className={cn("w-full rounded-xl border p-3 text-left", x.id === id ? "border-amber/50 bg-amber-soft" : "border-hairline bg-panel hover:border-[#343947]")}>
              <p className="flex items-center gap-2 text-[12px]">
                <span className={cn("size-1.5 rounded-full", x.status === "resolved" ? "bg-read" : "bg-change")} />
                <span className="font-medium">{x.assignee.split(" · ")[0]}</span>
                <TimeAgo iso={x.created_at} className="ml-auto text-[11px] text-faint" />
              </p>
              <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{x.prompt}</p>
              <p className="mt-1.5 truncate text-[11px] text-faint">About {x.context.objectLabel ?? objectLabel(ws.blueprint, x.object_ref)}</p>
            </button>
          </li>
        ))}
      </ul>
      {h && (
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-6 py-6">
            <div className="flex flex-wrap items-center gap-3">
              <Segmented ariaLabel="Whose view" value={view} onChange={setView} options={[{ value: "teammate", label: <><Eye className="size-3.5" />What {h.assignee.split(" ")[0]} sees</> }, { value: "you", label: "What you see" }]} />
              <span className="text-[12px] text-muted-foreground">Same handoff, two people. The engineer gets the code; you get the answer.</span>
            </div>
            {view === "teammate" ? <TeammateView h={h} /> : <RequesterView h={h} />}
          </div>
        </div>
      )}
    </div>
  );
}

function TeammateView({ h }: { h: HandoffRow }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [fileIdx, setFileIdx] = useState(0);
  const resolved = resolveRef(ws.blueprint, h.object_ref);
  const files = useMemo(() => {
    if (h.object_ref.type === "connection") return generateFiles(ws.blueprint).filter((f) => f.path === ".env.example" || f.path === "docker-compose.yml");
    if (h.object_ref.type === "block") {
      const s = ws.blueprint.screens.find((x) => [...x.regions.main, ...x.regions.side].some((b) => b.id === h.object_ref.id));
      return s ? filesFor(ws.blueprint, { type: "screen", id: s.id }) : [];
    }
    return filesFor(ws.blueprint, h.object_ref);
  }, [ws.blueprint, h.object_ref]);
  const summary = resolved?.type === "agent" ? agentSummary(ws.blueprint, resolved.value).sentence : resolved?.type === "connection" ? connectionSummary(ws.blueprint, resolved.value) : resolved?.type === "screen" ? screenSummary(ws.blueprint, resolved.value) : "";
  const mate = h.assignee.split(" · ");
  const file = files[Math.min(fileIdx, files.length - 1)];

  return (
    <div className="mt-5 space-y-4">
      <div className="panel rounded-xl p-4">
        <div className="flex items-center gap-3">
          <Avatar name={mate[0]} hue={hash(mate[0].split(" ")[0].toLowerCase()) % 360} size={32} />
          <div>
            <p className="text-[13px] font-medium">{mate[0]} <span className="font-normal text-muted-foreground">· {mate[1]}</span></p>
            <p className="text-[11.5px] text-muted-foreground">Request from {ws.user.name} · <TimeAgo iso={h.created_at} /></p>
          </div>
          <span className={cn("ml-auto rounded-full border px-2 py-0.5 text-[11px]", h.status === "resolved" ? "border-read/30 text-read" : "border-change/30 text-change")}>{h.status === "resolved" ? "Resolved" : "Open"}</span>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed">“{h.prompt}”</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel rounded-xl p-4">
          <p className="micro-label">The object</p>
          <p className="mt-1.5 text-[13.5px] font-medium">{h.context.objectLabel ?? objectLabel(ws.blueprint, h.object_ref)}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{summary}</p>
          <p className="mt-2 font-mono text-[11px] text-faint">{h.object_ref.type}:{h.object_ref.id}</p>
        </div>
        <div className="panel rounded-xl p-4">
          <p className="micro-label">How we got here</p>
          <ol className="mt-2 space-y-1.5">
            {(h.context.promptHistory ?? []).map((p, i) => (
              <li key={i} className="flex gap-2 text-[12.5px]"><MessageSquareText className="mt-0.5 size-3 shrink-0 text-muted-foreground" /><span className="line-clamp-2">{p}</span></li>
            ))}
          </ol>
        </div>
      </div>

      {h.context.lastDiff && (
        <div className="overflow-hidden rounded-xl border border-hairline">
          <p className="border-b border-hairline bg-panel px-3 py-2 text-[12px] font-medium">The latest change</p>
          <div className="code-face max-h-56 overflow-auto py-1 text-[12px] leading-[1.6]">
            {h.context.lastDiff.split("\n").map((l, i) => (
              <div key={i} className={cn("whitespace-pre px-3", l.startsWith("+") && !l.startsWith("+++") ? "bg-read/10 text-read" : l.startsWith("-") && !l.startsWith("---") ? "bg-ask/10 text-ask" : l.startsWith("@@") ? "text-change/80" : "text-foreground/60")}>{l || " "}</div>
            ))}
          </div>
        </div>
      )}

      {file && (
        <div className="overflow-hidden rounded-xl border border-hairline">
          <div className="flex gap-1 overflow-x-auto border-b border-hairline bg-panel px-2 py-1.5">
            {files.map((f, i) => <button key={f.path} onClick={() => setFileIdx(i)} className={cn("shrink-0 rounded px-2 py-0.5 font-mono text-[11px]", i === fileIdx ? "bg-raised text-foreground" : "text-muted-foreground")}>{f.path}</button>)}
          </div>
          <CodeView code={file.content} lang={file.lang} className="max-h-72" />
        </div>
      )}

      {h.status !== "resolved" ? (
        <div className="panel rounded-xl p-4">
          <label htmlFor="resolution" className="micro-label">Reply in plain English (it goes straight to {ws.user.name.split(" ")[0]}&apos;s activity)</label>
          <Textarea id="resolution" rows={2} className="mt-2 text-[13px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Leave empty to use the suggested summary of the fix." />
          <Button className="mt-3" disabled={pending} onClick={() => start(async () => { const r = await resolveHandoff(ws.project.id, h.id, note); if (!r.ok) return void toast.error(r.error ?? "Couldn't resolve"); toast.success("Resolved", { description: r.changelog }); router.refresh(); })}>
            {pending ? <Loader2 className="animate-spin" /> : <Check />} Resolve as {mate[0].split(" ")[0]} (simulated)
          </Button>
        </div>
      ) : (
        <p className="rounded-xl border border-read/30 bg-read/[0.06] p-4 text-[13px]">Resolved: {h.resolution}</p>
      )}
    </div>
  );
}

function RequesterView({ h }: { h: HandoffRow }) {
  const steps = [
    { label: "Sent with context", done: true, at: h.created_at },
    { label: `${h.assignee.split(" ")[0]} opened it`, done: true, at: h.created_at },
    { label: "Fixed and tested", done: h.status === "resolved", at: h.resolved_at },
  ];
  return (
    <div className="mt-5 space-y-4">
      <div className="panel rounded-xl p-5">
        <p className="micro-label">Your request</p>
        <p className="mt-1.5 text-[14px] leading-relaxed">“{h.prompt}”</p>
        <ol className="mt-5 space-y-3">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-3 text-[13px]">
              {s.done ? <Check className="size-4 text-read" /> : <CircleDot className="size-4 text-faint" />}
              <span className={cn(!s.done && "text-muted-foreground")}>{s.label}</span>
              {s.at && s.done && <TimeAgo iso={s.at} className="ml-auto text-[11.5px] text-faint" />}
            </li>
          ))}
        </ol>
      </div>
      {h.status === "resolved" ? (
        <div className="rounded-xl border border-change/30 bg-change/[0.06] p-5">
          <p className="micro-label text-change">What changed, in plain English</p>
          <p className="mt-2 text-[15px] leading-relaxed">{h.resolution}</p>
          <p className="mt-3 text-[12px] text-muted-foreground">It&apos;s in the test version now, and saved as a save point you can go back from.</p>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">You&apos;ll see the answer here and in your activity, no need to chase.</p>
      )}
    </div>
  );
}
