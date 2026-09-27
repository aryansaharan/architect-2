"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowUpRight, Monitor, MousePointerClick, NotebookPen, Play, Rocket, Smartphone, Tablet, X } from "lucide-react";
import type { Block, ObjectRef, Screen } from "@/lib/blueprint/schema";
import { SpecApp, type WrapBlock } from "@/components/renderer/spec-app";
import { Button } from "@/components/ui/button";
import { blockTitle } from "@/lib/blueprint";
import { cn } from "@/lib/utils";
import { PencilRadio } from "./pencil-radio";
import { plural, reducedMotion, useSheet } from "./use-sheet";

type Device = "desktop" | "tablet" | "phone";

/** The device that fits the window: phone below 640px, tablet below 1024px. Followed until you pick one. */
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

/** Names for what you point at, in the Sheet's words. */
const PART: Partial<Record<Block["type"], string>> = { chat: "AI helper chat", kpis: "Key numbers", detail: "Record", actions: "Buttons" };
const partName = (b: Block) => ("title" in b && b.title ? b.title : (PART[b.type] ?? blockTitle(b)));

/**
 * While pointing, each part of the app is covered by one button: "Write a note about this".
 * The part itself goes inert, so Tab walks from part to part and a click can't press the app's own buttons.
 */
function NoteTarget({ block, screen, picked, onPick, children }: { block: Block; screen: Screen; picked: boolean; onPick: (ref: ObjectRef, label: string) => void; children: React.ReactNode }) {
  const label = `${screen.title} › ${partName(block)}`;
  return (
    <div className="group/note relative">
      <div inert>{children}</div>
      <button
        type="button"
        onClick={() => onPick({ type: "block", id: block.id }, label)}
        aria-label={`Write a note about this: ${label}`}
        className={cn(
          "absolute -inset-1.5 z-10 cursor-pointer rounded-[calc(var(--app-radius)+6px)] border-2 border-dashed border-transparent text-left outline-none transition-colors duration-150",
          "hover:border-brand/70 hover:bg-[rgb(31_77_58/0.03)] focus-visible:border-brand focus-visible:bg-[rgb(31_77_58/0.03)]",
          picked && "border-solid border-brand bg-[rgb(31_77_58/0.04)]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute -top-3 left-3 inline-flex items-center gap-1 rounded-[4px] bg-brand px-2 py-0.5 font-sans text-[11.5px] font-medium text-primary-foreground opacity-0 transition-opacity duration-150",
            "group-hover/note:opacity-100 group-focus-within/note:opacity-100",
            picked && "opacity-100",
          )}
        >
          <NotebookPen className="size-3" />
          {picked ? "Noting this" : "Write a note about this"}
        </span>
      </button>
    </div>
  );
}

/**
 * After the build: the real app, large and crisp on the paper. It's the production output, so nothing
 * here is drawn in pencil. Point at any part of it to write a note about it in the margin.
 */
