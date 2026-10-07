"use client";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, ArrowUpRight, CircleAlert, Code2, Monitor, NotebookPen, Rocket, Smartphone, Tablet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { PencilRadio } from "@/components/workspace/sheet/pencil-radio";
import { useSheet } from "@/components/workspace/sheet/use-sheet";
import { useChangeOrderOpen } from "@/components/workspace/composer-dock";
import { accessWords } from "@/components/new/code-writing";
import { EASE } from "@/lib/motion";
import { PRICE } from "@/lib/prices";
import { cn } from "@/lib/utils";
import { CodeAppFrame } from "./code-app-frame";
import { BuildSteps } from "./build-steps";
import { FileCards } from "./file-cards";
import { FixNote } from "./fix-note";
import { MAX_REPAIRS, useCodeRun } from "./use-code-run";

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

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The title is written on left to right (a clip-path reveal, with room for the handwriting's loops). */
const WRITE_FROM = "inset(-25% 100% -35% -8%)";
const WRITTEN = "inset(-25% -8% -35% -8%)";

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * The Sheet for a code app: the app Claude wrote, from its files to "It's real." Its title and tagline in
 * pencil, what was asked for, the files, what it keeps and whether it uses AI; then Make it real (free), which
 * really builds it, step by step, and starts it in its sandbox. Only once the app has drawn itself does the
 * Sheet say "It's real." If the build or the app fails, a fix note shows the real error and Fix it (free).
 */
export function CodeSheet() {
  const ws = useSheet();
  const files = useMemo(() => ws.code?.files ?? [], [ws.code]);
  const manifest = ws.code?.manifest;
  const paths = useMemo(() => files.map((f) => f.path), [files]);
  const { run, build, started, crashed, repair, restart, adopt } = useCodeRun({ projectId: ws.project.id, serverBuild: ws.codeBuild, paths, onBusy: ws.setCodeBusy });
  const { phase } = run;
  const title = manifest?.title || ws.project.name;
  const showFrame = Boolean(run.build?.ok) && (phase === "starting" || phase === "ready" || (phase === "failed" && run.source !== "build"));
  const real = phase === "ready";
  const working = phase === "building" || phase === "repairing";
  const steps = useRef<HTMLElement>(null);

  // A change applied from the margin (or undone) is a new version with no build yet: build it again, automatically.
  // A build from elsewhere (another tab, a teammate) is followed when nothing is running here.
  const cp = ws.project.currentCheckpointId;
  const serverHash = ws.codeBuild?.hash ?? null;
  const seen = useRef({ cp, hash: serverHash });
  useEffect(() => {
    const was = seen.current;
    seen.current = { cp, hash: serverHash };
    if (was.cp !== cp && !ws.codeBuild) return void build();
    if (was.hash !== serverHash) adopt(ws.codeBuild);
  }, [cp, serverHash, ws.codeBuild, build, adopt]);

  // Opened after a change made elsewhere (versions after the first, no build): build it now rather than show an old sketch.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (!ws.codeBuild && ws.checkpoints.length > 1) void build();
    // Only when the Sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The button that started the build is gone: bring the steps into view and give them the keyboard, once per build.
  const arrived = useRef(false);
  useEffect(() => {
    if (!working) {
      arrived.current = false;
      return;
    }
    if (arrived.current) return;
    arrived.current = true;
    steps.current?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "nearest" });
    steps.current?.focus({ preventScroll: true });
  }, [working]);

  // Prod AI's fixes in a row (the latest versions that are its fixes): after three it's the person's turn to say what they want.
  const repairs = useMemo(() => {
    if (run.stuck) return MAX_REPAIRS;
    let n = 0;
    for (const c of [...ws.checkpoints].sort((a, b) => b.seq - a.seq)) {
      if (c.kind !== "repair") break;
      n++;
    }
    return n;
  }, [ws.checkpoints, run.stuck]);

  const version = (ws.checkpoints.find((c) => c.id === ws.project.currentCheckpointId) ?? ws.checkpoints.reduce<(typeof ws.checkpoints)[number] | null>((m, c) => (!m || c.seq > m.seq ? c : m), null))?.seq;

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-canvas">
      <div className={cn("mx-auto w-full px-2.5 py-5 sm:px-6 sm:py-9", showFrame ? "max-w-[1240px]" : "max-w-[980px]")}>
        <article
          aria-label={`${title}: ${real ? "the real app" : working ? "being made real" : "the code"}`}
          className={cn("@container/sheet panel relative rounded-md py-7 sm:py-10", showFrame ? "px-3 sm:px-8" : "px-4 sm:px-10")}
        >
          {showFrame ? (
            <RealHeader title={title} kind={manifest?.kind} version={version} phase={phase} fresh={run.fresh} />
          ) : (
            <header>
              <p className="font-sketch text-sketch text-muted-foreground">
                {phase === "building" ? "Being made real" : phase === "repairing" ? "Being fixed" : phase === "failed" ? "Written in code · not working yet" : "Written in code · not built yet"}
              </p>
              <h1 className="mt-1 break-words font-pencil text-title text-foreground sm:text-hero">{title}</h1>
              {manifest?.tagline && <p className="mt-2.5 max-w-[62ch] text-lead text-muted-foreground">{manifest.tagline}</p>}
            </header>
          )}

          {run.problem && phase !== "failed" && (
            <p role="alert" className="mt-5 flex max-w-2xl gap-2 rounded-md border border-hairline-hi bg-panel px-3 py-2 text-body text-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {run.problem}
            </p>
          )}

          {/* The real steps while it builds, then while it starts (the last step follows the sandbox), and where it stopped if it failed. */}
          {(working || ((phase === "starting" || phase === "failed") && run.steps.length > 0)) && <BuildSteps ref={steps} steps={run.steps} phase={phase} fixed={run.fixed} />}

          {phase === "failed" && (run.errors.length > 0 ? (
            <FixNote
              errors={run.errors}
              source={run.source}
              files={files}
              repairs={repairs}
              repairing={false}
              problem={run.problem}
              onRepair={() => void repair()}
              onRestart={restart}
              onNote={() => ws.focusComposer(null)}
            />
          ) : (
            run.problem && (
              <div role="alert" className="mt-6 flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-hairline-hi bg-panel px-3 py-2 text-body text-foreground">
                <p className="flex min-w-0 flex-1 gap-2">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {run.problem}
                </p>
                <Button variant="outline" onClick={() => void build()}>
                  Try again
                </Button>
              </div>
            )
          ))}

          {/* A runtime error while it's real: the app stays, the fix note says what broke. */}
          {phase === "ready" && run.errors.length > 0 && (
            <FixNote errors={run.errors} source="runtime" files={files} repairs={repairs} repairing={false} problem={null} onRepair={() => void repair()} onNote={() => ws.focusComposer(null)} />
          )}

          {showFrame && run.build && (
            <TryIt
              key={`${run.build.hash}:${run.attempt}`}
              projectId={ws.project.id}
              hash={run.build.hash}
              manifest={manifest ?? null}
              userName={ws.user.name}
              phase={phase}
              fresh={run.fresh}
              onReady={started}
              onError={crashed}
            />
          )}

          <BriefNote brief={ws.project.brief} />

          <section aria-labelledby="code-files" className="mt-10">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 id="code-files" className="font-pencil text-section text-foreground">
                {real ? "The files" : <>Here&apos;s the <span className="pencil-underline">code</span></>}
              </h2>
              <Link href={`/p/${ws.project.id}/code`} className="ml-auto inline-flex items-center gap-1.5 text-meta text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground">
                <Code2 className="size-3.5" aria-hidden /> Read the code
              </Link>
            </div>
            <p className="mt-2 text-body text-muted-foreground">
              {files.length} {files.length === 1 ? "file" : "files"} Claude wrote{real ? ", built and running above" : ""}. Change anything by writing a note in the margin.
            </p>
            <FileCards className="mt-5" files={files} real={real} />
          </section>

          <section aria-labelledby="code-keeps" className="mt-11">
            <h2 id="code-keeps" className="font-pencil text-section text-foreground">What it keeps</h2>
            {manifest?.collections?.length ? (
              <>
                <ul className="mt-4 flex flex-wrap gap-3">
                  {manifest.collections.map((c) => (
                    <li key={c.name} className={cn("min-w-44 px-3.5 pb-2.5 pt-2", real ? "panel rounded-md" : "sketch-soft bg-panel/60")}>
                      <p className="font-pencil text-note leading-tight text-foreground">{c.label || c.name}</p>
                      <p className="mt-0.5 text-meta text-muted-foreground">{capital(accessWords(c.read, c.write))}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-meta text-muted-foreground">In the test version it&apos;s kept on this page only and gone when you reload. Once published, it&apos;s kept for real.</p>
              </>
            ) : (
              <p className="mt-2 text-body text-muted-foreground">Nothing. It doesn&apos;t keep any records.</p>
            )}
            <p className="mt-4 text-body text-foreground">
              {manifest?.usesAI ? "It asks AI for some of its answers: 5 credits a question, from your monthly allowance." : "It doesn't use AI."}
            </p>
          </section>

          {phase === "idle" && <ReadyNote onBuild={() => void build()} />}
        </article>
      </div>
    </div>
  );
}

/** Once built: "It's real." (written on, once, the moment it lands), and the ways on: publish it, open the live one. */
function RealHeader({ title, kind, version, phase, fresh }: { title: string; kind?: string; version?: number; phase: string; fresh: boolean }) {
  const ws = useSheet();
  const real = phase === "ready";
  const failed = phase === "failed";
  const heading = useRef<HTMLHeadingElement>(null);
  const landing = real && fresh && !reduced();
  // The moment it lands: the heading comes into view and takes the keyboard, so nobody is left on a button that's gone.
  useEffect(() => {
    if (!real || !fresh) return;
    heading.current?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "nearest" });
    heading.current?.focus({ preventScroll: true });
  }, [real, fresh]);
  return (
    <header className="flex flex-wrap items-end gap-x-6 gap-y-4">
      <div className="min-w-0 flex-1 max-sm:basis-full">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-sketch text-sketch text-muted-foreground">{title}</span>
          {version ? <Pill className="tabular-nums">version {version}</Pill> : null}
        </p>
        <h1 ref={heading} tabIndex={-1} className="mt-1 font-pencil text-title text-foreground outline-none sm:text-hero">
          {real ? (
            <motion.span key="real" className="inline-block" initial={landing ? { clipPath: WRITE_FROM } : false} animate={landing ? { clipPath: WRITTEN } : undefined} transition={{ duration: 1.1, ease: EASE }}>
              It&apos;s real.
            </motion.span>
          ) : failed ? (
            <span key="failed">{title}</span>
          ) : (
            <span key="starting" className="text-muted-foreground">
              Starting your app…
            </span>
          )}
        </h1>
        <p className="mt-2.5 max-w-[60ch] text-lead text-muted-foreground" aria-live="polite">
          {real
            ? `${kind ? capital(kind) : "Your app"}, really built and running. Try it below.`
            : failed
              ? "It built, but it didn't start. Here's what went wrong."
              : "Built. Waiting for it to draw itself for the first time."}
        </p>
      </div>
      {real && (
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
      )}
    </header>
  );
}

