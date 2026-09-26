"use client";
import { useCallback, useMemo, useState } from "react";
import { BatteryFull, Bell, Check, Menu, Search, SignalHigh, Wifi } from "lucide-react";
import type { Block, Blueprint, Screen } from "@/lib/blueprint/schema";
import { DynamicIcon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { AppContext, type AppCtx, type AppMode } from "./app-context";
import { RenderBlock } from "./blocks";

const RADIUS = { sm: "4px", md: "8px", lg: "12px" } as const;

export type WrapBlock = (block: Block, screen: Screen, node: React.ReactNode) => React.ReactNode;

export function SpecApp({
  bp,
  mode,
  device = "desktop",
  screenId: controlledScreen,
  onScreenChange,
  projectId,
  wrapBlock,
  overlay,
}: {
  bp: Blueprint;
  mode: AppMode;
  device?: "desktop" | "tablet" | "phone";
  screenId?: string;
  onScreenChange?: (id: string) => void;
  projectId?: string;
  wrapBlock?: WrapBlock;
  overlay?: React.ReactNode;
}) {
  const [internalScreen, setInternalScreen] = useState(bp.screens[0]?.id);
  const screenId = controlledScreen && bp.screens.some((s) => s.id === controlledScreen) ? controlledScreen : internalScreen && bp.screens.some((s) => s.id === internalScreen) ? internalScreen : bp.screens[0].id;
  const screen = bp.screens.find((s) => s.id === screenId) ?? bp.screens[0];
  const [selectedRow, setSelectedRow] = useState<Record<string, number>>({});
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [menu, setMenu] = useState(false);

  const navigate = useCallback(
    (id: string) => {
      setInternalScreen(id);
      onScreenChange?.(id);
      setMenu(false);
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
      const fire = () => window.dispatchEvent(new CustomEvent("architect:ask-agent", { detail: { agentId, prompt } }));
      const name = bp.agents.find((a) => a.id === agentId)?.name ?? "The agent";
      if (hasChat(screen)) return fire();
      const target = bp.screens.find(hasChat);
      if (target) {
        navigate(target.id);
        setTimeout(fire, 350);
      } else toast(`${name} is on it.`);
    },
    [bp, screen, navigate, toast],
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
  const style = { "--app-primary": theme.primary, "--app-radius": RADIUS[theme.radius] } as React.CSSProperties;
  const team = bp.screens.filter((s) => s.audience !== "customer");
  const publicScreens = bp.screens.filter((s) => s.audience === "customer");
  const phone = device === "phone";
  const initial = bp.meta.name.slice(0, 1).toUpperCase();
  const render = (b: Block) => {
    const node = <RenderBlock block={b} />;
    return <div key={b.id}>{wrapBlock ? wrapBlock(b, screen, node) : node}</div>;
  };

  return (
    <AppContext.Provider value={ctx}>
      <div className={cn("relative flex h-full min-h-0 bg-slate-50 font-sans text-slate-900 antialiased", phone && "app-phone flex-col", theme.density === "compact" && "text-[13px]")} style={style}>
        {!phone && (
          <aside className={cn("flex shrink-0 flex-col border-r border-slate-200 bg-white", device === "tablet" ? "w-[184px]" : "w-[220px]")}>
            <div className="flex items-center gap-2.5 px-4 py-4">
              <span className="grid size-7 place-items-center rounded-lg text-[13px] font-bold text-white" style={{ background: "var(--app-primary)" }}>{initial}</span>
              <span className="truncate text-[13.5px] font-semibold">{bp.meta.name}</span>
            </div>
            <nav className="flex-1 space-y-0.5 px-2" aria-label="App">
              {team.map((s) => <NavItem key={s.id} s={s} active={s.id === screen.id} onClick={() => navigate(s.id)} />)}
              {publicScreens.length > 0 && (
                <>
                  <p className="px-2.5 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-slate-400">Public pages</p>
                  {publicScreens.map((s) => <NavItem key={s.id} s={s} active={s.id === screen.id} onClick={() => navigate(s.id)} />)}
                </>
              )}
            </nav>
            <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
              <span className="grid size-7 place-items-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">MS</span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-medium">Maya Singh</span>
                <span className="block truncate text-[11px] text-slate-400">{bp.meta.auth.enabled ? "Signed in with SSO" : "Guest"}</span>
              </span>
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
            <span className="grid size-6 place-items-center rounded-md text-[11px] font-bold text-white" style={{ background: "var(--app-primary)" }}>{initial}</span>
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
            <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-3">
              <div className="min-w-0">
                <h1 className="truncate text-[16px] font-semibold tracking-tight">{screen.title}</h1>
                <p className="truncate text-[12.5px] text-slate-500">{screen.purpose}</p>
              </div>
              <div className="ml-auto flex items-center gap-2 text-slate-400">
                <span className="hidden h-8 items-center gap-2 rounded-[var(--app-radius)] border border-slate-200 px-2.5 text-[12.5px] lg:flex"><Search className="size-3.5" />Search</span>
                <span className="grid size-8 place-items-center rounded-[var(--app-radius)] border border-slate-200"><Bell className="size-3.5" /></span>
              </div>
            </header>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className={cn("mx-auto grid gap-5", phone ? "p-3" : device === "tablet" ? "p-4" : "p-6", screen.layout === "form" && !phone ? "max-w-5xl" : "max-w-[1400px]")}>
              {screen.regions.side.length > 0 && !phone ? (
                <div className={cn("grid items-start gap-5", screen.layout === "split" ? "grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]" : screen.layout === "form" ? "grid-cols-[minmax(0,1.5fr)_minmax(240px,1fr)]" : "grid-cols-[minmax(0,2.2fr)_minmax(280px,1fr)]", device === "tablet" && "grid-cols-1")}>
                  <div className="min-w-0 space-y-5">{screen.regions.main.map(render)}</div>
                  <div className="min-w-0 space-y-5">{screen.regions.side.map(render)}</div>
                </div>
              ) : (
                <div className={cn("min-w-0 space-y-5", screen.layout === "form" && "mx-auto w-full max-w-2xl")}>{[...screen.regions.main, ...screen.regions.side].map(render)}</div>
              )}
            </div>
          </div>
        </div>
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

function NavItem({ s, active, onClick }: { s: Screen; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-current={active ? "page" : undefined} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors", active ? "font-medium" : "text-slate-600 hover:bg-slate-50")} style={active ? { background: "color-mix(in oklab, var(--app-primary) 10%, white)", color: "var(--app-primary)" } : undefined}>
      <DynamicIcon name={s.icon} className="size-4 shrink-0" />
      <span className="truncate">{s.title}</span>
    </button>
  );
}
