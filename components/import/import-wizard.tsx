"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bot, Check, CircleHelp, EyeOff, GitBranch, Plus, Star, X } from "lucide-react";
import type { ImportReportWithTree } from "@/lib/import/snapshot";
import { FRAMEWORK_LABEL, describeAgents, pickAgents, type DetectedAgent } from "@/lib/import/agents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GitHubMark } from "@/components/brand/logo";
import { PlanningView, usePlanStream } from "@/components/new/plan-stream";
import { PencilBox } from "@/components/landing/sketches";
import { cn } from "@/lib/utils";
import { Term } from "@/components/arch/term";

const EXAMPLES = ["openai/openai-cs-agents-demo", "langchain-ai/langgraph-example", "crewAIInc/crewAI-examples", "vercel/chatbot"];
const READ_STEPS = ["Fetching the repository details", "Listing every file", "Reading the manifests and README", "Reading agent definitions in the source", "Writing down what it understood"];

type Step = "input" | "reading" | "report" | "mapping";

export function ImportWizard({ initialRepo, llm = "live" }: { initialRepo: string; llm?: "live" | "offline" }) {
  const [step, setStep] = useState<Step>("input");
  const [repo, setRepo] = useState(initialRepo);
  const [readStep, setReadStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReportWithTree | null>(null);
  const [rules, setRules] = useState<{ text: string; on: boolean }[]>([]);
  const [newRule, setNewRule] = useState("");
  const planner = usePlanStream(llm);
  const autostarted = useRef(false);

  async function read(target = repo) {
    if (!target.trim()) return;
    setError(null);
    setStep("reading");
    setReadStep(0);
    const tick = setInterval(() => setReadStep((s) => Math.min(READ_STEPS.length - 1, s + 1)), 520);
    try {
      const res = await fetch("/api/import/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repo: target }) });
      const j = await res.json();
      await new Promise((r) => setTimeout(r, 600));
      clearInterval(tick);
      if (!res.ok) {
        setError(j.error ?? "Couldn't read that repository");
        setStep("input");
        return;
      }
      setReport(j.report);
      setRules((j.houseRules as string[]).map((text) => ({ text, on: true })));
      setStep("report");
    } catch {
      clearInterval(tick);
      setError("Couldn't reach the server. Try again.");
      setStep("input");
    }
  }

  useEffect(() => {
    if (initialRepo && !autostarted.current) {
      autostarted.current = true;
      void read(initialRepo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once for the repo in the URL; read() is recreated every render
  }, [initialRepo]);

  const map = () => {
    setStep("mapping");
    void planner.start("/api/import/create", { report, houseRules: rules.filter((r) => r.on).map((r) => r.text) }, (id) => `/p/${id}`);
  };

  const addRule = () => {
    if (!newRule.trim()) return;
    setRules((rs) => [...rs, { text: newRule.trim(), on: true }]);
    setNewRule("");
  };

  if (step === "mapping") return <PlanningView s={planner} eyebrow="From your GitHub repo · sketching what's there" onRetry={map} />;

  if (step === "input" || step === "reading") {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="font-sketch text-[12.5px] text-muted-foreground">Start from a GitHub repo</p>
        <h1 className="mt-4 font-display text-[46px] leading-none sm:text-[60px]">Bring your code. It stays yours.</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
          Prod AI reads your repository first, tells you what it understood and what it didn&apos;t, and writes down the rules it will follow before it touches a file. Every change comes as a pull request you review.
        </p>
        <div className="panel mt-7 rounded-2xl p-5 sm:p-7">
          <label htmlFor="repo-url" className="font-pencil text-[26px] leading-none">Which repository?</label>
          <div className="mt-3 flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-input bg-panel px-3 focus-within:border-brand/60">
              <GitHubMark className="text-muted-foreground" />
              <input id="repo-url" value={repo} onChange={(e) => setRepo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && read()} placeholder="github.com/owner/repo" className="h-10 w-full min-w-0 bg-transparent font-mono text-[13px] outline-none placeholder:text-faint" disabled={step === "reading"} />
            </div>
            <Button className="h-10 px-4" onClick={() => read()} disabled={!repo.trim() || step === "reading"}>
              Read it <ArrowRight />
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-sketch text-[12px] text-faint">Or try</span>
            {EXAMPLES.map((r) => (
              <button key={r} onClick={() => { setRepo(`github.com/${r}`); void read(r); }} disabled={step === "reading"} className="rounded-md border border-hairline bg-canvas px-2 py-0.5 font-mono text-[11.5px] text-muted-foreground transition-colors hover:border-hairline-hi hover:text-foreground">{r}</button>
            ))}
          </div>
          {error && <p role="alert" className="mt-4 rounded-md border border-ask/30 bg-ask/[0.06] px-3 py-2 text-[13px] text-ask">{error}</p>}
          <p className="mt-5 border-t border-dashed border-hairline-hi pt-4 text-[12.5px] leading-relaxed text-muted-foreground">Private repository? Connect GitHub from Code and GitHub in any project (a sandbox in this prototype). ZIP and Figma imports are next on the list.</p>
        </div>
        {step === "reading" && (
          <ol className="panel mt-4 space-y-1.5 rounded-xl px-5 py-4 text-[13.5px]" aria-live="polite" aria-label="Reading the repository">
            {READ_STEPS.map((s, i) => (
              <li key={s} className={cn("flex items-center gap-2.5", i > readStep ? "text-faint" : i === readStep ? "text-foreground" : "text-muted-foreground")}>
                <PencilBox on={i < readStep} seed={i + 2} />
                <span>{s}{i === readStep ? "…" : ""}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  // report
  const r = report!;
  return (
    <div className="mx-auto max-w-5xl">
      <p className="font-sketch text-[12.5px] text-muted-foreground">What Prod AI found{r.cached ? " · a saved copy (GitHub's rate limit)" : ""}</p>
      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 break-all font-mono text-[24px] font-medium tracking-tight sm:text-[28px]"><GitHubMark className="size-6 shrink-0" />{r.repo.owner}/{r.repo.name}</h1>
          <p className="mt-1.5 max-w-2xl text-[14.5px] text-muted-foreground">{r.repo.description ?? "No description."}</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground sm:ml-auto">
          <span className="inline-flex items-center gap-1"><Star className="size-3.5" />{r.repo.stars.toLocaleString()}</span>
          <span className="inline-flex items-center gap-1"><GitBranch className="size-3.5" />{r.repo.defaultBranch}</span>
          <span>{r.fileCount.toLocaleString()} files{r.truncated ? " (partial)" : ""}</span>
          {r.repo.license && <span>{r.repo.license}</span>}
        </div>
      </div>

      <div className="mt-7 grid gap-4 lg:grid-cols-3">
        <section className="panel rounded-xl p-5">
          <h2 className="text-[14px] font-semibold">Agents found</h2>
          {r.frameworks.length ? (
            <ul className="mt-3 space-y-2.5">
              {r.frameworks.map((f) => (
                <li key={f.id}>
                  <p className="flex items-center gap-2 text-[13.5px] font-medium"><Check className="size-3.5 text-read" />{f.label}</p>
                  <p className="pl-5 font-mono text-[11px] text-muted-foreground">{f.evidence}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-muted-foreground">No agent framework found. Prod AI can add AI helpers alongside your code.</p>
          )}
          <DetectedAgents report={r} />
        </section>
        <section className="panel rounded-xl p-5">
          <h2 className="text-[14px] font-semibold">Stack</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.stack.length ? r.stack.map((s) => <span key={s.label} className="rounded-md border border-hairline bg-canvas px-2 py-0.5 font-mono text-[11.5px]" title={s.evidence}>{s.label}</span>) : <span className="text-[13px] text-muted-foreground">{r.repo.language ?? "Unknown"}</span>}
          </div>
          <h2 className="mt-5 text-[14px] font-semibold">Tests and CI</h2>
          <p className="mt-1.5 text-[12.5px]">{r.tests.length ? r.tests.join(" · ") : <span className="text-muted-foreground">None found. Prod AI will add its own checks and won&apos;t rewrite your tests.</span>}</p>
        </section>
        <section className="panel rounded-xl p-5">
          <h2 className="text-[14px] font-semibold">Conventions it will follow</h2>
          <ul className="mt-3 space-y-1.5 text-[12.5px]">
            {r.conventions.length ? r.conventions.map((c) => <li key={c} className="flex gap-2"><Check className="mt-0.5 size-3 shrink-0 text-read" />{c}</li>) : <li className="text-muted-foreground">Nothing unusual.</li>}
          </ul>
        </section>
      </div>

      <section className="mt-4 grid gap-4 md:grid-cols-3" aria-label="What it understood">
        <Coverage title="Understood" icon={Check} tone="text-read" items={r.coverage.understood} empty="None" />
        <Coverage title="Not sure yet" icon={CircleHelp} tone="text-foreground" items={r.coverage.unsure} empty="Nothing. Every source folder matched something it knows." />
        <Coverage title="Left alone" icon={EyeOff} tone="text-muted-foreground" items={r.coverage.ignored} empty="Nothing left out." />
      </section>

      <section className="panel mt-4 rounded-xl p-5 sm:p-6" aria-labelledby="rules">
        <h2 id="rules" className="font-pencil text-[30px] leading-none"><Term k="house-rules" /></h2>
        <p className="mt-2 text-[13.5px] text-muted-foreground">The promises Prod AI signs before it touches anything. Every AI helper and every change follows them. Untick one to leave it out.</p>
        <ul className="mt-4 space-y-2">
          {rules.map((rule, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-hairline bg-canvas px-3 py-2">
              <label className="flex flex-1 cursor-pointer items-center gap-3">
                <input type="checkbox" checked={rule.on} onChange={(e) => setRules((rs) => rs.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} className="sr-only" aria-label={rule.text} />
                <PencilBox on={rule.on} seed={i + 5} />
                <span className={cn("flex-1 text-[13.5px]", !rule.on && "text-faint line-through")}>{rule.text}</span>
              </label>
              <button onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-ask" aria-label="Remove rule"><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
        <div className="mt-2.5 flex gap-2">
          <Input value={newRule} onChange={(e) => setNewRule(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRule()} placeholder="Add a rule, e.g. “Never touch /legacy”" className="h-9 bg-panel" />
          <Button variant="outline" className="h-9 bg-panel" disabled={!newRule.trim()} onClick={addRule}><Plus /> Add</Button>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" className="-ml-2.5 text-muted-foreground" onClick={() => setStep("input")}>Read a different repo</Button>
        <p className="text-[12.5px] text-muted-foreground sm:ml-auto">Next, Prod AI sketches what&apos;s there so you can see it. Nothing is pushed.</p>
        <Button className="h-10 px-4 text-[14px] max-sm:w-full" onClick={map}>Sign House Rules and map it <ArrowRight /></Button>
      </div>
    </div>
  );
}

function Coverage({ title, icon: I, tone, items, empty }: { title: string; icon: typeof Check; tone: string; items: string[]; empty: string }) {
  return (
    <div className="panel rounded-xl p-5">
      <h2 className={cn("flex items-center gap-2 text-[13.5px] font-semibold", tone)}><I className="size-3.5" />{title}<span className="font-mono text-[11px] font-normal text-faint">{items.length}</span></h2>
      <ul className="mt-2.5 space-y-1">
        {items.length ? items.map((i) => <li key={i} className="font-mono text-[11.5px] text-foreground/80">{i}</li>) : <li className="text-[12px] text-muted-foreground">{empty}</li>}
      </ul>
    </div>
  );
}

/** The agents read from the repository's own source, as written: name, where, tools. Says so plainly when there are none. */
function DetectedAgents({ report }: { report: ImportReportWithTree }) {
  const [open, setOpen] = useState(false);
  const agents = report.agents;
  if (!agents) return null; // An older cached analysis: agents weren't read then.
  const read = report.agentScan?.filesRead.length ?? 0;
  if (!agents.length) {
    return (
      <p className="mt-3 border-t border-hairline pt-3 text-[12.5px] leading-relaxed text-muted-foreground">
        No agent definitions found in the {read} source file{read === 1 ? "" : "s"} read{report.agentScan?.toolCount ? ` (${report.agentScan.toolCount} tool${report.agentScan.toolCount === 1 ? "" : "s"} found)` : ""}. The plan&apos;s agents will be proposals, not code from your repo.
      </p>
    );
  }
  const { mapped, left, projects, project } = pickAgents(agents, report.tree);
  const files = [...new Set(agents.map((a) => a.file))];
  const shown = open ? agents : agents.slice(0, 6);
  return (
    <div className="mt-3 border-t border-hairline pt-3">
      <p className="text-[12.5px] text-foreground/90">
        Read {describeAgents(agents)} from {files.length === 1 ? <span className="font-mono text-[11.5px]">{files[0]}</span> : `${files.length} files`}.
      </p>
      <ul className="mt-2 space-y-2">
        {shown.map((a, i) => (
          <AgentRow key={`${a.file}-${a.name}-${i}`} a={a} mapped={mapped.includes(a)} />
        ))}
      </ul>
      {agents.length > 6 && (
        <button onClick={() => setOpen((o) => !o)} className="mt-2 text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          {open ? "Show fewer" : `Show all ${agents.length}`}
        </button>
      )}
      {left.length > 0 && (
        <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
          {projects > 1 ? `${projects} separate projects here. The plan maps the ${mapped.length} agents of ${project || "the root project"}/.` : `A project holds six agents, so the plan maps the first ${mapped.length}.`} The others stay listed here.
        </p>
      )}
      {(report.agentScan?.candidates ?? 0) > read && <p className="mt-1 text-[11px] text-faint">Read the {read} likeliest of {report.agentScan!.candidates} candidate files.</p>}
    </div>
  );
}

function AgentRow({ a, mapped }: { a: DetectedAgent; mapped: boolean }) {
  return (
    <li className={cn("text-[12.5px]", !mapped && a.kind !== "guardrail" && "opacity-70")}>
      <p className="flex items-center gap-1.5 font-medium">
        <Bot className={cn("size-3.5 shrink-0", a.kind === "guardrail" ? "text-muted-foreground" : "text-read")} />
        <span className="truncate">{a.name}</span>
        {a.kind === "guardrail" && <span className="shrink-0 rounded-full border border-hairline px-1.5 text-[10px] font-normal text-muted-foreground">guardrail</span>}
        {a.kind === "graph" && <span className="shrink-0 rounded-full border border-hairline px-1.5 text-[10px] font-normal text-muted-foreground">graph</span>}
      </p>
      <p className="truncate pl-5 font-mono text-[10.5px] text-muted-foreground" title={a.file}>
        {FRAMEWORK_LABEL[a.framework] ?? a.framework} · {a.file.split("/").slice(-2).join("/")}
      </p>
      {a.tools.length > 0 && <p className="truncate pl-5 text-[11px] text-muted-foreground" title={a.tools.map((t) => t.name).join(", ")}>Tools: {a.tools.map((t) => t.name).join(", ")}</p>}
      {a.steps && a.steps.length > 0 && <p className="truncate pl-5 text-[11px] text-muted-foreground">Nodes: {a.steps.join(" → ")}</p>}
    </li>
  );
}
