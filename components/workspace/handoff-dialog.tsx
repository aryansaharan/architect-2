"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/arch/badges";
import { objectLabel, resolveRef } from "@/lib/blueprint";
import { createHandoff } from "@/lib/actions/handoff";
import { hash } from "@/lib/sim/hash";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./context";

const MATES = [
  { id: "priya", name: "Priya Raman", role: "Platform engineer" },
  { id: "dev", name: "Dev Mehta", role: "Frontend engineer" },
  { id: "maya", name: "Maya Singh", role: "Claims lead" },
];

function suggestion(type: string | undefined, label: string, missing: boolean) {
  if (type === "connection") return missing ? `I don't have the key for ${label}. Can you connect the sandbox?` : `Can you check ${label} is set up the way we need?`;
  if (type === "agent") return `Can you review ${label}? I want to be sure it's safe before it goes live.`;
  if (type === "screen" || type === "block") return `Can you adjust ${label}? Here's what I'm after: `;
  return "Can you take a look at this with me?";
}

export function HandoffDialog() {
  const ws = useWorkspace();
  const open = Boolean(ws.handoffTarget);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && ws.closeHandoff()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-pencil text-[30px] font-medium leading-none">Ask a teammate</DialogTitle>
          <DialogDescription>They get everything they need to help: no screenshots, no “what did you click?”.</DialogDescription>
        </DialogHeader>
        {ws.handoffTarget && <HandoffForm key={`${ws.handoffTarget.type}:${ws.handoffTarget.id}`} />}
      </DialogContent>
    </Dialog>
  );
}

function HandoffForm() {
  const ws = useWorkspace();
  const router = useRouter();
  const target = ws.handoffTarget!;
  const label = objectLabel(ws.blueprint, target);
  const resolved = resolveRef(ws.blueprint, target);
  const missing = resolved?.type === "connection" && resolved.value.status === "missing";
  const [mate, setMate] = useState(target.type === "screen" || target.type === "block" ? "dev" : "priya");
  const [text, setText] = useState(() => suggestion(target.type, label, missing));
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-hairline bg-panel px-3 py-2 text-[12.5px]">
        <span className="text-muted-foreground">About</span>
        <span className="truncate font-medium">{label}</span>
      </div>
      <fieldset>
        <legend className="mb-2 text-[12.5px] font-medium">Who</legend>
        <div className="grid grid-cols-3 gap-2">
          {MATES.map((m) => (
            <button key={m.id} type="button" onClick={() => setMate(m.id)} aria-pressed={mate === m.id} className={cn("flex flex-col items-center gap-1.5 rounded-md border p-2.5 text-center transition-colors", mate === m.id ? "border-amber/50 bg-amber-soft" : "border-hairline bg-panel hover:border-hairline-hi")}>
              <Avatar name={m.name} hue={hash(m.id) % 360} size={30} />
              <span className="text-[12px] font-medium leading-tight">{m.name}</span>
              <span className="text-[10.5px] leading-tight text-muted-foreground">{m.role}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="handoff-text" className="mb-2 block text-[12.5px] font-medium">What you need</label>
        <Textarea id="handoff-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} className="bg-panel text-[13px]" />
      </div>
      <div>
        <p className="mb-2 text-[12.5px] font-medium">What they&apos;ll get</p>
        <ul className="grid grid-cols-2 gap-1.5 text-[12px]">
          {["The object and where it's used", "Your brief and last 3 requests", "The latest change, as a diff", "A link straight to it, in code view"].map((x) => (
            <li key={x} className="flex items-start gap-1.5 text-muted-foreground"><Check className="mt-0.5 size-3 shrink-0 text-read" />{x}</li>
          ))}
        </ul>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={() => ws.closeHandoff()}>Cancel</Button>
        <Button
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              const r = await createHandoff(ws.project.id, target, text, mate);
              if (!r.ok) return void toast.error(r.error ?? "Couldn't send");
              ws.closeHandoff();
              const m = MATES.find((x) => x.id === mate)!;
              toast.success(`Sent to ${m.name.split(" ")[0]}`, {
                description: "You'll see their fix in your activity, in plain English.",
                action: { label: "See what they see", onClick: () => router.push(`/p/${ws.project.id}/handoffs?h=${r.id}`) },
              });
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Send />} Send with context
        </Button>
      </div>
    </div>
  );
}
