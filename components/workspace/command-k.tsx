"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Code2, ExternalLink, Eye, FileText, History, Inbox, Keyboard, Map as MapIcon, NotebookPen, Play, Rocket, Settings, UsersRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { DynamicIcon } from "@/components/icon";
import { useWorkspace } from "./context";

/** "G then a letter" goes to a page. "" is the Sheet. B still reaches the plan map, its old letter. */
const GO: Record<string, string> = { s: "", a: "agents", p: "ship", m: "blueprint", b: "blueprint", t: "preview", c: "code", h: "handoffs" };

export function CommandK() {
  const ws = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const base = `/p/${ws.project.id}`;
  const gAt = useRef(0);
  const live = useRef({ ws, router, base });
  useEffect(() => {
    live.current = { ws, router, base };
  });

  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return Boolean(el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)));
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const { ws, router, base } = live.current;
      if (e.key === "Escape") {
        // Menus, popovers and dialogs close themselves on Esc and mark the event handled.
        // Leave them (and modal cards like the repair choice) alone; otherwise close the inspector.
        if (e.defaultPrevented || document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"], [aria-modal="true"]')) return;
        if (ws.selected) {
          e.preventDefault();
          ws.select(null);
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (Date.now() - gAt.current < 1200) {
        gAt.current = 0;
        const to = GO[k];
        if (to !== undefined) {
          e.preventDefault();
          router.push(to ? `${base}/${to}` : base);
        }
        return;
      }
      if (k === "g") gAt.current = Date.now();
      else if (e.key === "?") {
        e.preventDefault();
        setSheet(true);
      } else if (e.key === "/") {
        e.preventDefault();
        ws.focusComposer(ws.selected);
      }
    };
    const onOpen = () => setOpen(true);
    const onSheet = () => setSheet(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("prodai:command-k", onOpen);
    window.addEventListener("prodai:shortcuts", onSheet);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("prodai:command-k", onOpen);
      window.removeEventListener("prodai:shortcuts", onSheet);
    };
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <>
    <ShortcutSheet open={sheet} onOpenChange={setSheet} />
    <CommandDialog open={open} onOpenChange={setOpen} title="Jump anywhere" description="Search pages, screens, AI helpers and actions">
      <Command>
        <CommandInput placeholder="Jump to a page, screen, AI helper or action…" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Go to">
            <CommandItem onSelect={() => run(() => router.push(base))}><FileText /> Sheet<CommandShortcut>G S</CommandShortcut></CommandItem>
            <CommandItem onSelect={() => run(() => router.push(`${base}/agents`))}><Bot /> AI helpers<CommandShortcut>G A</CommandShortcut></CommandItem>
            <CommandItem onSelect={() => run(() => router.push(`${base}/ship`))}><Rocket /> Publish<CommandShortcut>G P</CommandShortcut></CommandItem>
            <CommandItem value="plan map under the hood" onSelect={() => run(() => router.push(`${base}/blueprint`))}><MapIcon /> Plan map<CommandShortcut>G M</CommandShortcut></CommandItem>
            <CommandItem value="preview and tweak under the hood" onSelect={() => run(() => router.push(`${base}/preview`))}><Eye /> Preview and tweak<CommandShortcut>G T</CommandShortcut></CommandItem>
            <CommandItem value="code and github under the hood" onSelect={() => run(() => router.push(`${base}/code`))}><Code2 /> Code and GitHub<CommandShortcut>G C</CommandShortcut></CommandItem>
            <CommandItem value="handoffs teammates under the hood" onSelect={() => run(() => router.push(`${base}/handoffs`))}><Inbox /> Handoffs<CommandShortcut>G H</CommandShortcut></CommandItem>
            <CommandItem onSelect={() => run(() => router.push("/settings"))}><Settings /> Settings</CommandItem>
          </CommandGroup>
          <CommandGroup heading="Actions">
            <CommandItem value="write a note ask for a change" onSelect={() => run(() => ws.focusComposer(ws.selected))}><NotebookPen /> Write a note (ask for a change)<CommandShortcut>/</CommandShortcut></CommandItem>
            <CommandItem onSelect={() => run(() => setSheet(true))}><Keyboard /> Keyboard shortcuts<CommandShortcut>?</CommandShortcut></CommandItem>
            <CommandItem onSelect={() => run(() => ws.openHandoff(ws.selected))}><UsersRound /> Ask a teammate</CommandItem>
            <CommandItem onSelect={() => run(() => router.push(`${base}/code?compare=1`))}><History /> Compare versions</CommandItem>
            {ws.project.buildState === "built" && (
              // The Sheet inks the app in again as the build replays, step by step.
              <CommandItem onSelect={() => run(() => { router.push(base); void ws.build.start({ replay: true }); })}><Play /> Replay how it was built</CommandItem>
            )}
            {ws.liveSlug && <CommandItem onSelect={() => run(() => window.open(`/live/${ws.liveSlug}`, "_blank"))}><ExternalLink /> Open the published app</CommandItem>}
          </CommandGroup>
          <CommandGroup heading="Screens">
            {ws.blueprint.screens.map((s) => (
              <CommandItem key={s.id} value={`screen ${s.title}`} onSelect={() => run(() => router.push(`${base}/preview?screen=${s.id}`))}>
                <DynamicIcon name={s.icon} /> {s.title}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="AI helpers">
            {ws.blueprint.agents.map((a) => (
              <CommandItem key={a.id} value={`ai helper agent ${a.name} ${a.role}`} onSelect={() => run(() => router.push(`${base}/agents?agent=${a.id}`))}>
                <Bot /> {a.name}
                <span className="ml-2 truncate text-xs text-muted-foreground">{a.role}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
    </>
  );
}

const SHORTCUTS: { group: string; items: { keys: string[]; label: string }[] }[] = [
  { group: "Anywhere in a project", items: [
    { keys: ["⌘", "K"], label: "Jump to a page, screen, AI helper or action" },
    { keys: ["/"], label: "Write a note (about what's selected, if anything)" },
    { keys: ["?"], label: "Show these shortcuts" },
    { keys: ["Esc"], label: "Close a panel or clear the selection" },
  ] },
  { group: "Go to", items: [
    { keys: ["G", "S"], label: "Sheet" },
    { keys: ["G", "A"], label: "AI helpers" },
    { keys: ["G", "P"], label: "Publish" },
    { keys: ["G", "M"], label: "Plan map" },
    { keys: ["G", "T"], label: "Preview and tweak" },
    { keys: ["G", "C"], label: "Code and GitHub" },
    { keys: ["G", "H"], label: "Handoffs" },
  ] },
  { group: "Writing a note", items: [
    { keys: ["↵"], label: "Send it (you get a price before anything changes)" },
    { keys: ["⇧", "↵"], label: "New line" },
    { keys: ["⌘", "↵"], label: "Plan it (on Home)" },
  ] },
];

function ShortcutSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Everything is clickable too. Shortcuts are there when you want speed.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-2">
          {SHORTCUTS.map((g) => (
            <div key={g.group} className={g.group === "Anywhere in a project" ? "sm:col-span-2" : undefined}>
              <p className="micro-label">{g.group}</p>
              <ul className="mt-2 space-y-1.5">
                {g.items.map((it) => (
                  <li key={it.label} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-muted-foreground">{it.label}</span>
                    <KbdGroup>{it.keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}</KbdGroup>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
