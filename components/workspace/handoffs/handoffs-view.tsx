"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, CircleDot, Eye, FileDiff, Loader2, MessageSquareText, Send, UsersRound } from "lucide-react";
import type { HandoffRow } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/arch/badges";
import { Segmented } from "@/components/arch/segmented";
import { CodeView } from "@/components/arch/code-view";
import { TimeAgo } from "@/components/time-ago";
import { objectLabel, resolveRef } from "@/lib/blueprint";
import { refToString } from "@/lib/blueprint/schema";
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
  // Your own view first: the handoff is your request, so it opens on what you asked and where it stands.
  const [view, setView] = useState<"teammate" | "you">("you");

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
                <span className="min-w-0 truncate"><span className="text-muted-foreground">You → </span><span className="font-medium">{x.assignee.split(" · ")[0]}</span></span>
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
              <Segmented ariaLabel="Whose view" value={view} onChange={setView} options={[{ value: "you", label: "What you see" }, { value: "teammate", label: <><Eye className="size-3.5" />What {h.assignee.split(" ")[0]} sees</> }]} />
              <span className="text-[12px] text-muted-foreground">Same handoff, two people. You get the answer; the engineer gets the code.</span>
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
  const [note, setNote] = useState("");
  const [fileIdx, setFileIdx] = useState(0);
  const files = useMemo(() => {
    if (h.object_ref.type === "connection") return generateFiles(ws.blueprint).filter((f) => f.path === ".env.example" || f.path === "docker-compose.yml");
    if (h.object_ref.type === "block") {
      const s = ws.blueprint.screens.find((x) => [...x.regions.main, ...x.regions.side].some((b) => b.id === h.object_ref.id));
      return s ? filesFor(ws.blueprint, { type: "screen", id: s.id }) : [];
    }
    return filesFor(ws.blueprint, h.object_ref);
  }, [ws.blueprint, h.object_ref]);
  const summary = objectSummary(ws.blueprint, h);
  const mate = h.assignee.split(" · ");
  const file = files[Math.min(fileIdx, files.length - 1)];
  const guest = ws.user.isAnonymous;
  const resolve = useResolve(h);

  return (
    <div className="mt-5 space-y-4">
      <div className="panel rounded-xl p-4">
        <FromTo h={h} />
        <Quote h={h} />
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
          <label htmlFor="resolution" className="micro-label">Reply in plain English (it goes straight to {guest ? "your" : `${ws.user.name.split(" ")[0]}'s`} activity)</label>
          <Textarea id="resolution" rows={2} className="mt-2 text-[13px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Leave empty to use the suggested summary of the fix." />
          <Button className="mt-3" disabled={resolve.pending} onClick={() => resolve.run(note)}>
            {resolve.pending ? <Loader2 className="animate-spin" /> : <Check />} Resolve as {mate[0].split(" ")[0]} (simulated)
          </Button>
        </div>
      ) : (
        <p className="rounded-xl border border-read/30 bg-read/[0.06] p-4 text-[13px]">Resolved: {h.resolution}</p>
      )}
    </div>
  );
}

/** The object's plain-English summary, the same sentence the Inspector shows. */
function objectSummary(bp: ReturnType<typeof useWorkspace>["blueprint"], h: HandoffRow): string {
  const resolved = resolveRef(bp, h.object_ref);
  return resolved?.type === "agent" ? agentSummary(bp, resolved.value).sentence : resolved?.type === "connection" ? connectionSummary(bp, resolved.value) : resolved?.type === "screen" ? screenSummary(bp, resolved.value) : "";
}

const mateOf = (h: HandoffRow) => {
  const [name, role] = h.assignee.split(" · ");
  return { name, role, first: name.split(" ")[0], hue: hash(name.split(" ")[0].toLowerCase()) % 360 };
};

/** Your own avatar, drawn exactly like the account button in the top bar. */
function YouAvatar({ size = 24 }: { size?: number }) {
  const ws = useWorkspace();
  const style = { width: size, height: size, fontSize: size * 0.42 };
  return ws.user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={ws.user.avatarUrl} alt="" style={style} className="shrink-0 rounded-full border border-hairline" />
  ) : (
    <span aria-hidden style={style} className="grid shrink-0 place-items-center rounded-full border border-hairline bg-raised font-semibold">{ws.user.name.slice(0, 1).toUpperCase()}</span>
  );
}

