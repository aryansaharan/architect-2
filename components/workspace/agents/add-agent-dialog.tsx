"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Code2, Globe, Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/arch/segmented";
import { Frameworks, type Framework } from "@/lib/blueprint/schema";
import { FRAMEWORK_LABEL } from "@/lib/blueprint/describe";
import { addAgentFromDescription, addAgentFromSource } from "@/lib/actions/agents";
import { agentLocationError } from "@/lib/import/detect";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";

type Lane = "describe" | "code" | "endpoint";

/** What drafting a helper from a description looks like while it happens (about 10 to 15 seconds live). */
const STAGES = [
  { at: 0, label: "Reading your description…" },
  { at: 2500, label: "Choosing tools and permissions…" },
  { at: 6000, label: "Writing its rules and job description…" },
  { at: 9500, label: "Planning test runs…" },
  { at: 12500, label: "Checking it fits the project…" },
];

export function AddAgentDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded: (id: string) => void }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [lane, setLane] = useState<Lane>("describe");
  const [text, setText] = useState("");
  const [loc, setLoc] = useState("");
  const [fw, setFw] = useState<Framework>("langgraph");
  const [protocol, setProtocol] = useState<"mcp" | "http" | "a2a">("mcp");
  const [pending, start] = useTransition();
  const [stage, setStage] = useState(0);
  const [touched, setTouched] = useState(false);
  const [busyLane, setBusyLane] = useState<Lane | null>(null);
  const drafting = pending && busyLane === "describe";
  const locError = lane !== "describe" && loc.trim() ? agentLocationError(lane === "code" ? "code" : "endpoint", loc) : null;
  const showLocError = touched && Boolean(locError);

  useEffect(() => {
    if (!drafting) return;
    const timers = STAGES.slice(1).map((st, i) => setTimeout(() => setStage(i + 1), st.at));
    return () => timers.forEach(clearTimeout);
  }, [drafting]);

  const submit = () => {
    if (lane !== "describe" && locError) return setTouched(true);
    setStage(0);
    setBusyLane(lane);
    start(async () => {
      const r = lane === "describe" ? await addAgentFromDescription(ws.project.id, text) : await addAgentFromSource(ws.project.id, { kind: lane === "code" ? "code" : "endpoint", location: loc, framework: lane === "code" ? fw : undefined, protocol: lane === "endpoint" ? protocol : undefined });
      if (!r.ok) return void toast.error(r.error);
      toast.success("AI helper added", { description: "It starts careful. Loosen what it may do once you trust it." });
      router.refresh();
      onAdded(r.agentId!);
      setText("");
      setLoc("");
      setTouched(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-pencil text-section font-medium">Add an AI helper</DialogTitle>
          <DialogDescription>Describe what it should do, or bring one you already have. Every helper gets the same permissions, test runs and replay.</DialogDescription>
        </DialogHeader>
        <Segmented<Lane>
          ariaLabel="How to add"
          value={lane}
          onChange={(v) => { setLane(v); setTouched(false); }}
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
          options={[
            { value: "describe", label: <><Sparkles className="size-3.5" />Describe it</> },
            { value: "code", label: <><Code2 className="size-3.5" />From code</> },
            { value: "endpoint", label: <><Globe className="size-3.5" />Runs elsewhere</> },
          ]}
        />
        {lane === "describe" && (
          <div>
            <label htmlFor="agent-desc" className="text-ui font-medium">What should it do?</label>
            <Textarea id="agent-desc" rows={4} className="paper-lines mt-1.5 bg-panel py-0 text-ui" value={text} disabled={drafting} onChange={(e) => setText(e.target.value)} placeholder="Checks every payout above $10,000 against the claim file and flags anything that doesn't add up. Never approves payouts itself." />
            {drafting ? (
              <div className="panel mt-2.5 rounded-md p-3" role="status" aria-live="polite">
                <ol className="space-y-1.5">
                  {STAGES.map((st, i) => (
                    <li key={st.label} className={cn("flex items-center gap-2 text-ui transition-opacity duration-250 ease-paper", i > stage ? "opacity-35" : "opacity-100")}>
                      {i < stage ? <Check className="size-3.5 shrink-0 text-ok" aria-hidden /> : i === stage ? <Loader2 className="size-3.5 shrink-0 animate-spin text-brand" aria-hidden /> : <span className="grid size-3.5 shrink-0 place-items-center" aria-hidden><span className="size-1 rounded-full bg-faint" /></span>}
                      <span className={cn(i === stage ? "text-foreground" : i < stage ? "text-muted-foreground" : "text-faint")}>{st.label}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2.5 text-badge text-muted-foreground">{ws.llm === "live" ? "Prod AI is drafting it. This usually takes 10 to 15 seconds." : "Offline mode: starting from a careful template."}</p>
              </div>
            ) : (
              <p className="mt-1.5 text-meta text-muted-foreground">{ws.llm === "live" ? "Prod AI writes its job, rules, actions and test runs. You check them before it does anything." : "Offline mode: starts from a careful template you can edit."}</p>
            )}
          </div>
        )}
        {lane === "code" && (
          <div className="space-y-3">
            <div>
              <label htmlFor="agent-repo" className="text-ui font-medium">Where its code lives</label>
              <Input id="agent-repo" className="mt-1.5 font-mono text-code" value={loc} onChange={(e) => setLoc(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={showLocError || undefined} aria-describedby={showLocError ? "agent-loc-error" : undefined} placeholder="github.com/acme/agents/tree/main/fraud_review.py" />
              {showLocError && <p id="agent-loc-error" className="mt-1.5 text-meta font-medium text-foreground/85">{locError}</p>}
            </div>
            <div>
              <p className="text-ui font-medium">Framework</p>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {Frameworks.map((f) => (
                  <button key={f} type="button" onClick={() => setFw(f)} aria-pressed={fw === f} className={cn("rounded-md border px-2 py-1.5 text-meta transition-colors duration-150", fw === f ? "border-brand/30 bg-brand-soft text-brand" : "border-hairline bg-panel text-muted-foreground hover:border-line-strong hover:text-foreground")}>{FRAMEWORK_LABEL[f]}</button>
                ))}
              </div>
            </div>
            <p className="text-meta text-muted-foreground">Runs unchanged, with no rewrite. Prod AI wraps its tool calls with permissions and adds test runs and replay.</p>
          </div>
        )}
        {lane === "endpoint" && (
          <div className="space-y-3">
            <div>
              <label htmlFor="agent-url" className="text-ui font-medium">Its web address</label>
              <Input id="agent-url" type="url" inputMode="url" className="mt-1.5 font-mono text-code" value={loc} onChange={(e) => setLoc(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={showLocError || undefined} aria-describedby={showLocError ? "agent-loc-error" : undefined} placeholder="https://agents.acme.com/mcp/fraud-review" />
              {showLocError && <p id="agent-loc-error" className="mt-1.5 text-meta font-medium text-foreground/85">{locError}</p>}
            </div>
            <Segmented ariaLabel="How it talks" value={protocol} onChange={setProtocol} options={[{ value: "mcp", label: "MCP" }, { value: "http", label: "HTTP" }, { value: "a2a", label: "A2A" }]} />
            <p className="text-meta text-muted-foreground">Treated like a colleague on another team: every request goes through your permissions and is logged.</p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={pending || (lane === "describe" ? text.trim().length < 10 : !loc.trim() || showLocError)} onClick={submit}>
            {pending ? <Loader2 className="animate-spin" /> : null} {drafting ? "Drafting…" : "Add helper"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
