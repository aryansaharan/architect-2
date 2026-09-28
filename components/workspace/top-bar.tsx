"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Check, ChevronDown, Code2, Coins, Copy, ExternalLink, Eye, History, Home, Inbox, Keyboard, LogOut, Map as MapIcon, Pause, Play, Rocket, Search, Settings, Share2, Undo2, UserRoundPlus, UsersRound } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { TimeAgo } from "@/components/time-ago";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";
import { creditsUsd } from "@/lib/format";
import { restoreCheckpoint } from "@/lib/actions/checkpoints";
import { signOut } from "@/lib/actions/auth";
import type { CheckpointMeta } from "@/lib/db/types";
import { useWorkspace } from "./context";
import { projectSection } from "./rail-pref";
import { undoTo } from "./undo";

/** The three places most people need. `section` is the path after /p/[id] ("" is the Sheet). */
const TABS = [
  { section: "", label: "Sheet", key: "S", hint: "Your app on paper, and the real thing" },
  { section: "agents", label: "AI helpers", key: "A", hint: "The AI helpers in your app, and what they may do" },
  { section: "ship", label: "Publish", key: "P", hint: "Check it over and put it live" },
] as const;

/** For a closer look: developer views, one menu away. */
const HOOD = [
  { section: "blueprint", label: "Plan map", icon: MapIcon, key: "M", hint: "Every screen, AI helper, kind of data and connection" },
  { section: "preview", label: "Preview and tweak", icon: Eye, key: "T", hint: "Use the app, tweak words for free, pin comments" },
  { section: "code", label: "Code and GitHub", icon: Code2, key: "C", hint: "Every file it wrote, changes, GitHub" },
  { section: "handoffs", label: "Handoffs", icon: Inbox, key: "H", hint: "What you've asked teammates" },
] as const;

const hrefFor = (base: string, section: string) => (section ? `${base}/${section}` : base);

/** A thin pencil line under a tab while its page is loading. */
function TabPending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={cn("absolute inset-x-2.5 bottom-1 h-px bg-hairline-hi transition-opacity duration-150 ease-paper", pending ? "opacity-100" : "opacity-0")} />;
}

/** The hand-drawn underline under the current tab. It moves when the tab changes, and only then. */
function PencilUnderline() {
  return (
    <motion.span layoutId="topbar-tab" aria-hidden className="pointer-events-none absolute inset-x-1.5 bottom-0.5 text-brand" transition={SPRING}>
      <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="block h-[5px] w-full">
        <path d="M1.5 3.8C18 2.2 38 4.6 58 3.1S88 2.7 98.5 3.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </motion.span>
  );
}

