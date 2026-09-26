"use client";
import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, MessageSquare, Monitor, MousePointer2, Pencil, Smartphone, Tablet, UsersRound, X } from "lucide-react";
import type { Block, Screen } from "@/lib/blueprint/schema";
import type { CommentRow } from "@/lib/db/types";
import { SpecApp } from "@/components/renderer/spec-app";
import { Segmented } from "@/components/arch/segmented";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { BLOCK_LABELS, blockTitle } from "@/lib/blueprint";
import { addComment, resolveComment } from "@/lib/actions/comments";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";
import { TweakPanel } from "./tweak-panel";

type Mode = "use" | "tweak" | "comment";
type Device = "desktop" | "tablet" | "phone";
const WIDTH: Record<Device, string> = { desktop: "100%", tablet: "834px", phone: "390px" };

export function PreviewView({ comments }: { comments: CommentRow[] }) {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const bp = ws.blueprint;
  const [mode, setMode] = useState<Mode>(params.get("tweak") ? "tweak" : "use");
  const [device, setDevice] = useState<Device>("desktop");
  const urlScreen = params.get("screen");
  const [localScreen, setScreenId] = useState(bp.screens[0].id);
  const screenId = urlScreen && bp.screens.some((s) => s.id === urlScreen) ? urlScreen : localScreen;
  const [tweaking, setTweaking] = useState<string | null>(params.get("tweak"));
  const [draftPin, setDraftPin] = useState<{ blockId: string; x: number; y: number } | null>(null);
  const open = comments.filter((c) => !c.resolved);
  const built = ws.project.buildState === "built";

  const changeScreen = (id: string) => {
    setScreenId(id);
    setTweaking(null);
    const sp = new URLSearchParams(params.toString());
    sp.set("screen", id);
    sp.delete("tweak");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const wrap = (block: Block, screen: Screen, node: React.ReactNode) => (
    <BlockFrame
      key={block.id}
      block={block}
      screen={screen}
      mode={mode}
      selected={tweaking === block.id}
      comments={open.filter((c) => c.block_id === block.id && c.screen_id === screen.id)}
      draftPin={draftPin?.blockId === block.id ? draftPin : null}
      onTweak={() => setTweaking(block.id)}
      onPin={(x, y) => setDraftPin({ blockId: block.id, x, y })}
      onCancelPin={() => setDraftPin(null)}
      tweakPanel={
        tweaking === block.id ? (
          <TweakPanel
            projectId={ws.project.id}
            block={block}
            bp={bp}
            onClose={() => setTweaking(null)}
            onAsk={() => {
              setTweaking(null);
              ws.focusComposer({ type: "block", id: block.id });
            }}
          />
        ) : null
      }
    >
      {node}
    </BlockFrame>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-2">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto" role="tablist" aria-label="Screens">
          {bp.screens.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === screenId} onClick={() => changeScreen(s.id)} className={cn("shrink-0 rounded-md px-2.5 py-1 text-[12.5px]", s.id === screenId ? "bg-raised text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {s.title}
              {open.some((c) => c.screen_id === s.id) && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-change align-middle" />}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Segmented<Mode>
            ariaLabel="Preview mode"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setTweaking(null);
              setDraftPin(null);
            }}
            options={[
              { value: "use", label: <><MousePointer2 className="size-3.5" />Use</>, title: "Use the app like a real person" },
              { value: "tweak", label: <><Pencil className="size-3.5" />Tweak</>, title: "Point at anything to edit it — free" },
              { value: "comment", label: <><MessageSquare className="size-3.5" />Comment{open.length ? ` ${open.length}` : ""}</>, title: "Pin a note for a teammate" },
            ]}
          />
          <Segmented<Device>
            ariaLabel="Device"
            value={device}
            onChange={setDevice}
            options={[
              { value: "desktop", label: <Monitor className="size-3.5" />, title: "Desktop" },
              { value: "tablet", label: <Tablet className="size-3.5" />, title: "Tablet" },
              { value: "phone", label: <Smartphone className="size-3.5" />, title: "Phone" },
            ]}
          />
          {ws.liveSlug && (
            <Button asChild variant="outline" size="sm" className="h-8">
              <a href={`/live/${ws.liveSlug}`} target="_blank" rel="noreferrer">Live version <ExternalLink /></a>
            </Button>
          )}
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto bg-[radial-gradient(ellipse_at_50%_-10%,rgb(245_165_36/0.07),transparent_55%),radial-gradient(circle_at_50%_0%,#161920,#0a0b0e_70%)] p-5">
        <div className="mb-2 flex items-center justify-center gap-2 text-[11.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-panel px-2.5 py-0.5"><span className="size-1.5 rounded-full bg-amber" />Test version · only you can see this</span>
          {!built && <span className="rounded-full border border-amber/30 bg-amber-soft px-2.5 py-0.5 text-amber">Plan only — this is what will be built</span>}
          {mode === "tweak" && <span>Point at anything and click to edit it. Tweaks are free.</span>}
          {mode === "comment" && <span>Click a spot to pin a note. Teammates see it in their activity.</span>}
        </div>
        <div
          className={cn(
            "relative mx-auto flex flex-col transition-[width,border-radius,padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            device === "phone"
              ? "rounded-[46px] bg-[linear-gradient(160deg,#2a2d35,#0c0d11_40%,#1b1d23)] p-[11px] shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_40px_100px_-20px_rgb(0_0_0/0.9),0_0_80px_-30px_rgb(245_165_36/0.35)]"
              : "rounded-xl border border-hairline-hi bg-deep shadow-[0_40px_100px_-30px_rgb(0_0_0/0.9),0_0_0_1px_rgb(255_255_255/0.02),0_0_90px_-40px_rgb(245_165_36/0.3)]",
          )}
          style={{ width: device === "phone" ? 412 : WIDTH[device], maxWidth: "100%", height: device === "phone" ? "min(820px, calc(100% - 28px))" : "calc(100% - 28px)", minHeight: 560 }}
        >
          {device === "phone" ? (
            <span aria-hidden className="absolute left-1/2 top-[19px] z-20 h-[22px] w-[92px] -translate-x-1/2 rounded-full bg-black shadow-[inset_0_0_0_1px_rgb(255_255_255/0.05)]" />
          ) : (
            <div aria-hidden className="flex h-9 shrink-0 items-center gap-3 rounded-t-xl border-b border-hairline bg-[linear-gradient(180deg,#171a20,#121419)] px-3">
              <span className="flex gap-1.5"><i className="size-2.5 rounded-full bg-[#ff5f57]/80" /><i className="size-2.5 rounded-full bg-[#febc2e]/80" /><i className="size-2.5 rounded-full bg-[#28c840]/80" /></span>
              <span className="mx-auto flex h-6 min-w-0 max-w-[360px] flex-1 items-center justify-center gap-1.5 truncate rounded-md border border-hairline bg-deep px-3 font-mono text-[11px] text-muted-foreground">
                <span className="size-1.5 shrink-0 rounded-full bg-amber shadow-[0_0_8px_rgb(245_165_36/0.9)]" />
                test.{bp.meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.architect.app
              </span>
              <span className="w-[46px]" />
            </div>
          )}
          <div className={cn("min-h-0 flex-1 overflow-hidden", device === "phone" ? "rounded-[36px]" : "rounded-b-xl")}>
            <SpecApp bp={bp} mode="preview" device={device} screenId={screenId} onScreenChange={changeScreen} projectId={ws.project.id} wrapBlock={mode === "use" ? undefined : wrap} />
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockFrame({
  block,
  screen,
  mode,
  selected,
  comments,
  draftPin,
  onTweak,
  onPin,
  onCancelPin,
  tweakPanel,
  children,
}: {
  block: Block;
  screen: Screen;
  mode: Mode;
  selected: boolean;
  comments: CommentRow[];
  draftPin: { x: number; y: number } | null;
  onTweak: () => void;
  onPin: (x: number, y: number) => void;
  onCancelPin: () => void;
  tweakPanel: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const label = `${screen.title} › ${blockTitle(block)}`;
  return (
    <Popover open={Boolean(tweakPanel)}>
      <PopoverAnchor asChild>
        <div
          ref={ref}
          className={cn("group/frame relative rounded-[calc(var(--app-radius)+6px)]", mode === "tweak" && "cursor-pointer", mode === "comment" && "cursor-crosshair")}
          onClickCapture={(e) => {
            if (mode === "use") return;
            e.preventDefault();
            e.stopPropagation();
            if (mode === "tweak") onTweak();
            if (mode === "comment" && ref.current) {
              const r = ref.current.getBoundingClientRect();
              onPin(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
            }
          }}
        >
          <div className={cn("pointer-events-none absolute -inset-1.5 z-10 rounded-[calc(var(--app-radius)+8px)] border-2 border-transparent transition-colors", mode === "tweak" && "group-hover/frame:border-amber/80", selected && "border-amber")} />
          {mode === "tweak" && (
            <span className={cn("pointer-events-none absolute -top-3.5 left-2 z-20 rounded-md bg-amber px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#1a1206] opacity-0 transition-opacity group-hover/frame:opacity-100", selected && "opacity-100")}>
              {label} · {BLOCK_LABELS[block.type]}
            </span>
          )}
          {children}
          {comments.map((c, i) => <CommentPin key={c.id} comment={c} n={i + 1} />)}
          {draftPin && <DraftPin x={draftPin.x} y={draftPin.y} screenId={screen.id} blockId={block.id} onDone={onCancelPin} />}
        </div>
      </PopoverAnchor>
      <PopoverContent side="right" align="start" className="w-auto border-0 bg-transparent p-0 shadow-none" onOpenAutoFocus={(e) => e.preventDefault()}>
        {tweakPanel}
      </PopoverContent>
    </Popover>
  );
}

function CommentPin({ comment, n }: { comment: CommentRow; n: number }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="absolute z-30" style={{ left: `${comment.x}%`, top: `${comment.y}%` }} onClickCapture={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((o) => !o)} className="grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full rounded-bl-none border-2 border-white bg-[#5b9cff] text-[11px] font-bold text-white shadow-lg" aria-label={`Comment ${n}: ${comment.body}`}>
        {n}
      </button>
      {open && (
        <div className="panel-raised absolute left-4 top-2 w-64 rounded-xl p-3 text-foreground">
          <p className="text-[11.5px] text-muted-foreground">{comment.author_name ?? "Teammate"}</p>
          <p className="mt-1 text-[13px] leading-relaxed">{comment.body}</p>
          <div className="mt-3 flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7" disabled={pending} onClick={() => start(async () => { await resolveComment(ws.project.id, comment.id); toast.success("Resolved"); router.refresh(); })}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />} Resolve
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => { setOpen(false); ws.openHandoff(comment.block_id ? { type: "block", id: comment.block_id } : { type: "screen", id: comment.screen_id }); }}>
              <UsersRound /> Hand off
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DraftPin({ x, y, screenId, blockId, onDone }: { x: number; y: number; screenId: string; blockId: string; onDone: () => void }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="absolute z-40" style={{ left: `${x}%`, top: `${y}%` }} onClickCapture={(e) => e.stopPropagation()}>
      <span className="block size-7 -translate-x-1/2 -translate-y-1/2 rounded-full rounded-bl-none border-2 border-white bg-amber shadow-lg" />
      <div className="panel-raised absolute left-4 top-2 w-72 rounded-xl p-3 text-foreground">
        <label htmlFor="pin-text" className="micro-label">Note for your team</label>
        <textarea id="pin-text" autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} className="mt-1.5 w-full resize-none rounded-md border border-hairline bg-deep p-2 text-[13px] outline-none focus:border-amber/50" placeholder="What should change here?" />
        <div className="mt-2 flex gap-1.5">
          <Button
            size="sm"
            className="h-7"
            disabled={!text.trim() || pending}
            onClick={() =>
              start(async () => {
                const r = await addComment(ws.project.id, { screenId, blockId, x, y, body: text });
                if (!r.ok) return void toast.error(r.error);
                toast.success("Pinned", { description: "It's in the activity feed for your team." });
                onDone();
                router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : null} Pin it
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={onDone}><X /> Cancel</Button>
        </div>
      </div>
    </div>
  );
}
