"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, Monitor, MousePointerClick, NotebookPen, Play, Rocket, Smartphone, Tablet, X } from "lucide-react";
import type { Block, ObjectRef, Screen } from "@/lib/blueprint/schema";
import { SpecApp, type WrapBlock } from "@/components/renderer/spec-app";
import { Button } from "@/components/ui/button";
import { blockTitle } from "@/lib/blueprint";
import { cn } from "@/lib/utils";
import { EASE } from "@/lib/motion";
import { useFirstShowing } from "@/components/motion/sheet-draw";
import { PencilRadio } from "./pencil-radio";
import { Pill } from "@/components/ui/pill";
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

/** The height of the pretend status bar the app draws at the top of a phone (components/renderer/spec-app.tsx). */
const PHONE_STATUS_BAR = 42;

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
          "absolute -inset-1.5 z-10 cursor-pointer rounded-[calc(var(--app-radius)+6px)] border-2 border-dashed border-transparent text-left outline-none transition-colors duration-150 ease-paper",
          "hover:border-brand/70 hover:bg-brand/3 focus-visible:border-brand focus-visible:bg-brand/3",
          picked && "border-solid border-brand bg-brand/4",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute -top-3 left-3 inline-flex items-center gap-1 rounded-sm bg-brand px-2 py-0.5 font-sans text-badge font-medium text-primary-foreground opacity-0 transition-opacity duration-150 ease-paper",
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

/** The title is written on left to right (a clip-path reveal, with room for the handwriting's loops). */
const WRITE_FROM = "inset(-25% 100% -35% -8%)";
const WRITTEN = "inset(-25% -8% -35% -8%)";
/** ink-in's length (app/globals.css), and when the app starts inking in under the title. */
const INK_S = 1.1;
const INK_AFTER_S = 0.45;

/**
 * After the build: the real app, large and crisp on the paper. It's the production output, so nothing
 * here is drawn in pencil. Point at any part of it to write a note about it in the margin.
 */