export function TopBar() {
  const ws = useWorkspace();
  const pathname = usePathname();
  const base = `/p/${ws.project.id}`;
  const section = projectSection(pathname, ws.project.id);

  return (
    <header className="relative z-30 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-hairline bg-canvas px-2.5 pt-1.5 md:h-12 md:flex-nowrap md:pt-0">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link href="/home" aria-label="All projects" className="group grid size-8 shrink-0 place-items-center rounded-md transition-colors hover:bg-deep">
          <LogoMark />
        </Link>
        <span className="text-hairline-hi" aria-hidden>
          /
        </span>
        <h1 className="min-w-0 truncate pb-0.5 font-pencil text-note leading-none text-foreground" title={ws.project.name}>
          {ws.project.name}
        </h1>
        <ProjectStatus />
        {ws.project.isDemo && <span className="hidden shrink-0 text-meta text-faint 2xl:inline">Demo project</span>}
      </div>

      <nav aria-label="Project" className="flex items-center gap-0.5 max-md:order-last max-md:-mx-1 max-md:w-full max-md:justify-between">
        {TABS.map((t) => (
          <Tooltip key={t.label}>
            <TooltipTrigger asChild>
              <Link
                href={hrefFor(base, t.section)}
                aria-current={section === t.section ? "page" : undefined}
                className={cn("relative inline-flex h-9 items-center whitespace-nowrap px-2.5 text-ui font-medium transition-colors duration-150 ease-paper", section === t.section ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {t.label}
                {section === t.section && <PencilUnderline />}
                <TabPending />
              </Link>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2.5">
              <span>{t.hint}</span>
              <KbdGroup>
                <Kbd>G</Kbd>
                <Kbd>{t.key}</Kbd>
              </KbdGroup>
            </TooltipContent>
          </Tooltip>
        ))}
        <UnderTheHood base={base} section={section} />
      </nav>

      <div className="flex items-center justify-end gap-1 max-md:ml-auto md:flex-1">
        <Versions />
        <Credits />
        <ShareMenu />
        <UserMenu />
      </div>
    </header>
  );
}

const STATUS: Record<"sketch" | "making" | "real" | "published", { label: string; tone: PillTone; cls: string }> = {
  sketch: { label: "Sketch", tone: "neutral", cls: "border-dashed" },
  making: { label: "Making it real…", tone: "brand", cls: "" },
  real: { label: "Real", tone: "neutral", cls: "border-line-strong text-foreground" },
  published: { label: "Published", tone: "ok", cls: "" },
};

/**
 * Where the project is, in the Sheet's words: Sketch, Making it real…, Real, Published.
 * One Pill, toned by the colour rules: Published is live (ok), a build under way is brand.
 */
function ProjectStatus() {
  const ws = useWorkspace();
  const building = ws.build.status === "running" || ws.build.status === "repair" || ws.build.status === "finishing";
  // A replay re-tells the finished build. Nothing is built or charged, so don't say "Making it real".
  if (building && ws.build.mode === "replay")
    return (
      <Pill size="md">
        <Play className="size-2.5" aria-hidden />
        Replaying
      </Pill>
    );
  // The Sheet has the resume note (free) and the stop-and-refund choice.
  if (ws.build.interrupted)
    return (
      <Link href={`/p/${ws.project.id}`} className="shrink-0 rounded-full transition-opacity duration-150 ease-paper hover:opacity-80">
        <Pill size="md" tone="brand">
          <Pause className="size-2.5" aria-hidden />
          Paused · resume
        </Pill>
      </Link>
    );
  const state = building || ws.project.buildState === "building" ? "making" : ws.project.buildState === "draft" ? "sketch" : ws.liveSlug ? "published" : "real";
  const s = STATUS[state];
  return (
    <Pill size="md" tone={s.tone} dot={state === "published"} className={s.cls}>
      <span className="sr-only">Status: </span>
      {s.label}
    </Pill>
  );
}

/** Plan map, Preview and tweak, Code and GitHub, Handoffs: one menu away, with the open handoffs counted inside. */
function UnderTheHood({ base, section }: { base: string; section: string }) {
  const ws = useWorkspace();
  const here = HOOD.find((h) => h.section === section);
  const openHandoffs = ws.handoffs.filter((h) => h.status !== "resolved").length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={here ? `Under the hood, on ${here.label}` : "Under the hood"}
          className={cn(
            "relative inline-flex h-9 items-center gap-1 whitespace-nowrap px-2.5 text-ui font-medium outline-none transition-colors duration-150 ease-paper focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-brand",
            here ? "text-foreground" : "text-muted-foreground hover:text-foreground data-[state=open]:text-foreground",
          )}
        >
          Under the hood
          <ChevronDown className="size-3.5 opacity-60" aria-hidden />
          {here && <PencilUnderline />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-[min(20rem,calc(100vw-1rem))]">
        <DropdownMenuLabel className="text-meta font-normal text-muted-foreground">For a closer look. You never need these to make or publish your app.</DropdownMenuLabel>
        {HOOD.map((h) => {
          const current = h.section === section;
          return (
            <DropdownMenuItem key={h.section} asChild>
              <Link href={hrefFor(base, h.section)} aria-current={current ? "page" : undefined} className="items-start gap-2.5 py-2">
                <h.icon className={cn("mt-0.5", current && "text-brand")} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-ui">
                    {h.label}
                    {h.section === "handoffs" && openHandoffs > 0 && (
                      <Pill tone="brand" className="tabular-nums">
                        {openHandoffs} open
                      </Pill>
                    )}
                  </span>
                  <span className="block text-meta text-muted-foreground">{h.hint}</span>
                </span>
                <DropdownMenuShortcut className="mt-0.5">G {h.key}</DropdownMenuShortcut>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The version just before `current`, by number: what "Undo last change" goes back to. */
function versionBefore(checkpoints: CheckpointMeta[], current: CheckpointMeta | undefined): CheckpointMeta | undefined {
  if (!current) return undefined;
  return checkpoints.filter((c) => c.seq < current.seq).sort((a, b) => b.seq - a.seq)[0];
}

/** Versions: undo the last change, or go back to any version. Going back is free and keeps where you were. */
function Versions() {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const current = ws.checkpoints.find((c) => c.id === ws.project.currentCheckpointId) ?? ws.checkpoints[0];
  const prev = versionBefore(ws.checkpoints, current);
  if (!current) return null;
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-1.5 px-2 text-muted-foreground hover:text-foreground">
              <History className="size-3.5" aria-hidden />
              <span className="max-xl:sr-only">Versions</span>
              <span className="text-meta tabular-nums text-faint max-sm:hidden">v{current.seq}</span>
              <ChevronDown className="size-3 opacity-60" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Versions · undo, or go back to any version for free</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-1rem))]">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Versions</span>
          <span className="font-normal text-muted-foreground">Going back is always free</span>
        </DropdownMenuLabel>
        <DropdownMenuItem
          disabled={!prev || pending}
          onSelect={() => {
            if (prev) start(async () => void (await undoTo(ws.project.id, prev.id, () => router.refresh())));
          }}
        >
          <Undo2 /> Undo last change
          {prev && <span className="ml-auto text-meta tabular-nums text-muted-foreground">back to version {prev.seq}</span>}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <VersionItems current={current} />
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/p/${ws.project.id}/code?compare=1`}>
            <Code2 /> Compare versions
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Every version as a menu item; picking one goes back to it. */
function VersionItems({ current }: { current: CheckpointMeta }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="max-h-72 overflow-y-auto">
      {ws.checkpoints.map((c) => {
        const isCurrent = c.id === current.id;
        return (
          <DropdownMenuItem
            key={c.id}
            disabled={pending}
            className="items-start gap-2.5 py-2"
            onSelect={(e) => {
              if (isCurrent) {
                e.preventDefault();
                return;
              }
              start(async () => {
                const r = await restoreCheckpoint(ws.project.id, c.id);
                if (r.ok) toast.success(`Back at version ${c.seq}`, { description: "Where you were is kept as a version too." });
                else toast.error(r.error ?? "Couldn't go back");
                router.refresh();
              });
            }}
          >
            <span className={cn("mt-0.5 grid h-5 min-w-6 shrink-0 place-items-center rounded-sm px-1 text-badge font-medium tabular-nums", isCurrent ? "bg-brand-soft text-brand ring-1 ring-brand/30" : "bg-deep text-muted-foreground")}>v{c.seq}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ui">{c.label.replace(/^Went live$/, "Published").replace(/^Restored #(\d+) · /, "Restored version $1 · ")}</span>
              {c.summary && <span className="block truncate text-meta text-muted-foreground">{c.summary}</span>}
            </span>
            <span className="flex flex-col items-end gap-0.5 text-meta text-muted-foreground">
              <TimeAgo iso={c.created_at} />
              {isCurrent ? (
                <span className="text-brand">current</span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Undo2 className="size-3" aria-hidden />
                  go back
                </span>
              )}
            </span>
          </DropdownMenuItem>
        );
      })}
    </div>
  );
}

/** Credits, quietly and always the same words: "97 of 500 credits" on wide screens, a coin with the same words on narrow ones. */
function Credits() {
  const ws = useWorkspace();
  const { credits, cap } = ws.usage;
  const used = Math.round(credits);
  const words = `${used} of ${cap} credits`;
  const pct = Math.min(1, cap ? credits / cap : 0);
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`${words} used this month. Spending details`}
              className="flex h-8 items-center gap-1.5 rounded-md px-2 text-meta text-muted-foreground transition-colors duration-150 ease-paper hover:bg-deep hover:text-foreground max-sm:hidden"
            >
              <Coins className="size-3.5 xl:hidden" aria-hidden />
              <span className="whitespace-nowrap tabular-nums max-xl:hidden">{words}</span>
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{words} used this month</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80">
        <p className="text-meta text-muted-foreground">This project · this month</p>
        <p className="mt-1 text-lead font-semibold tabular-nums">{words}</p>
        <p className="text-meta tabular-nums text-muted-foreground">≈ {creditsUsd(credits)} used</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-deep">
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, pct * 100)}%` }} />
        </div>
        <ul className="mt-4 space-y-2 text-ui">
          <li className="flex gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />
            Every change shows its price before it runs.
          </li>
          <li className="flex gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />
            <span>
              Fixes for our own mistakes are free. They&apos;re labelled <span className="text-fix">Our fix</span>.
            </span>
          </li>
          <li className="flex gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />
            AI helpers pause and tell you before passing the cap.
          </li>
        </ul>
        <Button asChild variant="outline" size="sm" className="mt-4 w-full">
          <Link href="/settings#usage">See the breakdown and change the cap</Link>
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** Share: the live link (once published), inviting people, and handing it to an engineer. */
function ShareMenu() {
  const ws = useWorkspace();
  const base = `/p/${ws.project.id}`;
  // Items that open a dialog keep focus there instead of handing it back to this trigger.
  const openingDialog = useRef(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-1.5 px-2.5 max-lg:w-8 max-lg:px-0">
          <Share2 className="size-3.5" aria-hidden />
          <span className="max-lg:sr-only">Share</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(20rem,calc(100vw-1rem))]"
        onCloseAutoFocus={(e) => {
          if (openingDialog.current) e.preventDefault();
          openingDialog.current = false;
        }}
      >
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Share</span>
          <span className="font-normal text-muted-foreground">{ws.liveSlug ? "Anyone with the link" : "Not published yet"}</span>
        </DropdownMenuLabel>
        {ws.liveSlug ? (
          <>
            <DropdownMenuItem
              onSelect={() => {
                void navigator.clipboard.writeText(`${window.location.origin}/live/${ws.liveSlug}`);
                toast.success("Link copied", { description: "Anyone with the link can use the published app." });
              }}
            >
              <Copy /> Copy the link
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/live/${ws.liveSlug}`} target="_blank" rel="noreferrer">
                <ExternalLink /> Open the published app
              </a>
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem asChild>
            <Link href={`${base}/ship`}>
              <Rocket /> Publish it to get a link
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/settings#team" className="items-start">
            <UserRoundPlus className="mt-0.5" />
            <span className="min-w-0">
              <span className="block">Invite people</span>
              <span className="block text-meta text-muted-foreground">Owner · Editor · Viewer. Viewers can comment, not change.</span>
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="items-start"
          onSelect={() => {
            openingDialog.current = true;
            const target = ws.selected;
            requestAnimationFrame(() => ws.openHandoff(target));
          }}
        >
          <UsersRound className="mt-0.5" />
          <span className="min-w-0">
            <span className="block">Ask a teammate</span>
            <span className="block text-meta text-muted-foreground">Hand it to an engineer with everything they need</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu({ compact }: { compact?: boolean }) {
  const ws = useWorkspace();
  return <UserMenuView name={ws.user.name} isAnonymous={ws.user.isAnonymous} avatarUrl={ws.user.avatarUrl} compact={compact} workspace />;
}

/**
 * The account menu. `workspace` adds "Jump to anything" (⌘K) and the keyboard shortcuts,
 * which only exist inside a project.
 */
export function UserMenuView({ name, isAnonymous, avatarUrl, compact, workspace = false }: { name: string; isAnonymous: boolean; avatarUrl: string | null; compact?: boolean; workspace?: boolean }) {
  const pathname = usePathname();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [leaving, startLeaving] = useTransition();
  const keepWork = useRef<HTMLAnchorElement>(null);
  // Items that open a dialog keep focus there instead of handing it back to this trigger.
  const openingDialog = useRef(false);
  const openDialog = (event: string) => {
    openingDialog.current = true;
    requestAnimationFrame(() => window.dispatchEvent(new Event(event)));
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="ml-0.5 flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand/60" aria-label="Account">
            {isAnonymous && !compact && (
              <span className="hidden h-7 items-center rounded-full border border-brand/30 bg-brand-soft px-2.5 text-meta font-medium text-brand 2xl:inline-flex">Guest · keep this work</span>
            )}
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatars come from any OAuth provider's host; next/image would need each one allow-listed
              <img src={avatarUrl} alt="" className="size-7 rounded-full border border-hairline" />
            ) : (
              <span className="grid size-7 place-items-center rounded-full border border-hairline bg-raised text-badge font-semibold">{name.slice(0, 1).toUpperCase()}</span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-64"
          onCloseAutoFocus={(e) => {
            if (openingDialog.current) e.preventDefault();
            openingDialog.current = false;
          }}
        >
          <DropdownMenuLabel>
            <span className="block text-ui">{name}</span>
            <span className="block text-meta font-normal text-muted-foreground">{isAnonymous ? "Guest session · nothing is lost if you sign in" : "Signed in"}</span>
          </DropdownMenuLabel>
          {isAnonymous && (
            <DropdownMenuItem asChild>
              <Link href="/login?next=/home" className="text-brand">
                <UserRoundPlus /> Sign in to keep this work
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/home">
              <Home /> All projects
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings /> Settings
            </Link>
          </DropdownMenuItem>
          {workspace && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => openDialog("prodai:command-k")}>
                <Search /> Jump to anything
                <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openDialog("prodai:shortcuts")}>
                <Keyboard /> Keyboard shortcuts
                <DropdownMenuShortcut>?</DropdownMenuShortcut>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          {/* A guest's work only exists in this session, so check before ending it. */}
          <DropdownMenuItem onSelect={() => (isAnonymous ? setConfirmSignOut(true) : void signOut())}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {isAnonymous && (
        <Dialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
          {/* Focus the safe choice, not "Sign out anyway". */}
          <DialogContent
            className="sm:max-w-md"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              keepWork.current?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>Sign out of this guest session?</DialogTitle>
              <DialogDescription>
                As a guest, your projects belong to this session only. Signing out ends it, and its projects can&apos;t be opened again. Sign in first and everything comes with you.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button
                variant="ghost"
                disabled={leaving}
                onClick={() =>
                  startLeaving(async () => {
                    await signOut();
                  })
                }
              >
                <LogOut /> {leaving ? "Signing out…" : "Sign out anyway"}
              </Button>
              <Button asChild>
                <Link ref={keepWork} href={`/login?next=${encodeURIComponent(pathname)}`} onClick={() => setConfirmSignOut(false)}>
                  <UserRoundPlus /> Keep my work
                </Link>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
