"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, MessageSquare, Monitor, MousePointer2, Pencil, Smartphone, Tablet, UsersRound, X } from "lucide-react";
import type { Block, Screen } from "@/lib/blueprint/schema";
import type { CommentRow } from "@/lib/db/types";
import { SpecApp } from "@/components/renderer/spec-app";
import { Segmented } from "@/components/arch/segmented";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { BLOCK_LABELS, blockTitle } from "@/lib/blueprint";
import { addComment, resolveComment } from "@/lib/actions/comments";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";
import { TweakPanel } from "./tweak-panel";

type Mode = "use" | "tweak" | "comment";
type Device = "desktop" | "tablet" | "phone";
const WIDTH: Record<Device, string> = { desktop: "100%", tablet: "834px", phone: "390px" };

/**
 * The device that fits the screen you're on: a phone frame below 640px, a tablet frame up to
 * 1024px, desktop above. It follows rotation and resizing until you pick a device yourself.
 */
const PHONE_MQ = "(width < 40rem)";
const TABLET_MQ = "(width < 64rem)";
function subscribeViewport(cb: () => void) {
  const mqs = [window.matchMedia(PHONE_MQ), window.matchMedia(TABLET_MQ)];
  mqs.forEach((m) => m.addEventListener("change", cb));
  return () => mqs.forEach((m) => m.removeEventListener("change", cb));
}
function viewportDevice(): Device {
  return window.matchMedia(PHONE_MQ).matches ? "phone" : window.matchMedia(TABLET_MQ).matches ? "tablet" : "desktop";
}
/** The studio's own address. The live app is served from it at /live/<slug>, so that is the honest URL to show. */
const noSubscribe = () => () => {};
const studioOrigin = () => window.location.origin;

