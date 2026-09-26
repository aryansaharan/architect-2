"use client";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { questionsFor, renderAnswers, type Question } from "@/lib/blueprint/questions";
import { matchVertical } from "@/lib/blueprint/match";
import { EXAMPLES } from "@/components/home/home-composer";
import { cn } from "@/lib/utils";
import { PlanningView, usePlanStream } from "./plan-stream";

type Step = "describe" | "questions" | "planning";

export function NewProject({ initialPrompt, llm }: { initialPrompt: string; llm: "live" | "offline" }) {
  const [step, setStep] = useState<Step>(initialPrompt ? "questions" : "describe");
  const [brief, setBrief] = useState(initialPrompt);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const planner = usePlanStream(llm);

  const vertical = useMemo(() => (brief.length > 12 ? matchVertical(brief) : null), [brief]);
  const questions: Question[] = useMemo(() => questionsFor(vertical && vertical.confidence > 0.2 ? vertical.vertical : "custom"), [vertical]);

  function plan(skip: boolean) {
    setStep("planning");
    void planner.start("/api/plan", { brief, answers: skip ? "" : renderAnswers(questions, answers) }, (id) => `/p/${id}/blueprint?sel=brief:meta`);
  }

  if (step === "describe") {
    return (
      <div className="fade-up mx-auto max-w-2xl">
        <p className="micro-label flex items-center gap-2"><span className="flex gap-1" aria-hidden>{[1, 2, 3].map((d) => <span key={d} className={cn("h-1 rounded-full transition-all duration-500", d <= 1 ? "w-4 bg-amber shadow-[0_0_8px_rgb(223_255_79/0.7)]" : "w-1.5 bg-hairline-hi")} />)}</span>New project · step 1 of 3</p>
        <h1 className="mt-3 font-display text-[44px] leading-tight">Describe the <em className="text-amber-grad">job.</em></h1>
        <p className="mt-2 text-[14px] text-muted-foreground">Who it&apos;s for, what should happen, and what must never happen without a person. Skip the tech. That&apos;s our part.</p>
        <div className="panel mt-6 rounded-2xl transition-[border-color,box-shadow] duration-500 focus-within:border-amber/50 focus-within:shadow-[0_0_0_4px_rgb(223_255_79/0.08),0_24px_70px_-24px_rgb(223_255_79/0.45)]">
          <label htmlFor="new-brief" className="sr-only">Describe what you want to build</label>
          <textarea id="new-brief" autoFocus rows={5} value={brief} onChange={(e) => setBrief(e.target.value)} className="block w-full resize-none bg-transparent p-4 text-[15px] leading-relaxed outline-none placeholder:text-faint" placeholder="A desk that reads every refund request, checks the order and warranty, approves the simple ones, and asks me before sending money back." />
          <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
            {EXAMPLES.map((ex) => (
              <button key={ex.label} onClick={() => setBrief(ex.prompt)} className={cn("rounded-full border px-2.5 py-1 text-[12px] transition-all duration-200 hover:-translate-y-px hover:border-amber/40 hover:text-foreground", brief === ex.prompt ? "border-amber/50 bg-amber-soft text-foreground" : "border-hairline text-muted-foreground")}>{ex.label}</button>
            ))}
            <Button className="sheen ml-auto shadow-[0_8px_24px_-10px_rgb(223_255_79/0.8)] disabled:shadow-none" onClick={() => setStep("questions")} disabled={brief.trim().length < 12}>Next <ArrowRight /></Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "questions") {
    return (
      <div className="fade-up mx-auto max-w-2xl">
        <p className="micro-label flex items-center gap-2"><span className="flex gap-1" aria-hidden>{[1, 2, 3].map((d) => <span key={d} className={cn("h-1 rounded-full transition-all duration-500", d <= 2 ? "w-4 bg-amber shadow-[0_0_8px_rgb(223_255_79/0.7)]" : "w-1.5 bg-hairline-hi")} />)}</span>New project · step 2 of 3</p>
        <h1 className="mt-3 font-display text-[44px] leading-tight">Three quick <em className="text-amber-grad">questions.</em></h1>
        <p className="mt-2 text-[14px] text-muted-foreground">They shape who the agents answer to. Skip them and Wonderwork picks sensible, careful defaults.</p>
        <div className="panel mt-6 flex gap-3 rounded-xl p-4">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-amber" />
          <p className="flex-1 text-[13.5px] leading-relaxed">{brief}</p>
          <button onClick={() => setStep("describe")} className="self-start text-muted-foreground hover:text-foreground" aria-label="Edit the brief"><Pencil className="size-3.5" /></button>
        </div>
        <div className="mt-6 space-y-6">
          {questions.map((q) => {
            const current = answers[q.id] ?? q.options[q.defaultIndex];
            return (
              <fieldset key={q.id}>
                <legend className="text-[14px] font-medium">{q.label}</legend>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {q.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={current === o}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: o }))}
                      className={cn("rounded-full border px-3 py-1.5 text-[13px] transition-all duration-200 active:scale-95", current === o ? "border-amber/60 bg-amber-soft text-amber shadow-[0_0_20px_-8px_rgb(223_255_79/0.6)]" : "border-hairline text-muted-foreground hover:-translate-y-px hover:border-hairline-hi hover:text-foreground")}
                    >
                      {current === o && <Check className="-ml-0.5 mr-1 inline size-3.5" />}
                      {o}
                    </button>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
        <div className="mt-8 flex items-center gap-3">
          <Button variant="ghost" onClick={() => setStep("describe")}><ArrowLeft /> Back</Button>
          <Button variant="ghost" className="ml-auto text-muted-foreground" onClick={() => plan(true)}>Skip, use sensible defaults</Button>
          <Button size="lg" className="sheen shadow-[0_0_0_1px_rgb(239_255_148/0.35),0_10px_30px_-10px_rgb(223_255_79/0.8)]" onClick={() => plan(false)}>Plan it <ArrowRight /></Button>
        </div>
        <p className="mt-4 text-right text-[12px] text-faint">Planning is free to review. Nothing is built until you approve a Work Order.</p>
      </div>
    );
  }

  return <PlanningView s={planner} eyebrow="New project · step 3 of 3" onRetry={() => plan(false)} />;
}
