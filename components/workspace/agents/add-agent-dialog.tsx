"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Code2, Globe, Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/arch/segmented";
import { Frameworks, type Framework } from "@/lib/blueprint/schema";
import { FRAMEWORK_LABEL } from "@/lib/blueprint/describe";
import { addAgentFromDescription, addAgentFromSource } from "@/lib/actions/agents";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";

type Lane = "describe" | "code" | "endpoint";

export function AddAgentDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded: (id: string) => void }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [lane, setLane] = useState<Lane>("describe");
  const [text, setText] = useState("");
  const [loc, setLoc] = useState("");
  const [fw, setFw] = useState<Framework>("langgraph");
  const [protocol, setProtocol] = useState<"mcp" | "http" | "a2a">("mcp");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const r = lane === "describe" ? await addAgentFromDescription(ws.project.id, text) : await addAgentFromSource(ws.project.id, { kind: lane === "code" ? "code" : "endpoint", location: loc, framework: lane === "code" ? fw : undefined, protocol: lane === "endpoint" ? protocol : undefined });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Agent added", { description: "It starts careful. Loosen permissions when you trust it." });
      router.refresh();
      onAdded(r.agentId!);
      setText("");
      setLoc("");
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add an agent</DialogTitle>
          <DialogDescription>Describe a new one, or bring one you already have. Every agent gets the same permissions, rehearsals and replay.</DialogDescription>
        </DialogHeader>
        <Segmented<Lane>
          ariaLabel="How to add"
          value={lane}
          onChange={setLane}
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
          options={[
            { value: "describe", label: <><Sparkles className="size-3.5" />Describe it</> },
            { value: "code", label: <><Code2 className="size-3.5" />From code</> },
            { value: "endpoint", label: <><Globe className="size-3.5" />Point at an endpoint</> },
          ]}
        />
        {lane === "describe" && (
          <div>
            <label htmlFor="agent-desc" className="micro-label">What should it do?</label>
            <Textarea id="agent-desc" rows={4} className="mt-1.5 text-[13px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="Checks every payout above $10,000 against the claim file and flags anything that doesn't add up. Never approves payouts itself." />
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">{ws.llm === "live" ? "Claude drafts the job description, rules, tools and rehearsals. You review before it does anything." : "Offline mode: starts from a careful template you can edit."}</p>
          </div>
        )}
        {lane === "code" && (
          <div className="space-y-3">
            <div>
              <label htmlFor="agent-repo" className="micro-label">Where the agent lives</label>
              <Input id="agent-repo" className="mt-1.5 h-9 font-mono text-[12.5px]" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="github.com/acme/agents/tree/main/fraud_review.py" />
            </div>
            <div>
              <p className="micro-label">Framework</p>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {Frameworks.map((f) => (
                  <button key={f} onClick={() => setFw(f)} className={cn("rounded-md border px-2 py-1.5 text-[12px]", fw === f ? "border-amber/50 bg-amber-soft text-amber" : "border-hairline text-muted-foreground hover:text-foreground")}>{FRAMEWORK_LABEL[f]}</button>
                ))}
              </div>
            </div>
            <p className="text-[11.5px] text-muted-foreground">Runs unchanged. Architect wraps its tool calls with permissions and adds rehearsals and replay, no rewrite.</p>
          </div>
        )}
        {lane === "endpoint" && (
          <div className="space-y-3">
            <div>
              <label htmlFor="agent-url" className="micro-label">Endpoint</label>
              <Input id="agent-url" className="mt-1.5 h-9 font-mono text-[12.5px]" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="https://agents.acme.com/mcp/fraud-review" />
            </div>
            <Segmented ariaLabel="Protocol" value={protocol} onChange={setProtocol} options={[{ value: "mcp", label: "MCP" }, { value: "http", label: "HTTP" }, { value: "a2a", label: "A2A" }]} />
            <p className="text-[11.5px] text-muted-foreground">Treated like a colleague on another team: every request goes through your permissions and is logged.</p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={pending || (lane === "describe" ? text.trim().length < 10 : !loc.trim())} onClick={submit}>
            {pending ? <Loader2 className="animate-spin" /> : null} Add agent
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
