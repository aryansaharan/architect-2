"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CircleHelp, EyeOff, FileSearch, GitBranch, Loader2, Plus, ShieldCheck, Star, X } from "lucide-react";
import type { ImportReport } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GitHubMark } from "@/components/brand/logo";
import { PlanningView, usePlanStream } from "@/components/new/plan-stream";
import { cn } from "@/lib/utils";

const EXAMPLES = ["openai/openai-cs-agents-demo", "langchain-ai/langgraph-example", "crewAIInc/crewAI-examples", "vercel/chatbot"];
const READ_STEPS = ["Fetching repository details", "Listing every file", "Reading manifests and README", "Detecting stack, agents and tests", "Mapping what I understood"];

type Step = "input" | "reading" | "report" | "mapping";

export function ImportWizard({ initialRepo, llm = "live" }: { initialRepo: string; llm?: "live" | "offline" }) {
  const [step, setStep] = useState<Step>("input");
  const [repo, setRepo] = useState(initialRepo);
  const [readStep, setReadStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRepo]);

  const map = () => {
    setStep("mapping");
    void planner.start("/api/import/create", { report, houseRules: rules.filter((r) => r.on).map((r) => r.text) }, (id) => `/p/${id}/blueprint?sel=brief:meta`);
  };

  if (step === "mapping") return <PlanningView s={planner} eyebrow="Bring your existing project · mapping" onRetry={map} />;

  if (step === "input" || step === "reading") {
    return (
      <div className="fade-up mx-auto max-w-2xl">
        <p className="micro-label">Bring your existing project</p>
        <h1 className="mt-2 font-display text-[44px] leading-tight">Adopt it. <em className="text-amber-grad">Don&apos;t absorb it.</em></h1>
        <p className="mt-2 text-[14px] text-muted-foreground">Architect reads your repository first, tells you what it understood and what it didn&apos;t, and signs House Rules before it touches a file. Every change ships as a pull request.</p>
        <div className="panel mt-6 rounded-2xl p-4 transition-[border-color,box-shadow] duration-500 focus-within:border-amber/50 focus-within:shadow-[0_0_0_4px_rgb(245_165_36/0.08),0_24px_70px_-24px_rgb(245_165_36/0.45)]">
          <label htmlFor="repo-url" className="text-[13px] font-medium">Public GitHub repository</label>
          <div className="mt-2 flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-hairline bg-deep px-3 focus-within:border-amber/50">
              <GitHubMark className="text-muted-foreground" />
              <input id="repo-url" value={repo} onChange={(e) => setRepo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && read()} placeholder="github.com/owner/repo" className="h-10 w-full bg-transparent font-mono text-[13px] outline-none placeholder:text-faint" disabled={step === "reading"} />
            </div>
            <Button className="sheen h-10 shadow-[0_8px_24px_-10px_rgb(245_165_36/0.8)] disabled:shadow-none" onClick={() => read()} disabled={!repo.trim() || step === "reading"}>
              {step === "reading" ? <Loader2 className="animate-spin" /> : <FileSearch />} Read it
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((r) => (
              <button key={r} onClick={() => { setRepo(`github.com/${r}`); void read(r); }} disabled={step === "reading"} className="rounded-full border border-hairline px-2.5 py-1 font-mono text-[11.5px] text-muted-foreground transition-all duration-200 hover:-translate-y-px hover:border-amber/40 hover:text-foreground">{r}</button>
            ))}
          </div>
          {error && <p role="alert" className="mt-3 rounded-md border border-ask/30 bg-ask/10 px-3 py-2 text-[12.5px] text-ask">{error}</p>}
          <p className="mt-4 text-[12px] text-muted-foreground">Private repository? <span className="text-foreground/80">Connect GitHub</span> from any project&apos;s Code tab (sandbox in this prototype). ZIP and Figma imports are next on the roadmap.</p>
        </div>
        {step === "reading" && (
          <ol className="aurora panel-raised fade-up relative mt-4 space-y-1.5 overflow-hidden rounded-xl p-4 text-[13px]" aria-live="polite">
            <span className="scanline" aria-hidden />
            {READ_STEPS.map((s, i) => (
              <li key={s} className={cn("relative flex items-center gap-2 transition-colors duration-300", i > readStep ? "text-faint" : i === readStep ? "text-foreground" : "text-muted-foreground")}>
                {i < readStep ? <Check className="size-3.5 text-read" /> : i === readStep ? <Loader2 className="size-3.5 animate-spin text-amber" /> : <span className="size-3.5" />}
                <span className={cn(i === readStep && "text-shimmer")}>{s}</span>
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
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <p className="micro-label">Stack report{r.cached ? " · cached (GitHub rate limit)" : ""}</p>
          <h1 className="mt-2 flex items-center gap-3 text-[30px] font-semibold tracking-tight"><GitHubMark className="size-6" />{r.repo.owner}/{r.repo.name}</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-muted-foreground">{r.repo.description ?? "No description."}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-3 text-[12.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Star className="size-3.5" />{r.repo.stars.toLocaleString()}</span>
          <span className="inline-flex items-center gap-1"><GitBranch className="size-3.5" />{r.repo.defaultBranch}</span>
          <span>{r.fileCount.toLocaleString()} files{r.truncated ? " (partial)" : ""}</span>
          {r.repo.license && <span>{r.repo.license}</span>}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="panel fade-up rounded-xl p-4" style={{ animationDelay: "80ms" }}>
          <h2 className="micro-label">Agents found</h2>
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
            <p className="mt-3 text-[13px] text-muted-foreground">No agent framework detected. Architect can add agents alongside your code.</p>
          )}
        </section>
        <section className="panel fade-up rounded-xl p-4" style={{ animationDelay: "160ms" }}>
          <h2 className="micro-label">Stack</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.stack.length ? r.stack.map((s) => <span key={s.label} className="rounded-md border border-hairline bg-deep px-2 py-1 text-[12px]" title={s.evidence}>{s.label}</span>) : <span className="text-[13px] text-muted-foreground">{r.repo.language ?? "Unknown"}</span>}
          </div>
          <h2 className="micro-label mt-4">Tests &amp; CI</h2>
          <p className="mt-1.5 text-[12.5px]">{r.tests.length ? r.tests.join(" · ") : <span className="text-muted-foreground">None found — Architect will add rehearsals, not rewrite your tests.</span>}</p>
        </section>
        <section className="panel fade-up rounded-xl p-4" style={{ animationDelay: "240ms" }}>
          <h2 className="micro-label">Conventions I&apos;ll follow</h2>
          <ul className="mt-3 space-y-1.5 text-[12.5px]">
            {r.conventions.length ? r.conventions.map((c) => <li key={c} className="flex gap-2"><Check className="mt-0.5 size-3 shrink-0 text-read" />{c}</li>) : <li className="text-muted-foreground">Nothing unusual.</li>}
          </ul>
        </section>
      </div>

      <section className="fade-up mt-4 grid gap-4 md:grid-cols-3" style={{ animationDelay: "340ms" }} aria-label="Coverage map">
        <Coverage title="Understood" icon={Check} tone="text-read" items={r.coverage.understood} empty="—" />
        <Coverage title="Not sure yet" icon={CircleHelp} tone="text-amber" items={r.coverage.unsure} empty="Nothing — every source folder matched something I know." />
        <Coverage title="Ignored" icon={EyeOff} tone="text-muted-foreground" items={r.coverage.ignored} empty="Nothing ignored." />
      </section>

      <section className="panel fade-up mt-4 rounded-xl p-5" style={{ animationDelay: "440ms" }} aria-labelledby="rules">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="size-4 text-amber" />
          <h2 id="rules" className="text-[15px] font-semibold">House Rules</h2>
          <span className="text-[12.5px] text-muted-foreground">Architect signs these before touching anything. Every agent and every Work Order follows them.</span>
        </div>
        <ul className="mt-4 space-y-2">
          {rules.map((rule, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-hairline bg-deep/60 px-3 py-2">
              <input type="checkbox" checked={rule.on} onChange={(e) => setRules((rs) => rs.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} className="size-4 accent-[var(--amber)]" aria-label={rule.text} />
              <span className={cn("flex-1 text-[13px]", !rule.on && "text-faint line-through")}>{rule.text}</span>
              <button onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-ask" aria-label="Remove rule"><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <Input value={newRule} onChange={(e) => setNewRule(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newRule.trim()) { setRules((rs) => [...rs, { text: newRule.trim(), on: true }]); setNewRule(""); } }} placeholder="Add a rule, e.g. “Never touch /legacy”" className="h-9" />
          <Button variant="outline" className="h-9" disabled={!newRule.trim()} onClick={() => { setRules((rs) => [...rs, { text: newRule.trim(), on: true }]); setNewRule(""); }}><Plus /> Add</Button>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={() => setStep("input")}>Read a different repo</Button>
        <p className="ml-auto text-[12.5px] text-muted-foreground">Next: I map it into a Blueprint so you can see it. Nothing is pushed.</p>
        <Button size="lg" className="sheen shadow-[0_0_0_1px_rgb(255_199_107/0.35),0_10px_30px_-10px_rgb(245_165_36/0.8)]" onClick={map}>Sign House Rules and map it <ArrowRight /></Button>
      </div>
    </div>
  );
}

function Coverage({ title, icon: I, tone, items, empty }: { title: string; icon: typeof Check; tone: string; items: string[]; empty: string }) {
  return (
    <div className="panel rounded-xl p-4">
      <h2 className={cn("flex items-center gap-2 text-[13px] font-semibold", tone)}><I className="size-3.5" />{title}<span className="font-mono text-[11px] text-faint">{items.length}</span></h2>
      <ul className="mt-2.5 space-y-1">
        {items.length ? items.map((i) => <li key={i} className="font-mono text-[11.5px] text-foreground/80">{i}</li>) : <li className="text-[12px] text-muted-foreground">{empty}</li>}
      </ul>
    </div>
  );
}