export function PreviewView({ comments }: { comments: CommentRow[] }) {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const bp = ws.blueprint;
  const [mode, setMode] = useState<Mode>(params.get("tweak") ? "tweak" : "use");
  const fits = useSyncExternalStore(subscribeViewport, viewportDevice, () => "desktop" as Device);
  const origin = useSyncExternalStore(noSubscribe, studioOrigin, () => "");
  const liveUrl = ws.liveSlug ? `${origin}/live/${ws.liveSlug}` : null;
  const [picked, setDevice] = useState<Device | null>(null);
  const device = picked ?? fits;
  const urlScreen = params.get("screen");
  const [localScreen, setScreenId] = useState(bp.screens[0].id);
  const screenId = urlScreen && bp.screens.some((s) => s.id === urlScreen) ? urlScreen : localScreen;
  const [tweaking, setTweaking] = useState<string | null>(params.get("tweak"));
  const [draftPin, setDraftPin] = useState<{ blockId: string; x: number; y: number } | null>(null);
  const open = useMemo(() => comments.filter((c) => !c.resolved), [comments]);
  const built = ws.project.buildState === "built";
  const screen = bp.screens.find((s) => s.id === screenId) ?? bp.screens[0];
  // Unresolved comments show as dots in the app's own navigation, the one place screens are switched.
  const navMarks = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of open) m[c.screen_id] = (m[c.screen_id] ?? 0) + 1;
    return m;
  }, [open]);
  const tweakBlockSpec = tweaking ? [...screen.regions.main, ...screen.regions.side].find((b) => b.id === tweaking) : undefined;

  // Escape closes the docked Tweak panel, as it did when it floated.
  useEffect(() => {
    if (!tweaking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTweaking(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tweaking]);

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
    >
      {node}
    </BlockFrame>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-panel px-4 py-2">
        {/* Screens are switched in the app's own navigation, like the people using it will. This only says where you are. */}
        <p className="flex min-w-0 items-center gap-2 text-ui" aria-live="polite">
          <span className="text-muted-foreground">Screen</span>
          <span className="truncate font-medium">{screen.title}</span>
          <span className="shrink-0 text-meta tabular-nums text-faint">{bp.screens.findIndex((s) => s.id === screen.id) + 1}/{bp.screens.length}</span>
          {navMarks[screen.id] ? <span className="inline-flex shrink-0 items-center gap-1 text-meta tabular-nums text-muted-foreground" title="Open comments on this screen"><MessageSquare className="size-3" />{navMarks[screen.id]}</span> : null}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
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
              { value: "tweak", label: <><Pencil className="size-3.5" />Tweak</>, title: "Point at anything to edit it, free" },
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
            <Button asChild variant="outline">
              <a href={`/live/${ws.liveSlug}`} target="_blank" rel="noreferrer" title={liveUrl ? `Opens ${liveUrl}` : undefined}>Live version <ExternalLink /></a>
            </Button>
          )}
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1">
        <div className="dot-grid relative min-h-0 min-w-0 flex-1 overflow-auto p-3 sm:p-5">
          <div className="mb-2 flex items-center justify-center gap-2 text-meta text-muted-foreground">
            {/* The browser bar says this on desktop and tablet; the phone frame has no bar, so it's said here. */}
            {device === "phone" && <Pill size="md" dot>Test version · only you can see this</Pill>}
            {!built && <Pill size="md">Plan only: this is what will be built</Pill>}
            {mode === "tweak" && <span>{tweaking ? "Editing the outlined block. The panel stays beside the app, never on top of it." : "Point at anything and click to edit it. Tweaks are free."}</span>}
            {mode === "comment" && <span>Click a spot to pin a note. Teammates see it in their activity.</span>}
          </div>
          <div
            className={cn(
              "relative mx-auto flex min-w-0 flex-col",
              // Morph only when you switch devices, not when the first paint settles on the one that fits.
              picked && "transition-[width,border-radius,padding] duration-450 ease-paper",
              device === "phone"
                ? // A light bezel drawn with one thin pencil line. The phone's own corners are a drawing of the device, not a UI radius.
                  "rounded-[46px] border-[1.5px] border-foreground/75 bg-raised p-[9px] shadow-float"
                : "rounded-lg border border-hairline-hi bg-raised shadow-float",
            )}
            style={{ width: device === "phone" ? 412 : WIDTH[device], maxWidth: "100%", height: device === "phone" ? "min(820px, calc(100% - 28px))" : "calc(100% - 28px)", minHeight: 560 }}
          >
            {device === "phone" ? (
              <span aria-hidden className="absolute left-1/2 top-[17px] z-20 h-[22px] w-[92px] -translate-x-1/2 rounded-full bg-foreground" />
            ) : (
              // Honest chrome: the test version has no public address (only you can open it), so the bar says that
              // instead of inventing a domain. The live app's real address is shown beside it once there is one.
              <div className="flex h-9 shrink-0 items-center gap-3 rounded-t-lg border-b border-hairline bg-panel px-3">
                <span aria-hidden className="flex shrink-0 gap-1.5"><i className="size-2.5 rounded-full border border-line-strong" /><i className="size-2.5 rounded-full border border-line-strong" /><i className="size-2.5 rounded-full border border-line-strong" /></span>
                <span className="mx-auto flex h-6 min-w-0 max-w-[360px] flex-1 items-center justify-center gap-1.5 rounded-md border border-hairline bg-canvas px-3 text-meta text-muted-foreground">
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand" />
                  <span className="truncate">Test version · only you</span>
                </span>
                {liveUrl ? (
                  <a href={`/live/${ws.liveSlug}`} target="_blank" rel="noreferrer" title={`The live version is at ${liveUrl}`} className="hidden min-w-0 max-w-[40%] shrink items-center gap-1 truncate font-mono text-badge text-muted-foreground transition-colors duration-150 hover:text-foreground md:inline-flex">
                    <span className="shrink-0 font-sans text-muted-foreground">Live:</span>
                    <span className="truncate">{liveUrl.replace(/^https?:\/\//, "")}</span>
                    <ExternalLink className="size-3 shrink-0" aria-hidden />
                  </a>
                ) : (
                  <span aria-hidden className="w-[46px] shrink-0" />
                )}
              </div>
            )}
            {/* overflow-clip, not hidden: it rounds the screen's corners but is never itself scrolled (by focus or scrollIntoView),
                so wide tables keep scrolling sideways in their own container, with its fade, instead of being cut off. */}
            <div className={cn("min-h-0 min-w-0 flex-1 overflow-clip", device === "phone" ? "rounded-[36px] ring-1 ring-hairline" : "rounded-b-lg")}>
              <SpecApp bp={bp} mode="preview" device={device} screenId={screenId} onScreenChange={changeScreen} projectId={ws.project.id} wrapBlock={mode === "use" ? undefined : wrap} navMarks={navMarks} />
            </div>
          </div>
        </div>
        {/* Docked beside the app (below it on phones), so it never covers the block being tweaked. */}
        {mode === "tweak" && tweakBlockSpec && (
          <aside aria-label="Tweak" className="fade-up flex w-[340px] shrink-0 flex-col border-l border-hairline bg-panel max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:h-[55%] max-md:w-auto max-md:border-l-0 max-md:border-t max-md:shadow-float">
            <TweakPanel
              key={tweakBlockSpec.id}
              projectId={ws.project.id}
              block={tweakBlockSpec}
              bp={bp}
              onClose={() => setTweaking(null)}
              onAsk={() => {
                setTweaking(null);
                ws.focusComposer({ type: "block", id: tweakBlockSpec.id });
              }}
            />
          </aside>
        )}
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
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const label = `${screen.title} › ${blockTitle(block)}`;
  // The dock narrows the frame as it opens; once it settles, keep the block being tweaked in view.
  useEffect(() => {
    if (!selected) return;
    const t = setTimeout(() => ref.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }), 360);
    return () => clearTimeout(t);
  }, [selected]);
  return (
    <div
      ref={ref}
      className={cn("group/frame relative rounded-[calc(var(--app-radius)+6px)]", mode === "tweak" && "cursor-pointer", mode === "comment" && "cursor-crosshair")}
      onClickCapture={(e) => {
        if (mode === "use") return;
        // This capture handler runs before anything inside the block. Clicks on a pin or
        // on the draft note belong to them (open a thread, type, Pin it, Cancel).
        if ((e.target as Element).closest("[data-pin], [data-pin-draft]")) return;
        e.preventDefault();
        e.stopPropagation();
        if (mode === "tweak") onTweak();
        if (mode === "comment" && ref.current) {
          const r = ref.current.getBoundingClientRect();
          onPin(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
        }
      }}
    >
      <div className={cn("pointer-events-none absolute -inset-1.5 z-10 rounded-[calc(var(--app-radius)+8px)] border-2 border-transparent transition-colors duration-150", mode === "tweak" && "group-hover/frame:border-brand/80", selected && "border-brand")} />
      {mode === "tweak" && (
        <span className={cn("pointer-events-none absolute -top-3.5 left-2 z-20 rounded-sm bg-brand px-1.5 py-0.5 text-badge font-medium text-primary-foreground shadow-hair opacity-0 transition-opacity duration-150 group-hover/frame:opacity-100", selected && "opacity-100")}>
          {label} · {BLOCK_LABELS[block.type]}
        </span>
      )}
      {children}
      {comments.map((c, i) => <CommentPin key={c.id} comment={c} n={i + 1} />)}
      {draftPin && <DraftPin x={draftPin.x} y={draftPin.y} screenId={screen.id} blockId={block.id} onDone={onCancelPin} />}
    </div>
  );
}

