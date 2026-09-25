"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Blocks, Bot, Check, ChevronDown, PanelLeft, Code2, Copy, ExternalLink, History, Home, LogOut, Eye, Rocket, Settings, Share2, Undo2, UsersRound, UserRoundPlus,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/arch/badges";
import { TimeAgo } from "@/components/time-ago";
import { cn } from "@/lib/utils";
import { creditsUsd, formatCredits } from "@/lib/format";
import { restoreCheckpoint } from "@/lib/actions/checkpoints";
import { signOut } from "@/lib/actions/auth";
import { useWorkspace } from "./context";

const TABS = [
  { slug: "blueprint", label: "Blueprint", icon: Blocks },
  { slug: "preview", label: "Preview", icon: Eye },
  { slug: "agents", label: "Agents", icon: Bot },
  { slug: "code", label: "Code", icon: Code2 },
  { slug: "ship", label: "Ship", icon: Rocket },
] as const;

export function TopBar() {
  const ws = useWorkspace();
  const pathname = usePathname();
  const base = `/p/${ws.project.id}`;
  const building = ws.build.status === "running" || ws.build.status === "repair" || ws.build.status === "finishing";

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-hairline bg-panel/80 px-2.5 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-panel/70 md:h-12 md:flex-nowrap md:py-0">
      <div className="flex min-w-0 items-center gap-2">
        <Link href="/home" aria-label="All projects" className="grid size-8 place-items-center rounded-md hover:bg-raised">
          <LogoMark />
        </Link>
        <span className="text-hairline" aria-hidden>/</span>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-[13.5px] font-medium" title={ws.project.name}>{ws.project.name}</h1>
          <StatusBadge state={building ? "building" : ws.project.buildState} live={Boolean(ws.liveSlug)} />
          {ws.project.isDemo && <span className="hidden rounded-full border border-hairline px-2 py-0.5 text-[10.5px] text-muted-foreground xl:inline">Demo project</span>}
        </div>
      </div>

      <nav aria-label="Project" className="mx-auto flex items-center gap-0.5 rounded-lg border border-hairline bg-deep p-0.5 max-md:order-last max-md:w-full max-md:justify-between">
        {TABS.map((t) => {
          const href = `${base}/${t.slug}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={t.slug}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors",
                active ? "bg-raised text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className={cn("size-3.5", active && "text-amber")} aria-hidden />
              <span className="max-md:sr-only">{t.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-1.5 max-md:ml-auto">
        <button type="button" onClick={() => window.dispatchEvent(new Event("architect:open-rail"))} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground lg:hidden" aria-label="Brief and activity">
          <PanelLeft className="size-4" />
        </button>
        <button type="button" onClick={() => window.dispatchEvent(new Event("architect:command-k"))} className="hidden h-8 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-raised hover:text-foreground 2xl:flex" aria-label="Open command palette">
          Jump to <span className="kbd">⌘K</span>
        </button>
        <div className="max-sm:hidden"><SavePoints /></div>
        <SpendMeter />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 max-lg:px-2" onClick={() => ws.openHandoff(ws.selected)}>
              <UsersRound className="size-3.5" />
              <span className="max-lg:sr-only">Ask a teammate</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Hand this to an engineer with full context</TooltipContent>
        </Tooltip>
        <div className="max-sm:hidden"><ShareButton /></div>
        <UserMenu />
      </div>
    </header>
  );
}

function SavePoints() {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
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
          <span>Save points</span>
          <span className="font-normal text-muted-foreground">Going back is always free</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
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

function SpendMeter() {
  const ws = useWorkspace();
  const { credits, cap } = ws.usage;
  const pct = Math.min(1, cap ? credits / cap : 0);
  const tone = pct >= 0.9 ? "bg-ask" : pct >= 0.7 ? "bg-amber" : "bg-read";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="group flex h-8 items-center gap-2 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-raised hover:text-foreground" aria-label={`Spend: ${formatCredits(credits)} of ${cap} credits`}>
          <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-raised max-sm:hidden">
            <span className={cn("absolute inset-y-0 left-0 rounded-full transition-all", tone)} style={{ width: `${Math.max(3, pct * 100)}%` }} />
          </span>
          <span className="font-mono tabular-nums">{Math.round(credits)}<span className="opacity-60">/{cap}</span></span>
        </button>
      </PopoverTrigger>
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
          <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-read" />Fixes for our own mistakes are free — they&apos;re labelled <span className="text-fix">Our fix</span>.</li>
          <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-read" />Agents pause and tell you before passing the cap.</li>
        </ul>
        <Button asChild variant="outline" size="sm" className="mt-4 w-full">
          <Link href="/settings#usage">See the breakdown and change the cap</Link>
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function ShareButton() {
  const ws = useWorkspace();
  const [copied, setCopied] = useState(false);
  const url = ws.liveSlug ? `${typeof window === "undefined" ? "" : window.location.origin}/live/${ws.liveSlug}` : null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="size-8" aria-label="Share">
          <Share2 className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="text-sm font-medium">Share</p>
        {url ? (
          <>
            <p className="mt-1 text-[13px] text-muted-foreground">Anyone with the link can use the live version.</p>
            <div className="mt-3 flex gap-1.5">
              <code className="min-w-0 flex-1 truncate rounded-md border border-hairline bg-deep px-2 py-1.5 font-mono text-[12px]">{url.replace(/^https?:\/\//, "")}</code>
              <Button
                size="icon-sm"
                variant="outline"
                className="size-8"
                aria-label="Copy link"
                onClick={() => {
                  void navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="text-read" /> : <Copy />}
              </Button>
              <Button asChild size="icon-sm" variant="outline" className="size-8" aria-label="Open live version">
                <a href={`/live/${ws.liveSlug}`} target="_blank" rel="noreferrer"><ExternalLink /></a>
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-1 text-[13px] text-muted-foreground">Not live yet. Go live from the Ship tab to get a link.</p>
        )}
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="flex items-center gap-2 text-[13px] font-medium"><UserRoundPlus className="size-3.5" />Invite to this project</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Roles: Owner · Editor · Viewer. Viewers can comment and approve, not change.</p>
          <Button asChild size="sm" variant="outline" className="mt-2.5 w-full">
            <Link href="/settings#team">Manage people and roles</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function UserMenu({ compact }: { compact?: boolean }) {
  const ws = useWorkspace();
  return <UserMenuView name={ws.user.name} isAnonymous={ws.user.isAnonymous} avatarUrl={ws.user.avatarUrl} compact={compact} />;
}

export function UserMenuView({ name, isAnonymous, avatarUrl, compact }: { name: string; isAnonymous: boolean; avatarUrl: string | null; compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="ml-0.5 flex items-center gap-2 rounded-full outline-none" aria-label="Account">
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
          <span className="block text-[11.5px] font-normal text-muted-foreground">{isAnonymous ? "Guest session — nothing is lost if you sign in" : "Signed in"}</span>
        </DropdownMenuLabel>
        {isAnonymous && (
          <DropdownMenuItem asChild>
            <Link href="/login?next=/home" className="text-amber">
              <UserRoundPlus /> Keep this work — sign in
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/home"><Home /> All projects</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/settings"><Settings /> Settings</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