/**
 * The app itself, in a device frame like the business Sheet's (desktop, tablet, phone): a sealed sandbox
 * running the real build. In pencil while it starts, inked in the moment it has drawn itself.
 */
function TryIt({
  projectId,
  hash,
  manifest,
  userName,
  phase,
  fresh,
  onReady,
  onError,
}: {
  projectId: string;
  hash: string;
  manifest: { collections: { name: string; label: string; read: "public" | "team"; write: "public" | "team" }[] } | null;
  userName: string;
  phase: string;
  fresh: boolean;
  onReady: () => void;
  onError: (e: { message: string; stack?: string; source?: string }) => void;
}) {
  const fits = useSyncExternalStore(subscribeViewport, viewportDevice, () => "desktop" as Device);
  const [picked, setDevice] = useState<Device | null>(null);
  const onPhone = fits === "phone";
  const device = onPhone ? "phone" : (picked ?? fits);
  const starting = phase === "starting";
  return (
    <section aria-label="Try it" className="mt-7">
      {phase === "ready" && (
        <ol className="flex flex-wrap gap-x-6 gap-y-1.5 font-pencil text-note text-foreground/80">
          <li><span className="font-sans text-body tabular-nums text-faint">1.</span> Try it below</li>
          <li><span className="font-sans text-body tabular-nums text-faint">2.</span> Write a note in the margin to change anything</li>
          <li><span className="font-sans text-body tabular-nums text-faint">3.</span> Publish it</li>
        </ol>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="font-pencil text-section text-foreground">Try it</p>
        {!onPhone && (
          <PencilRadio<Device>
            className="ml-auto"
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
      <div
        className={cn(
          "relative mt-3 flex min-w-0 flex-col overflow-clip",
          onPhone ? "-mx-3 border-y border-hairline" : "panel-raised mx-auto rounded-lg",
          picked && !onPhone && "transition-[width] duration-250 ease-paper motion-reduce:transition-none",
          // Pencil while it starts; inked in the moment it has drawn itself.
          starting ? "pencil-state" : fresh && "ink-in motion-reduce:animate-none!",
        )}
        style={
          onPhone
            ? { height: "max(26rem, calc(100dvh - 9rem))" }
            : {
                width: device === "phone" ? 390 : device === "tablet" ? 834 : "100%",
                maxWidth: "100%",
                height: device === "phone" ? "min(800px, calc(100dvh - 120px))" : "clamp(520px, calc(100dvh - 240px), 780px)",
                minHeight: device === "phone" ? 560 : undefined,
              }
        }
      >
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-hairline bg-deep/70 px-3">
          {device !== "phone" && (
            <span aria-hidden className="flex gap-1.5">
              <i className="size-2 rounded-full border border-hairline-hi" />
              <i className="size-2 rounded-full border border-hairline-hi" />
              <i className="size-2 rounded-full border border-hairline-hi" />
            </span>
          )}
          <span className="mx-auto truncate text-meta text-muted-foreground">Test version · data isn&apos;t saved</span>
          {device !== "phone" && <span aria-hidden className="w-[42px]" />}
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-clip bg-raised">
          <CodeAppFrame mode="preview" projectId={projectId} hash={hash} manifest={manifest} user={{ role: "preview", name: userName }} onReady={onReady} onError={onError} title="Your app, test version" />
        </div>
      </div>
    </section>
  );
}

/** "What you asked for": the person's own words, in pencil. Long ones fold to three lines. */
function BriefNote({ brief }: { brief: string }) {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const para = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const text = brief.trim();
  useLayoutEffect(() => {
    const el = para.current;
    if (!el || open) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, text]);
  if (!text) return null;
  return (
    <section aria-labelledby={`${id}-h`} className="mt-9">
      <h2 id={`${id}-h`} className="font-sketch text-sketch text-muted-foreground">What you asked for</h2>
      <p ref={para} id={`${id}-t`} className={cn("mt-1.5 border-l-2 border-hairline-hi pl-4 font-pencil text-note leading-snug text-foreground/85", !open && "line-clamp-3")}>
        {text}
      </p>
      {(overflows || open) && (
        <button type="button" aria-expanded={open} aria-controls={`${id}-t`} onClick={() => setOpen((o) => !o)} className="ml-4 mt-1 rounded-sm text-meta font-medium text-brand underline decoration-dotted underline-offset-4 hover:text-brand-hi">
          {open ? "Show less" : "Show all of it"}
        </button>
      )}
    </section>
  );
}

/** Before the first build: Make it real is free, and it's a real build. */
function ReadyNote({ onBuild }: { onBuild: () => void }) {
  const ws = useSheet();
  const changeWaiting = useChangeOrderOpen();
  const id = useId();
  return (
    <section aria-labelledby={id} className="mt-12 border-t border-dashed border-hairline-hi pt-7">
      <h2 id={id} className="font-pencil text-section text-foreground">
        Ready when you are
      </h2>
      <p className="mt-2 text-lead text-foreground">
        Making it real is <span className="font-semibold">free</span>: Prod AI really builds these files and starts your app right here.
      </p>
      <p className="mt-0.5 text-body text-muted-foreground">Nothing is built until you press Make it real. It usually takes a few seconds.</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button size="cta" disabled={changeWaiting || ws.codeBusy} onClick={onBuild}>
          Make it real <span className="font-normal opacity-80">· free</span>
          <ArrowRight aria-hidden />
        </Button>
        <Button variant="ghost" size="lg" className="text-muted-foreground" onClick={() => ws.focusComposer(null)}>
          <NotebookPen aria-hidden /> Change something first
        </Button>
      </div>
      <div className="mt-3 space-y-1 text-meta text-muted-foreground">
        {changeWaiting && <p className="text-foreground">A change note is waiting for your OK in the margin. Decide on it first, then make it real.</p>}
        <p>
          If something in the code breaks, fixing it is free. A change you ask for costs <span className="tabular-nums">{PRICE.codeChange}</span> credits, and you see it first.
        </p>
      </div>
    </section>
  );
}