function CommentPin({ comment, n }: { comment: CommentRow; n: number }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div data-pin className="absolute z-30" style={{ left: `${comment.x}%`, top: `${comment.y}%` }} onClick={(e) => e.stopPropagation()}>
      {/* A pin is ink: blue is kept for "may change", so comments never borrow it. */}
      <button type="button" onClick={() => setOpen((o) => !o)} className="grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full rounded-bl-none border-2 border-raised bg-foreground text-badge font-bold tabular-nums text-primary-foreground shadow-float" aria-label={`Comment ${n}: ${comment.body}`}>
        {n}
      </button>
      {open && (
        <div className="panel-raised absolute left-4 top-2 w-64 rounded-lg p-3 text-foreground">
          <p className="text-meta text-muted-foreground">{comment.author_name ?? "Teammate"}</p>
          <p className="mt-1 text-body">{comment.body}</p>
          <div className="mt-3 flex gap-1.5">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { await resolveComment(ws.project.id, comment.id); toast.success("Resolved"); router.refresh(); })}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />} Resolve
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setOpen(false); ws.openHandoff(comment.block_id ? { type: "block", id: comment.block_id } : { type: "screen", id: comment.screen_id }); }}>
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
    <div data-pin-draft className="absolute z-40" style={{ left: `${x}%`, top: `${y}%` }} onClick={(e) => e.stopPropagation()}>
      <span className="block size-7 -translate-x-1/2 -translate-y-1/2 rounded-full rounded-bl-none border-2 border-raised bg-brand shadow-float" />
      <div className="panel-raised absolute left-4 top-2 w-72 rounded-lg p-3 text-foreground">
        <label htmlFor="pin-text" className="micro-label">Note for your team</label>
        <textarea id="pin-text" autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onDone()} className="mt-1.5 w-full resize-none rounded-md border border-input bg-raised p-2 text-body outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/75 hover:border-line-strong focus:border-brand focus:ring-3 focus:ring-brand/20" placeholder="What should change here?" />
        <div className="mt-2 flex gap-1.5">
          <Button
            type="button"
            size="sm"
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
          <Button type="button" size="sm" variant="ghost" onClick={onDone}><X /> Cancel</Button>
        </div>
      </div>
    </div>
  );
}