function StatusPill({ h }: { h: HandoffRow }) {
  return <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px]", h.status === "resolved" ? "border-read/30 text-read" : "border-change/30 text-change")}>{h.status === "resolved" ? "Resolved" : "Open"}</span>;
}

/** "From you → Priya": the request is yours, so your avatar leads and the teammate is who it went to. */
function FromTo({ h }: { h: HandoffRow }) {
  const ws = useWorkspace();
  const mate = mateOf(h);
  const you = ws.user.isAnonymous ? "You (guest)" : "You";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px]">
      <span className="micro-label">From</span>
      <YouAvatar />
      <span className="font-medium" title={ws.user.isAnonymous ? undefined : ws.user.name}>{you}</span>
      <ArrowRight className="size-3.5 text-faint" aria-label="to" />
      <Avatar name={mate.name} hue={mate.hue} size={24} />
      <span className="font-medium">{mate.name}</span>
      <span className="text-muted-foreground max-sm:hidden">· {mate.role}</span>
      <span className="ml-auto flex items-center gap-2">
        <TimeAgo iso={h.created_at} className="text-[11.5px] text-faint" />
        <StatusPill h={h} />
      </span>
    </div>
  );
}

function Quote({ h }: { h: HandoffRow }) {
  return (
    <div className="mt-3 flex gap-3">
      <span aria-hidden className="mt-1 w-0.5 shrink-0 self-stretch rounded-full bg-amber/50" />
      <p className="text-[14px] leading-relaxed">“{h.prompt}”</p>
    </div>
  );
}

/** Resolving is simulated in this prototype: the teammate answers with a small, real change where one applies. */
function useResolve(h: HandoffRow) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (note = "") =>
    start(async () => {
      const r = await resolveHandoff(ws.project.id, h.id, note);
      if (!r.ok) return void toast.error(r.error ?? "Couldn't resolve");
      toast.success("Resolved", { description: r.changelog });
      router.refresh();
    });
  return { pending, run };
}

/** Files and line counts in the diff that went with the request, so you can see what was shared without reading code. */
function diffFilesOf(diff: string | undefined): { path: string; add: number; del: number }[] {
  const out: { path: string; add: number; del: number }[] = [];
  for (const l of (diff ?? "").split("\n")) {
    if (l.startsWith("+++ ")) out.push({ path: l.replace(/^\+\+\+ (b\/)?/, ""), add: 0, del: 0 });
    else if (out.length && l.startsWith("+")) out[out.length - 1].add++;
    else if (out.length && l.startsWith("-") && !l.startsWith("--- ")) out[out.length - 1].del++;
  }
  return out;
}

