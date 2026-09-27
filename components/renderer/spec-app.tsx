"use client";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BatteryFull, Bell, Check, ChevronLeft, Menu, Search, SignalHigh, Sparkles, Wifi, X } from "lucide-react";
import type { Block, Blueprint, Screen } from "@/lib/blueprint/schema";
import { DynamicIcon } from "@/components/icon";
import { hash } from "@/lib/sim/hash";
import { cn } from "@/lib/utils";
import { AppContext, type AppCtx, type AppMode } from "./app-context";
import { RenderBlock } from "./blocks";

const RADIUS = { sm: "4px", md: "8px", lg: "12px" } as const;
/** Below this frame width the agent chat folds into a drawer and the sidebar into an icon rail, so tables keep their columns. */
export const ROOMY_WIDTH = 1200;

export type WrapBlock = (block: Block, screen: Screen, node: React.ReactNode) => React.ReactNode;

/**
 * A second colour for each app, taken from its own theme: the primary's hue turned a little
 * (which way and how far is fixed by the app's name), so two apps that share a primary still
 * look like two apps. Used for the app mark and the screen badges, never for buttons.
 */
export function accentFor(primary: string, seed: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(primary.trim());
  if (!m) return primary;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  // Never turn into red: in an app, red means something needs attention.
  const turns = [-42, -28, 28, 42].filter((t) => {
    const x = (h + t + 360) % 360;
    return x > 20 && x < 335;
  });
  const turn = turns.length ? turns[hash(seed) % turns.length] : 0;
  const H = (h + turn + 360) % 360;
  const S = Math.min(0.75, Math.max(0.45, sat));
  const L = Math.min(0.48, Math.max(0.36, l));
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((H / 60) % 2) - 1));
  const o = L - c / 2;
  const [R, G, B] = H < 60 ? [c, x, 0] : H < 120 ? [x, c, 0] : H < 180 ? [0, c, x] : H < 240 ? [0, x, c] : H < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[R, G, B].map((v) => Math.round((v + o) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export type ScreenPurpose = "overview" | "detail" | "form" | "assistant";

/** What a screen is for, read from its blocks: one record, a form to fill in, a conversation, or an overview of many. */
export function screenPurpose(screen: Screen): ScreenPurpose {
  const main = screen.regions.main;
  if (main.some((b) => b.type === "form")) return "form";
  if (main.some((b) => b.type === "detail")) return "detail";
  if (main[0]?.type === "chat") return "assistant";
  return "overview";
}

export function SpecApp({
  bp,
  mode,
  device = "desktop",
  screenId: controlledScreen,
  onScreenChange,
  projectId,
  wrapBlock,
  overlay,
  navMarks,
}: {
  bp: Blueprint;
  mode: AppMode;
  device?: "desktop" | "tablet" | "phone";
  screenId?: string;
  onScreenChange?: (id: string) => void;
  projectId?: string;
  wrapBlock?: WrapBlock;
  overlay?: React.ReactNode;
  /** Screens to mark in the app's own navigation (e.g. unresolved comments), by screen id. */
  navMarks?: Record<string, number>;
}) {
  const [internalScreen, setInternalScreen] = useState(bp.screens[0]?.id);
  const screenId = controlledScreen && bp.screens.some((s) => s.id === controlledScreen) ? controlledScreen : internalScreen && bp.screens.some((s) => s.id === internalScreen) ? internalScreen : bp.screens[0].id;
  const screen = bp.screens.find((s) => s.id === screenId) ?? bp.screens[0];
  const [selectedRow, setSelectedRow] = useState<Record<string, number>>({});
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [menu, setMenu] = useState(false);
  // The frame's own width, not the window's: the studio preview sits beside panels.
  const rootRef = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  // Measured before paint, so a narrow frame never flashes the wide layout first.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setFrameWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const phone = device === "phone";
  const compact = !phone && (device === "tablet" || (frameWidth !== null && frameWidth < ROOMY_WIDTH));
  const [chatOpen, setChatOpen] = useState(false);

  const navigate = useCallback(
    (id: string) => {
      setInternalScreen(id);
      onScreenChange?.(id);
      setMenu(false);
      setChatOpen(false);
    },
    [onScreenChange],
  );
  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  const askAgent = useCallback(
    (agentId: string, prompt: string) => {
      const hasChat = (s: Screen) => [...s.regions.main, ...s.regions.side].some((b) => b.type === "chat" && b.agentId === agentId);
      const fire = () => window.dispatchEvent(new CustomEvent("prodai:ask-agent", { detail: { agentId, prompt } }));
      const name = bp.agents.find((a) => a.id === agentId)?.name ?? "The agent";
      // A folded chat drawer opens, so the answer is seen as it arrives.
      const inDrawer = (s: Screen) => compact && s.regions.side.some((b) => b.type === "chat" && b.agentId === agentId);
      if (hasChat(screen)) {
        if (inDrawer(screen)) setChatOpen(true);
        return fire();
      }
      const target = bp.screens.find(hasChat);
      if (target) {
        navigate(target.id);
        if (inDrawer(target)) setChatOpen(true);
        setTimeout(fire, 350);
      } else toast(`${name} is on it.`);
    },
    [bp, screen, navigate, toast, compact],
  );

  const ctx = useMemo<AppCtx>(
    () => ({
      bp,
      mode,
      device,
      screenId: screen.id,
      navigate,
      selectedRow,
      selectRow: (e, i) => setSelectedRow((s) => ({ ...s, [e]: i })),
      toast,
      askAgent,
      entity: (id) => bp.entities.find((e) => e.id === id),
      projectId,
    }),
    [bp, mode, device, screen.id, navigate, selectedRow, toast, askAgent, projectId],
  );

  const theme = bp.meta.theme;
  const accent = accentFor(theme.primary, bp.meta.name);
  const style = { "--app-primary": theme.primary, "--app-accent": accent, "--app-radius": RADIUS[theme.radius] } as React.CSSProperties;
  // Layout by purpose: a record screen leads back to the list it was opened from. Every block the
  // blueprint holds is shown, so a change that adds headline numbers to a record screen is never hidden.
  const purpose = screenPurpose(screen);
  const mainBlocks = screen.regions.main;
  const backTo =
    purpose === "detail"
      ? bp.screens.find((s) => s.id !== screen.id && [...s.regions.main, ...s.regions.side].some((b) => b.type === "table" && b.rowAction?.kind === "navigate" && b.rowAction.screenId === screen.id))
      : undefined;
  const team = bp.screens.filter((s) => s.audience !== "customer");
  const publicScreens = bp.screens.filter((s) => s.audience === "customer");
  // The preview shows a sample teammate; a published app never pretends a visitor is signed in.
  const viewer =
    mode === "live"
      ? { name: "Visitor", initials: "V", note: "Viewing the published app" }
      : { name: "Maya Singh", initials: "MS", note: bp.meta.auth.enabled ? "Signed in with SSO" : "Guest" };
  const initial = bp.meta.name.slice(0, 1).toUpperCase();
  const render = (b: Block) => {
    const node = <RenderBlock block={b} />;
    return <div key={b.id}>{wrapBlock ? wrapBlock(b, screen, node) : node}</div>;
  };
  // Narrow frames: the side chat folds into a drawer (one tap away) and other side blocks follow the main column.
  const drawerChats = compact ? screen.regions.side.filter((b): b is Extract<Block, { type: "chat" }> => b.type === "chat") : [];
  const sideInline = compact ? screen.regions.side.filter((b) => b.type !== "chat") : screen.regions.side;
  const drawerAgent = drawerChats[0] ? bp.agents.find((a) => a.id === drawerChats[0].agentId) : undefined;
  const chatVisible = chatOpen && drawerChats.length > 0;

  return (
    <AppContext.Provider value={ctx}>
      <div ref={rootRef} className={cn("relative flex h-full min-h-0 overflow-hidden bg-slate-50 font-sans text-slate-900 antialiased", phone && "app-phone flex-col", theme.density === "compact" && "text-[13px]")} style={style}>
        {!phone && (
          <aside className={cn("flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-300", compact ? "w-[60px]" : "w-[220px]")}>
            <div className={cn("flex items-center gap-2.5 py-4", compact ? "justify-center px-2" : "px-4")}>
              <span className="grid size-7 shrink-0 place-items-center rounded-lg text-[13px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--app-primary), var(--app-accent))" }} title={compact ? bp.meta.name : undefined}>{initial}</span>
              {!compact && <span className="truncate text-[13.5px] font-semibold">{bp.meta.name}</span>}
            </div>
            <nav className="flex-1 space-y-0.5 px-2" aria-label="App">
              {team.map((s) => <NavItem key={s.id} s={s} active={s.id === screen.id} onClick={() => navigate(s.id)} iconOnly={compact} marks={navMarks?.[s.id]} />)}
              {publicScreens.length > 0 && (
                <>
                  {compact ? <hr className="mx-2 my-3 border-slate-100" /> : <p className="px-2.5 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-slate-400">Public pages</p>}
                  {publicScreens.map((s) => <NavItem key={s.id} s={s} active={s.id === screen.id} onClick={() => navigate(s.id)} iconOnly={compact} marks={navMarks?.[s.id]} />)}
                </>
              )}
            </nav>
            <div className={cn("flex items-center gap-2 border-t border-slate-100 py-3", compact ? "justify-center px-2" : "px-4")}>
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600" title={compact ? viewer.name : undefined}>{viewer.initials}</span>
              {!compact && (
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-medium">{viewer.name}</span>
                  <span className="block truncate text-[11px] text-slate-400">{viewer.note}</span>
                </span>
              )}
            </div>
          </aside>
        )}
        {phone && mode === "preview" && (
          <div aria-hidden className="flex h-[42px] shrink-0 items-end justify-between bg-white px-6 pb-1 text-[12.5px] font-semibold tracking-tight text-slate-900">
            <span className="w-14">9:41</span>
            <span className="flex w-14 items-center justify-end gap-1"><SignalHigh className="size-3.5" /><Wifi className="size-3.5" /><BatteryFull className="size-4" /></span>
          </div>
        )}
        {phone && (
          <div className="relative z-10 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
            {backTo ? (
              <button type="button" onClick={() => navigate(backTo.id)} className="-ml-1 grid size-6 place-items-center rounded-md text-slate-500" aria-label={`Back to ${backTo.title}`}><ChevronLeft className="size-4" /></button>
            ) : (
              <span className="grid size-6 place-items-center rounded-md text-[11px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--app-primary), var(--app-accent))" }}>{initial}</span>
            )}
            <span className="truncate text-[13px] font-semibold">{screen.title}</span>
            <button onClick={() => setMenu((m) => !m)} className="ml-auto rounded-md p-1.5 text-slate-500" aria-label="Menu"><Menu className="size-4" /></button>
            {menu && (
              <nav className="absolute inset-x-2 top-11 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg" aria-label="App">
                {bp.screens.map((s) => <NavItem key={s.id} s={s} active={s.id === screen.id} onClick={() => navigate(s.id)} />)}
              </nav>
            )}
          </div>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!phone && (
            <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
              {!backTo && (
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[var(--app-radius)]" style={{ background: "color-mix(in oklab, var(--app-accent) 11%, white)", color: "var(--app-accent)" }}>
                  <DynamicIcon name={screen.icon} className="size-[18px]" />
                </span>
              )}
              <div className="min-w-0">
                {backTo && (
                  <button type="button" onClick={() => navigate(backTo.id)} className="-ml-1 mb-0.5 inline-flex items-center gap-0.5 rounded px-1 text-[12px] font-medium text-slate-500 transition-colors hover:text-[var(--app-primary)]">
                    <ChevronLeft className="size-3.5" aria-hidden />
                    {backTo.title}
                  </button>
                )}
                <h1 className="truncate text-[16px] font-semibold tracking-tight">{screen.title}</h1>
                <p className="truncate text-[12.5px] text-slate-500">{screen.purpose}</p>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2 text-slate-400">
                {drawerChats.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setChatOpen((o) => !o)}
                    aria-expanded={chatVisible}
                    aria-controls="app-chat-drawer"
                    className={cn("inline-flex h-8 items-center gap-1.5 rounded-[var(--app-radius)] border px-2.5 text-[12.5px] font-medium transition-colors", chatVisible ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}
                    style={chatVisible ? { background: "var(--app-primary)" } : undefined}
                  >
                    <Sparkles className="size-3.5" />
                    {drawerAgent ? `Ask ${drawerAgent.name}` : "Ask the agent"}
                  </button>
                )}
                {!compact && purpose !== "form" && <span className="hidden h-8 items-center gap-2 rounded-[var(--app-radius)] border border-slate-200 px-2.5 text-[12.5px] lg:flex"><Search className="size-3.5" />Search</span>}
                <span className="grid size-8 place-items-center rounded-[var(--app-radius)] border border-slate-200"><Bell className="size-3.5" /></span>
              </div>
            </header>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className={cn("mx-auto grid gap-5", phone ? "p-3" : device === "tablet" ? "p-4" : "p-6", screen.layout === "form" && !phone ? "max-w-5xl" : "max-w-[1400px]")}>
              {screen.regions.side.length > 0 && !phone && !compact ? (
                <div className={cn("grid items-start gap-5", screen.layout === "split" ? "grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]" : screen.layout === "form" ? "grid-cols-[minmax(0,1.5fr)_minmax(240px,1fr)]" : "grid-cols-[minmax(0,2.2fr)_minmax(280px,1fr)]")}>
                  <div className="min-w-0 space-y-5">{mainBlocks.map(render)}</div>
                  <div className="min-w-0 space-y-5">{screen.regions.side.map(render)}</div>
                </div>
              ) : (
                <div className={cn("min-w-0 space-y-5", screen.layout === "form" && "mx-auto w-full max-w-2xl")}>{[...mainBlocks, ...sideInline].map(render)}</div>
              )}
            </div>
          </div>
        </div>
        {drawerChats.length > 0 && (
          <>
            <button type="button" aria-hidden tabIndex={-1} onClick={() => setChatOpen(false)} className={cn("absolute inset-0 z-20 bg-slate-900/10 transition-opacity duration-300", chatVisible ? "opacity-100" : "pointer-events-none opacity-0")} />
            {/* Kept mounted while closed, so the conversation survives toggling and "Ask" buttons still reach it. */}
            <aside
              id="app-chat-drawer"
              aria-label={drawerAgent ? `Ask ${drawerAgent.name}` : "Agent chat"}
              inert={!chatVisible}
              className={cn("app-drawer absolute inset-y-0 right-0 z-30 flex w-[min(400px,88%)] flex-col border-l border-slate-200 bg-slate-50 shadow-[-24px_0_48px_-24px_rgb(15_23_42/0.35)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", chatVisible ? "translate-x-0" : "translate-x-full")}
            >
              <div className="flex items-center justify-end px-3 pt-2.5">
                <button type="button" onClick={() => setChatOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close chat"><X className="size-4" /></button>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-3">{drawerChats.map(render)}</div>
            </aside>
          </>
        )}
        <div className="pointer-events-none absolute bottom-4 right-4 z-20 space-y-2">
          {toasts.map((t) => (
            <div key={t.id} role="status" className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-[12.5px] text-white shadow-lg animate-in fade-in slide-in-from-bottom-2">
              <Check className="size-3.5 text-emerald-400" />
              {t.msg}
            </div>
          ))}
        </div>
        {overlay}
      </div>
    </AppContext.Provider>
  );
}

function NavItem({ s, active, onClick, iconOnly = false, marks }: { s: Screen; active: boolean; onClick: () => void; iconOnly?: boolean; marks?: number }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={iconOnly ? `${s.title}${marks ? `, ${marks} open comment${marks === 1 ? "" : "s"}` : ""}` : undefined}
      title={iconOnly ? s.title : undefined}
      className={cn("relative flex w-full items-center gap-2.5 rounded-lg py-2 text-left text-[13px] transition-colors", iconOnly ? "justify-center px-0" : "px-2.5", active ? "font-medium" : "text-slate-600 hover:bg-slate-50")}
      style={active ? { background: "color-mix(in oklab, var(--app-primary) 10%, white)", color: "var(--app-primary)" } : undefined}
    >
      <DynamicIcon name={s.icon} className="size-4 shrink-0" />
      {!iconOnly && <span className="min-w-0 flex-1 truncate">{s.title}</span>}
      {marks ? <span className={cn("size-1.5 shrink-0 rounded-full bg-sky-500", iconOnly && "absolute right-2 top-1.5")} aria-hidden={iconOnly} title={iconOnly ? undefined : `${marks} open comment${marks === 1 ? "" : "s"}`} /> : null}
    </button>
  );
}