export function RealApp({ justBuilt }: { justBuilt: boolean }) {
  const ws = useSheet();
  const bp = ws.blueprint;
  const fits = useSyncExternalStore(subscribeViewport, viewportDevice, () => "desktop" as Device);
  const [picked, setDevice] = useState<Device | null>(null);
  const device = picked ?? fits;
  const [screenId, setScreenId] = useState(bp.screens[0].id);
  const screen = bp.screens.find((s) => s.id === screenId) ?? bp.screens[0];
  const at = bp.screens.findIndex((s) => s.id === screen.id) + 1;
  const [pointing, setPointing] = useState(false);
  const [noted, setNoted] = useState<{ ref: ObjectRef; label: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const replay = ws.build.status === "done" && ws.build.mode === "replay";
  const version = (ws.checkpoints.find((c) => c.id === ws.project.currentCheckpointId) ?? ws.checkpoints.reduce<(typeof ws.checkpoints)[number] | null>((m, c) => (!m || c.seq > m.seq ? c : m), null))?.seq;
  const asks = bp.agents.flatMap((a) => a.tools).filter((t) => t.permission === "ask").length;

  // The moment it lands: bring the heading into view and give it the keyboard, so nobody is left on a button that's gone.
  useEffect(() => {
    if (!justBuilt) return;
    heading.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "nearest" });
    heading.current?.focus({ preventScroll: true });
  }, [justBuilt]);

  // Escape stops pointing.
  useEffect(() => {
    if (!pointing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPointing(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pointing]);

  // Same mechanism as Preview's "Ask": scope the margin to what was pointed at, then give it the keyboard.
  const note = (ref: ObjectRef, label: string) => {
    setNoted({ ref, label });
    ws.focusComposer(ref);
  };
  const wrap: WrapBlock = (block, s, node) => (
    <NoteTarget key={block.id} block={block} screen={s} picked={noted?.ref.type === "block" && noted.ref.id === block.id} onPick={note}>
      {node}
    </NoteTarget>
  );

  return (
    <div>
      <header className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 max-sm:basis-full">
          <p className="font-sketch text-[13px] text-muted-foreground">
            {version ? `Version ${version} · ` : ""}
            {ws.project.name}
          </p>
          <h1 ref={heading} tabIndex={-1} className="mt-1 font-display text-[52px] leading-[0.95] text-foreground outline-none sm:text-[64px]">
            {replay ? "That's how it was made." : "It's real."}
          </h1>
          <p className="mt-2.5 max-w-[60ch] text-[14.5px] leading-relaxed text-muted-foreground">
            {replay
              ? "Replays are free and change nothing. Below is the app as it is now."
              : `${plural(bp.screens.length, "screen")} and ${plural(bp.agents.length, "AI helper")}, all tried on their test runs first.${asks ? ` ${plural(asks, "action")} ${asks === 1 ? "waits" : "wait"} for your OK before ${asks === 1 ? "it happens" : "they happen"}.` : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ws.liveSlug && (
            <Button asChild variant="outline" size="lg" className="h-10 rounded-lg">
              <a href={`/live/${ws.liveSlug}`} target="_blank" rel="noreferrer">
                Live version <ArrowUpRight aria-hidden />
              </a>
            </Button>
          )}
          <Button asChild size="lg" className="h-10 rounded-lg px-4 text-[14px]">
            <Link href={`/p/${ws.project.id}/ship`}>
              <Rocket aria-hidden /> Publish
            </Link>
          </Button>
        </div>
      </header>

      <ol className="mt-5 flex flex-wrap gap-x-6 gap-y-1.5 font-pencil text-[21px] text-foreground/80">
        <li><span className="text-faint">1.</span> Try it below</li>
        <li><span className="text-faint">2.</span> Point at anything you&apos;d change and write a note</li>
        <li><span className="text-faint">3.</span> Publish. We check a few things first.</li>
      </ol>
      {ws.project.buildState === "built" && (
        <button type="button" onClick={() => void ws.build.start({ replay: true })} className="mt-2 inline-flex items-center gap-1.5 rounded-sm text-[12.5px] text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground">
          <Play className="size-3" aria-hidden /> Watch it being made again · free
        </button>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="flex min-w-0 items-baseline gap-2" aria-live="polite">
          <span className="truncate font-pencil text-[28px] leading-none text-foreground">{screen.title}</span>
          <span className="shrink-0 font-sketch text-[12px] text-faint">
            screen {at} of {bp.screens.length}
          </span>
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-pressed={pointing}
            onClick={() => setPointing((p) => !p)}
            className={cn("h-8 rounded-md text-[12.5px]", pointing && "border-brand/50 bg-brand-soft text-brand hover:bg-brand-soft hover:text-brand")}
          >
            <MousePointerClick aria-hidden /> Point and write a note
            {pointing && <span aria-hidden className="text-brand/70">· Esc to stop</span>}
          </Button>
          <PencilRadio<Device>
            label="Device"
            value={device}
            onChange={setDevice}
            options={[
              { value: "desktop", label: <Monitor className="size-3.5" aria-hidden />, ariaLabel: "Desktop", title: "Desktop" },
              { value: "tablet", label: <Tablet className="size-3.5" aria-hidden />, ariaLabel: "Tablet", title: "Tablet" },
              { value: "phone", label: <Smartphone className="size-3.5" aria-hidden />, ariaLabel: "Phone", title: "Phone" },
            ]}
          />
        </div>
      </div>

      <div className="mt-2 min-h-[20px] text-[12.5px] text-muted-foreground" role="status">
        {noted ? (
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            <NotebookPen className="size-3.5 text-brand" aria-hidden />
            Your next note is about <span className="font-medium text-foreground">{noted.label}</span>. Write it in the margin.
            <button type="button" onClick={() => setNoted(null)} className="inline-flex items-center rounded-sm p-0.5 hover:text-foreground" aria-label="Forget what I pointed at">
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ) : pointing ? (
          "Click any part of the app, or Tab to it, to write a note about it in the margin."
        ) : (
          <>
            Or{" "}
            <button type="button" onClick={() => note({ type: "screen", id: screen.id }, screen.title)} className="rounded-sm font-medium text-brand underline decoration-dotted underline-offset-4 hover:text-brand-hi">
              write a note about this whole screen
            </button>
            .
          </>
        )}
      </div>

      <div
        className={cn(
          "relative mx-auto mt-2 flex min-w-0 flex-col",
          // Change shape only when someone picks a device, not when the first paint settles on the one that fits.
          picked && "transition-[width] duration-300 ease-out motion-reduce:transition-none",
          justBuilt && "ink-in motion-reduce:animate-none!",
          device === "phone" ? "rounded-[34px] border-[7px] border-foreground/85 bg-foreground/85" : "panel-raised overflow-clip rounded-[10px]",
        )}
        style={{
          width: device === "phone" ? 404 : device === "tablet" ? 834 : "100%",
          maxWidth: "100%",
          height: device === "phone" ? "min(800px, calc(100dvh - 120px))" : "clamp(520px, calc(100dvh - 240px), 780px)",
          minHeight: device === "phone" ? 560 : undefined,
        }}
      >
        {device !== "phone" && (
          <div className="flex h-8 shrink-0 items-center gap-2 border-b border-hairline bg-deep/70 px-3">
            <span aria-hidden className="flex gap-1.5">
              <i className="size-2 rounded-full border border-hairline-hi" />
              <i className="size-2 rounded-full border border-hairline-hi" />
              <i className="size-2 rounded-full border border-hairline-hi" />
            </span>
            <span className="mx-auto truncate text-[11.5px] text-muted-foreground">Test version · only you can see this</span>
            <span aria-hidden className="w-[42px]" />
          </div>
        )}
        <div className={cn("min-h-0 min-w-0 flex-1 overflow-clip bg-white", device === "phone" ? "rounded-[27px]" : "rounded-b-[9px]")}>
          <SpecApp bp={bp} mode="preview" device={device} screenId={screen.id} onScreenChange={setScreenId} projectId={ws.project.id} wrapBlock={pointing ? wrap : undefined} />
        </div>
      </div>
    </div>
  );
}