function RequesterView({ h }: { h: HandoffRow }) {
  const ws = useWorkspace();
  const mate = mateOf(h);
  const resolve = useResolve(h);
  const label = h.context.objectLabel ?? objectLabel(ws.blueprint, h.object_ref);
  const summary = objectSummary(ws.blueprint, h);
  const [brief, ...requests] = h.context.promptHistory ?? [];
  const changed = diffFilesOf(h.context.lastDiff);
  const done = h.status === "resolved";
  const steps: { label: string; state: "done" | "active" | "pending"; at?: string | null }[] = [
    { label: "You sent it with the context below", state: "done", at: h.created_at },
    { label: `In ${mate.first}'s activity`, state: "done", at: h.created_at },
    { label: done ? `${mate.first} fixed and tested it` : `Waiting on ${mate.first}`, state: done ? "done" : "active", at: h.resolved_at },
    { label: "The answer comes back to you in plain English", state: done ? "done" : "pending", at: h.resolved_at },
  ];
  return (
    <div className="mt-5 space-y-4">
      <div className="panel rounded-xl p-4">
        <FromTo h={h} />
        <Quote h={h} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel flex flex-col rounded-xl p-4">
          <p className="micro-label">About</p>
          <p className="mt-1.5 text-[13.5px] font-medium">{label}</p>
          <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">{summary || `The ${h.object_ref.type} this request is about.`}</p>
          <Link href={`/p/${ws.project.id}/blueprint?sel=${encodeURIComponent(refToString(h.object_ref))}`} className="mt-3 inline-flex w-fit items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
            Open it in the plan <ArrowRight className="size-3" />
          </Link>
        </div>
        <div className="panel rounded-xl p-4">
          <p className="micro-label">Where it stands</p>
          <ol className="mt-2.5 space-y-2.5">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-2.5 text-[12.5px]">
                {s.state === "done" ? <Check className="size-3.5 shrink-0 text-read" /> : s.state === "active" ? <span className="grid size-3.5 shrink-0 place-items-center"><span className="size-2 rounded-full bg-change pulse-ring" /></span> : <CircleDot className="size-3.5 shrink-0 text-faint" />}
                <span className={cn("min-w-0", s.state === "pending" && "text-muted-foreground", s.state === "active" && "text-change")}>{s.label}</span>
                {s.at && s.state === "done" && <TimeAgo iso={s.at} className="ml-auto shrink-0 text-[11px] text-faint" />}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="panel rounded-xl p-4">
        <p className="micro-label">What {mate.first} got with it</p>
        <div className="mt-2.5 grid gap-4 text-[12.5px] md:grid-cols-3">
          <div>
            <p className="flex items-center gap-1.5 font-medium"><Send className="size-3.5 text-muted-foreground" />Your brief</p>
            <p className="mt-1 line-clamp-3 text-muted-foreground">{brief ?? ws.project.brief}</p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 font-medium"><MessageSquareText className="size-3.5 text-muted-foreground" />Your recent requests</p>
            {requests.length ? (
              <ul className="mt-1 space-y-1 text-muted-foreground">{requests.slice(0, 3).map((r, i) => <li key={i} className="line-clamp-2">{r}</li>)}</ul>
            ) : (
              <p className="mt-1 text-muted-foreground">None yet, so just the brief.</p>
            )}
          </div>
          <div>
            <p className="flex items-center gap-1.5 font-medium"><FileDiff className="size-3.5 text-muted-foreground" />The latest change</p>
            {changed.length ? (
              <ul className="mt-1 space-y-1">
                {changed.slice(0, 3).map((f) => (
                  <li key={f.path} className="flex items-center gap-2 text-muted-foreground">
                    <span className="min-w-0 truncate font-mono text-[11.5px]" title={f.path}>{f.path}</span>
                    <span className="ml-auto shrink-0 font-mono text-[11px]"><span className="text-read">+{f.add}</span> <span className="text-ask">−{f.del}</span></span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">No code changes yet.</p>
            )}
          </div>
        </div>
      </div>

      {done ? (
        <div className="rounded-xl border border-change/30 bg-change/[0.06] p-4">
          <div className="flex items-center gap-2.5">
            <Avatar name={mate.name} hue={mate.hue} size={28} />
            <p className="text-[13px] font-medium">{mate.name} replied</p>
            {h.resolved_at && <TimeAgo iso={h.resolved_at} className="ml-auto text-[11.5px] text-faint" />}
          </div>
          <p className="mt-2.5 text-[15px] leading-relaxed">{h.resolution}</p>
          <p className="mt-3 text-[12px] text-muted-foreground">It&apos;s in the test version now, and saved as a save point you can go back from.</p>
        </div>
      ) : (
        <div className="panel flex flex-wrap items-center gap-3 rounded-xl p-4">
          <p className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">
            You&apos;ll see {mate.first}&apos;s answer here and in your activity, no need to chase. In this prototype {mate.first} is simulated, so you can play their part.
          </p>
          <Button variant="outline" size="sm" className="h-8" disabled={resolve.pending} onClick={() => resolve.run()}>
            {resolve.pending ? <Loader2 className="animate-spin" /> : <Check />} Resolve as {mate.first} (simulated)
          </Button>
        </div>
      )}
    </div>
  );
}
