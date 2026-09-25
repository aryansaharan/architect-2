"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Blocks, Bot, Code2, ExternalLink, Eye, History, MessageSquarePlus, Play, Rocket, Settings, UsersRound } from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { DynamicIcon } from "@/components/icon";
import { useWorkspace } from "./context";

export function CommandK() {
  const ws = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const base = `/p/${ws.project.id}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("architect:command-k", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("architect:command-k", onOpen);
    };
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Jump anywhere" description="Search screens, agents and actions">
      <Command>
        <CommandInput placeholder="Jump to a screen, agent or action…" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Go to">
            <CommandItem onSelect={() => run(() => router.push(`${base}/blueprint`))}><Blocks /> Blueprint<CommandShortcut>G B</CommandShortcut></CommandItem>
            <CommandItem onSelect={() => run(() => router.push(`${base}/preview`))}><Eye /> Preview<CommandShortcut>G P</CommandShortcut></CommandItem>
            <CommandItem onSelect={() => run(() => router.push(`${base}/agents`))}><Bot /> Agents<CommandShortcut>G A</CommandShortcut></CommandItem>
            <CommandItem onSelect={() => run(() => router.push(`${base}/code`))}><Code2 /> Code<CommandShortcut>G C</CommandShortcut></CommandItem>
            <CommandItem onSelect={() => run(() => router.push(`${base}/ship`))}><Rocket /> Ship<CommandShortcut>G S</CommandShortcut></CommandItem>
            <CommandItem onSelect={() => run(() => router.push(`${base}/handoffs`))}><UsersRound /> Handoffs</CommandItem>
            <CommandItem onSelect={() => run(() => router.push("/settings"))}><Settings /> Settings</CommandItem>
          </CommandGroup>
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => run(() => ws.focusComposer(ws.selected))}><MessageSquarePlus /> Ask for a change</CommandItem>
            <CommandItem onSelect={() => run(() => ws.openHandoff(ws.selected))}><UsersRound /> Ask a teammate</CommandItem>
            <CommandItem onSelect={() => run(() => router.push(`${base}/code?compare=1`))}><History /> Compare save points</CommandItem>
            {ws.project.buildState === "built" && (
              <CommandItem onSelect={() => run(() => { router.push(`${base}/blueprint`); void ws.build.start({ replay: true }); })}><Play /> Replay how it was built</CommandItem>
            )}
            {ws.liveSlug && <CommandItem onSelect={() => run(() => window.open(`/live/${ws.liveSlug}`, "_blank"))}><ExternalLink /> Open the live version</CommandItem>}
          </CommandGroup>
          <CommandGroup heading="Screens">
            {ws.blueprint.screens.map((s) => (
              <CommandItem key={s.id} value={`screen ${s.title}`} onSelect={() => run(() => router.push(`${base}/preview?screen=${s.id}`))}>
                <DynamicIcon name={s.icon} /> {s.title}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Agents">
            {ws.blueprint.agents.map((a) => (
              <CommandItem key={a.id} value={`agent ${a.name} ${a.role}`} onSelect={() => run(() => router.push(`${base}/agents?agent=${a.id}`))}>
                <Bot /> {a.name}
                <span className="ml-2 truncate text-xs text-muted-foreground">{a.role}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