export function RealApp({ justBuilt }: { justBuilt: boolean }) {
  const ws = useSheet();
  const bp = ws.blueprint;
  const fits = useSyncExternalStore(subscribeViewport, viewportDevice, () => "desktop" as Device);
  const [picked, setDevice] = useState<Device | null>(null);
  // On a phone the app is simply the app, edge to edge: no device frame inside the phone, and no picker.
  const onPhone = fits === "phone";
  const device = onPhone ? "phone" : (picked ?? fits);
  const [screenId, setScreenId] = useState(bp.screens[0].id);
  const screen = bp.screens.find((s) => s.id === screenId) ?? bp.screens[0];
  const at = bp.screens.findIndex((s) => s.id === screen.id) + 1;
  const [pointing, setPointing] = useState(false);
  const [noted, setNoted] = useState<{ ref: ObjectRef; label: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const replay = ws.build.status === "done" && ws.build.mode === "replay";
  const version = (ws.checkpoints.find((c) => c.id === ws.project.currentCheckpointId) ?? ws.checkpoints.reduce<(typeof ws.checkpoints)[number] | null>((m, c) => (!m || c.seq > m.seq ? c : m), null))?.seq;
  const asks = bp.agents.flatMap((a) => a.tools).filter((t) => t.permission === "ask").length;
  // The moment it lands, once: the title is written on, then the app inks in under it.
  const landing = useFirstShowing(`real:${ws.project.id}:${ws.build.mode}`, justBuilt);

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
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-sketch text-sketch text-muted-foreground">{ws.project.name}</span>
            {version ? <Pill className="tabular-nums">version {version}</Pill> : null}
          </p>
          <h1 ref={heading} tabIndex={-1} className="mt-1 font-pencil text-title text-foreground outline-none sm:text-hero">
            <motion.span
              className="inline-block"
              initial={landing ? { clipPath: WRITE_FROM } : false}
              animate={landing ? { clipPath: WRITTEN } : undefined}
              transition={{ duration: INK_S, ease: EASE }}
            >
              {replay ? "That's how it was made." : "It's real."}
            </motion.span>
          </h1>
          <p className="mt-2.5 max-w-[60ch] text-lead text-muted-foreground">
            {replay
              ? "Replays are free and change nothing. Below is the app as it is now."
              : `${plural(bp.screens.length, "screen")} and ${plural(bp.agents.length, "AI helper")}, all tried on their test runs first.${asks ? ` ${plural(asks, "action")} ${asks === 1 ? "waits" : "wait"} for your OK before ${asks === 1 ? "it happens" : "they happen"}.` : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ws.liveSlug && (
            <Button asChild variant="outline" size="lg">
              <a href={`/live/${ws.liveSlug}`} target="_blank" rel="noreferrer">
                Live version <ArrowUpRight aria-hidden />
              </a>
            </Button>
          )}
          <Button asChild size="lg">
            <Link href={`/p/${ws.project.id}/ship`}>
              <Rocket aria-hidden /> Publish
            </Link>
          </Button>
        </div>
      </header>

      {/* Three steps in pencil, numbered in print. */}
      <ol className="mt-5 flex flex-wrap gap-x-6 gap-y-1.5 font-pencil text-note text-foreground/80">
        <li><span className="font-sans text-body tabular-nums text-faint">1.</span> Try it below</li>
        <li><span className="font-sans text-body tabular-nums text-faint">2.</span> Point at anything you&apos;d change and write a note</li>
        <li><span className="font-sans text-body tabular-nums text-faint">3.</span> Publish. We check a few things first.</li>
      </ol>
      {ws.project.buildState === "built" && (
        <button type="button" onClick={() => void ws.build.start({ replay: true })} className="mt-2 inline-flex items-center gap-1.5 rounded-sm text-meta text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground">
          <Play className="size-3" aria-hidden /> Watch it being made again · free
        </button>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="flex min-w-0 items-baseline gap-2" aria-live="polite">
          <span className="truncate pr-1 font-pencil text-section text-foreground">{screen.title}</span>
          <span className="shrink-0 text-meta tabular-nums text-faint">
            Screen {at} of {bp.screens.length}
          </span>
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            aria-pressed={pointing}
            onClick={() => setPointing((p) => !p)}
            className={cn(pointing && "border-brand/30 bg-brand-soft text-brand ring-1 ring-brand/30 hover:border-brand/30 hover:bg-brand-soft hover:text-brand")}
          >
            <MousePointerClick aria-hidden /> Point and write a note
            {pointing && <span aria-hidden className="text-brand/70">· Esc to stop</span>}
          </Button>
          {!onPhone && (
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
          )}
        </div>
      </div>

      <div className="mt-2 min-h-5 text-meta text-muted-foreground" role="status">
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

      {/*
        One frame for every device: a floating sheet with a slim strip saying whose version this is.
        On a phone the app runs edge to edge across the paper, with no frame inside the phone.
      */}
      <div
        className={cn(
          "relative mt-2 flex min-w-0 flex-col overflow-clip",
          onPhone ? "-mx-3 border-y border-hairline" : "panel-raised mx-auto rounded-lg",
          // Change shape only when someone picks a device, not when the first paint settles on the one that fits.
          picked && !onPhone && "transition-[width] duration-250 ease-paper motion-reduce:transition-none",
          landing && "ink-in motion-reduce:animate-none!",
        )}
        style={{
          ...(onPhone
            ? { height: "max(26rem, calc(100dvh - 9rem))" }
            : {
                width: device === "phone" ? 390 : device === "tablet" ? 834 : "100%",
                maxWidth: "100%",
                height: device === "phone" ? "min(800px, calc(100dvh - 120px))" : "clamp(520px, calc(100dvh - 240px), 780px)",
                minHeight: device === "phone" ? 560 : undefined,
              }),
          // It inks in as the title's last words are written.
          ...(landing ? { animationDelay: `${INK_AFTER_S}s` } : null),
        }}
      >
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-hairline bg-deep/70 px-3">
          {device !== "phone" && (
            <span aria-hidden className="flex gap-1.5">
              <i className="size-2 rounded-full border border-hairline-hi" />
              <i className="size-2 rounded-full border border-hairline-hi" />
              <i className="size-2 rounded-full border border-hairline-hi" />
            </span>
          )}
          <span className="mx-auto truncate text-meta text-muted-foreground">Test version · only you can see this</span>
          {device !== "phone" && <span aria-hidden className="w-[42px]" />}
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-clip bg-raised">
          {/* On a phone the app draws a pretend status bar (9:41) at its top; the strip above already says what this is, so it sits out of view. */}
          <div className="h-full" style={device === "phone" ? { height: `calc(100% + ${PHONE_STATUS_BAR}px)`, marginTop: -PHONE_STATUS_BAR } : undefined}>
            <SpecApp bp={bp} mode="preview" device={device} screenId={screen.id} onScreenChange={setScreenId} projectId={ws.project.id} wrapBlock={pointing ? wrap : undefined} />
          </div>
        </div>
      </div>
    </div>
  );
}
