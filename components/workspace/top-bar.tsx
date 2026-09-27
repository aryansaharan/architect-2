"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Blocks, Bot, Check, ChevronDown, PanelLeft, Code2, Copy, Ellipsis, ExternalLink, History, Home, Inbox, Keyboard, Loader2, LogOut, Eye, MessageSquarePlus, Play, Rocket, Search, Settings, Undo2, UsersRound, UserRoundPlus, Pause } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/arch/badges";
import { AnimatedNumber } from "@/components/fx/animated-number";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { TimeAgo } from "@/components/time-ago";
import { cn } from "@/lib/utils";
import { creditsUsd, formatCredits } from "@/lib/format";
import { restoreCheckpoint } from "@/lib/actions/checkpoints";
import { signOut } from "@/lib/actions/auth";
import { useWorkspace } from "./context";
import { dockModeFor } from "./composer-dock";
import { Term } from "@/components/arch/term";

const TABS = [
  { slug: "blueprint", label: "Blueprint", icon: Blocks, key: "B", hint: "The plan: screens, agents, data, connections" },
  { slug: "preview", label: "Preview", icon: Eye, key: "P", hint: "Use the app, tweak it for free, pin comments" },
  { slug: "agents", label: "Agents", icon: Bot, key: "A", hint: "Talk to agents, set what they may do, rehearse" },
  { slug: "code", label: "Code", icon: Code2, key: "C", hint: "Every generated file, diffs, GitHub" },
  { slug: "ship", label: "Ship", icon: Rocket, key: "S", hint: "Preflight, where it runs, go live" },
] as const;

/** A thin shimmer under a tab while its view is loading. */
function TabPending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={cn("bg-solstice absolute inset-x-2 -bottom-px h-px rounded-full transition-opacity duration-200", pending ? "opacity-100" : "opacity-0")} />;
}

export function TopBar() {
  const ws = useWorkspace();
  const pathname = usePathname();
  const base = `/p/${ws.project.id}`;
  const building = ws.build.status === "running" || ws.build.status === "repair" || ws.build.status === "finishing";
  const replaying = building && ws.build.mode === "replay";
  const onHandoffs = pathname.startsWith(`${base}/handoffs`);
  const openHandoffs = ws.handoffs.filter((h) => h.status !== "resolved").length;
  // Where the composer dock steps aside (Agents, which has its own chat), asking for a change starts here.
  const dockHidden = dockModeFor(pathname) === "hidden";

  return (
    <header className="relative flex shrink-0 flex-wrap items-center gap-2 border-b border-hairline bg-panel/80 px-2.5 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-panel/70 md:h-12 md:flex-nowrap md:py-0">
      <div className="flex min-w-0 items-center gap-2">
        <Link href="/home" aria-label="All projects" className="grid size-8 place-items-center rounded-md hover:bg-raised">
          <LogoMark />
        </Link>
        <span className="text-hairline" aria-hidden>/</span>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-[13.5px] font-medium" title={ws.project.name}>{ws.project.name}</h1>
          {replaying ? (
            // A replay re-tells the finished build. Nothing is built or charged, so don't say "Building".
            <span className="inline-flex h-5 items-center gap-1 rounded-full border border-hairline px-2 text-[11px] font-medium text-muted-foreground">
              <Play className="size-2.5" aria-hidden />Replaying
            </span>
          ) : ws.build.interrupted ? (
            <Link href={`/p/${ws.project.id}/blueprint`} className="inline-flex h-5 items-center gap-1 rounded-full border border-amber/40 bg-amber-soft px-2 text-[11px] font-medium text-amber hover:border-amber/70">
              <Pause className="size-2.5" aria-hidden />Build paused · resume
            </Link>
          ) : (
            <StatusBadge state={building ? "building" : ws.project.buildState} live={Boolean(ws.liveSlug)} />
          )}
          {ws.project.isDemo && <span className="hidden rounded-full border border-hairline px-2 py-0.5 text-[10.5px] text-muted-foreground 2xl:inline">Demo project</span>}
        </div>
      </div>

      <nav aria-label="Project" className="mx-auto flex items-center gap-0.5 rounded-lg border border-hairline bg-deep p-0.5 max-md:order-last max-md:w-full max-md:justify-between">
        {TABS.map((t) => {
          const href = `${base}/${t.slug}`;
          const active = pathname.startsWith(href);
          return (
            <Tooltip key={t.slug}>
            <TooltipTrigger asChild>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors duration-200",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="topbar-tab"
                  aria-hidden
                  className="absolute inset-0 rounded-md bg-raised shadow-[inset_0_1px_0_rgb(255_255_255/0.07),0_0_0_1px_rgb(223_255_79/0.18),0_4px_18px_-6px_rgb(223_255_79/0.35)]"
                  transition={{ type: "spring", stiffness: 480, damping: 36 }}
                />
              )}
              <t.icon className={cn("relative z-[1] size-3.5 transition-colors", active && "text-amber")} aria-hidden />
              {/* Icons only below lg (the tooltip names them), so the bar never runs out of room on tablets. */}
              <span className="relative z-[1] max-lg:sr-only">{t.label}</span>
              <TabPending />
            </Link>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2.5">
              <span>{t.hint}</span>
              <KbdGroup><Kbd>G</Kbd><Kbd>{t.key}</Kbd></KbdGroup>
            </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <div className="flex items-center gap-1.5 max-md:ml-auto">
        <button type="button" onClick={() => window.dispatchEvent(new Event("architect:open-rail"))} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground lg:hidden" aria-label="Brief and activity">
          <PanelLeft className="size-4" />
        </button>
        {dockHidden && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-muted-foreground hover:text-foreground max-2xl:w-8 max-2xl:px-0"
                aria-keyshortcuts="/"
                // Opens the composer under the view, with whatever is selected as its scope.
                onClick={() => ws.focusComposer(ws.selected)}
              >
                <MessageSquarePlus className="size-3.5" />
                <span className="max-2xl:sr-only">Ask for a change</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2.5">
              <span>Ask for a change to the app. The Playground talks to the agent.</span>
              <Kbd>/</Kbd>
            </TooltipContent>
          </Tooltip>
        )}
        <div className="max-sm:hidden"><SavePoints /></div>
        <SpendMeter />
        {/* Asking a teammate and seeing what you've asked live side by side. */}
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-r-none max-xl:px-2" onClick={() => ws.openHandoff(ws.selected)}>
                <UsersRound className="size-3.5" />
                <span className="max-xl:sr-only">Ask a teammate</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Hand this to an engineer with full context</TooltipContent>
          </Tooltip>
          {/* A labelled control on wide screens ("Handoffs 1"), the inbox and a badge on narrow ones. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="outline"
                size="sm"
                className={cn("relative h-8 gap-1.5 rounded-l-none border-l-0 text-muted-foreground max-xl:w-8 max-xl:px-0 xl:px-2.5", onHandoffs && "bg-muted text-foreground")}
              >
                <Link href={`${base}/handoffs`} aria-current={onHandoffs ? "page" : undefined} aria-label={openHandoffs ? `Handoffs, ${openHandoffs} open` : "Handoffs"}>
                  <Inbox className={cn("size-3.5", onHandoffs && "text-amber")} />
                  <span aria-hidden className="max-xl:hidden">Handoffs</span>
                  {openHandoffs > 0 && (
                    <>
                      <span aria-hidden className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-amber px-1 font-mono text-[10px] font-semibold tabular-nums text-primary-foreground max-xl:hidden">
                        {openHandoffs}
                      </span>
                      <span aria-hidden className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber px-1 font-mono text-[9.5px] font-semibold tabular-nums text-primary-foreground ring-2 ring-panel xl:hidden">
                        {openHandoffs}
                      </span>
                    </>
                  )}
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2.5">
              <span>{openHandoffs ? `Handoffs · ${openHandoffs} waiting on a teammate` : "Handoffs · what you've asked teammates"}</span>
              <KbdGroup><Kbd>G</Kbd><Kbd>H</Kbd></KbdGroup>
            </TooltipContent>
          </Tooltip>
        </div>
        {/* Share, Jump to and shortcuts live in one menu (plus save points on phones). */}
        <MoreMenu />
        <UserMenu />
      </div>
      <div aria-hidden className="solstice-line pointer-events-none absolute inset-x-0 -bottom-px" style={{ opacity: 0.4 }} />
    </header>
  );
}

function SavePoints() {
  const ws = useWorkspace();
  const current = ws.checkpoints.find((c) => c.id === ws.project.currentCheckpointId) ?? ws.checkpoints[0];
  if (!ws.checkpoints.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground" aria-label="Save points">
          <History className="size-3.5" />
          <span className="max-xl:sr-only">Save point {current ? `#${current.seq}` : ""}</span>
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span><Term k="save-point">Save points</Term></span>
          <span className="font-normal text-muted-foreground">Going back is always free</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <SavePointItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/p/${ws.project.id}/code?compare=1`}>
            <Code2 /> Compare save points
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Every save point as a menu item; picking one restores it. Shared by the desktop menu and the phone "More" menu. */
function SavePointItems() {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const current = ws.checkpoints.find((c) => c.id === ws.project.currentCheckpointId) ?? ws.checkpoints[0];
  return (
    <div className="max-h-72 overflow-y-auto">
      {ws.checkpoints.map((c) => {
        const isCurrent = c.id === current?.id;
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
                if (r.ok) toast.success(`Back at “${c.label}”`, { description: "Your previous state was kept as a save point." });
                else toast.error(r.error ?? "Could not restore");
                router.refresh();
              });
            }}
          >
            <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded font-mono text-[10px]", isCurrent ? "bg-amber text-primary-foreground" : "bg-raised text-muted-foreground")}>{c.seq}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">{c.label}</span>
              <span className="block truncate text-[11.5px] text-muted-foreground">{c.summary ?? c.kind}</span>
            </span>
            <span className="flex flex-col items-end gap-0.5 text-[11px] text-muted-foreground">
              <TimeAgo iso={c.created_at} />
              {isCurrent ? <span className="text-amber">current</span> : <span className="inline-flex items-center gap-1"><Undo2 className="size-3" />restore</span>}
            </span>
          </DropdownMenuItem>
        );
      })}
    </div>
  );
}

/** True on phones, where the bar has no room for the Save points button. Matches Tailwind's `sm`. */
function usePhone() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(width < 40rem)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(width < 40rem)").matches,
    () => false,
  );
}

/**
 * The secondary controls in one place: Share, Jump to (⌘K) and shortcuts.
 * On phones it also carries the save points, which have no room in the bar.
 */
function MoreMenu() {
  const ws = useWorkspace();
  const phone = usePhone();
  const base = `/p/${ws.project.id}`;
  // Items that open a dialog keep focus there instead of handing it back to this trigger.
  const openingDialog = useRef(false);
  const openDialog = (event: string) => {
    openingDialog.current = true;
    requestAnimationFrame(() => window.dispatchEvent(new Event(event)));
  };
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="size-8" aria-label={phone ? "More: save points, share, jump to and shortcuts" : "More: share, jump to and shortcuts"}>
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Share, jump to and shortcuts</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="w-[min(20rem,calc(100vw-1rem))]"
        onCloseAutoFocus={(e) => {
          if (openingDialog.current) e.preventDefault();
          openingDialog.current = false;
        }}
      >
        {phone && ws.checkpoints.length > 0 && (
          <>
            <DropdownMenuLabel className="flex items-center justify-between">
              <span><Term k="save-point">Save points</Term></span>
              <span className="font-normal text-muted-foreground">Going back is free</span>
            </DropdownMenuLabel>
            <SavePointItems />
            <DropdownMenuItem asChild>
              <Link href={`${base}/code?compare=1`}><Code2 /> Compare save points</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Share</span>
          <span className="font-normal text-muted-foreground">{ws.liveSlug ? "Anyone with the link" : "Not live yet"}</span>
        </DropdownMenuLabel>
        {ws.liveSlug ? (
          <>
            <DropdownMenuItem
              onSelect={() => {
                void navigator.clipboard.writeText(`${window.location.origin}/live/${ws.liveSlug}`);
                toast.success("Link copied", { description: "Anyone with the link can use the live version." });
              }}
            >
              <Copy /> Copy the live link
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/live/${ws.liveSlug}`} target="_blank" rel="noreferrer"><ExternalLink /> Open the live version</a>
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem asChild>
            <Link href={`${base}/ship`}><Rocket /> Go live from Ship to get a link</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/settings#team" className="items-start">
            <UserRoundPlus className="mt-0.5" />
            <span className="min-w-0">
              <span className="block">Invite people</span>
              <span className="block text-[11.5px] text-muted-foreground">Owner · Editor · Viewer. Viewers can comment and approve, not change.</span>
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openDialog("architect:command-k")}>
          <Search /> Jump to a screen, agent or action
          <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openDialog("architect:shortcuts")}>
          <Keyboard /> Keyboard shortcuts
          <DropdownMenuShortcut>?</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SpendMeter() {
  const ws = useWorkspace();
  const { credits, cap } = ws.usage;
  const pct = Math.min(1, cap ? credits / cap : 0);
  const tone = pct >= 0.9 ? "bg-ask" : pct >= 0.7 ? "bg-amber" : "bg-read";
  const used = Math.round(credits);
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="group flex h-8 items-center gap-2 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-raised hover:text-foreground"
              aria-label={`Credits used this month: ${used} of your ${cap} credit cap. Open spending details`}
            >
              <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-raised max-sm:hidden">
                <span className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out", tone)} style={{ width: `${Math.max(3, pct * 100)}%` }} />
              </span>
              <span className="whitespace-nowrap font-mono tabular-nums">
                <AnimatedNumber value={used} />
                <span className="opacity-60"><span className="max-sm:hidden"> </span>/<span className="max-sm:hidden"> </span>{cap} cr</span>
              </span>
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Credits used this month / your cap</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80">
        <p className="micro-label">This project · this month</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {formatCredits(credits)} <span className="text-sm font-normal text-muted-foreground">≈ {creditsUsd(credits)} of {cap} cr cap</span>
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-raised">
          <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(2, pct * 100)}%` }} />
        </div>
        <ul className="mt-4 space-y-2 text-[13px]">
          <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-read" />Every change shows its price before it runs.</li>
          <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-read" />Fixes for our own mistakes are free. They&apos;re labelled <span className="text-fix">Our fix</span>.</li>
          <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-read" />Agents pause and tell you before passing the cap.</li>
        </ul>
        <Button asChild variant="outline" size="sm" className="mt-4 w-full">
          <Link href="/settings#usage">See the breakdown and change the cap</Link>
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function UserMenu({ compact }: { compact?: boolean }) {
  const ws = useWorkspace();
  return <UserMenuView name={ws.user.name} isAnonymous={ws.user.isAnonymous} avatarUrl={ws.user.avatarUrl} compact={compact} />;
}

export function UserMenuView({ name, isAnonymous, avatarUrl, compact }: { name: string; isAnonymous: boolean; avatarUrl: string | null; compact?: boolean }) {
  const pathname = usePathname();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [leaving, startLeaving] = useTransition();
  const keepWork = useRef<HTMLAnchorElement>(null);
  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="ml-0.5 flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-amber/60" aria-label="Account">
          {isAnonymous && !compact && (
            <span className="hidden h-7 items-center rounded-full border border-amber/30 bg-amber-soft px-2.5 text-[11.5px] font-medium text-amber 2xl:inline-flex">Guest · keep this work</span>
          )}
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="size-7 rounded-full border border-hairline" />
          ) : (
            <span className="grid size-7 place-items-center rounded-full border border-hairline bg-raised text-[11px] font-semibold">{name.slice(0, 1).toUpperCase()}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <span className="block text-[13px]">{name}</span>
          <span className="block text-[11.5px] font-normal text-muted-foreground">{isAnonymous ? "Guest session · nothing is lost if you sign in" : "Signed in"}</span>
        </DropdownMenuLabel>
        {isAnonymous && (
          <DropdownMenuItem asChild>
            <Link href="/login?next=/home" className="text-amber">
              <UserRoundPlus /> Sign in to keep this work
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/home"><Home /> All projects</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/settings"><Settings /> Settings</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* A guest's work only exists in this session, so check before ending it. */}
        <DropdownMenuItem onSelect={() => (isAnonymous ? setConfirmSignOut(true) : void signOut())}><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {isAnonymous && (
      <Dialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        {/* Focus the safe choice, not "Sign out anyway". */}
        <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => { e.preventDefault(); keepWork.current?.focus(); }}>
          <DialogHeader>
            <DialogTitle>Sign out of this guest session?</DialogTitle>
            <DialogDescription>
              As a guest, your projects belong to this session only. Signing out ends it, and its projects can&apos;t be opened again. Sign in first and everything comes with you.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button variant="ghost" disabled={leaving} onClick={() => startLeaving(async () => { await signOut(); })}>
              {leaving ? <Loader2 className="animate-spin" /> : <LogOut />} Sign out anyway
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
