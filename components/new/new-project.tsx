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
      <div className="mx-auto max-w-2xl">
        <p className="micro-label">New project · step 1 of 3</p>
        <h1 className="mt-2 font-display text-[40px] leading-tight">Describe the job.</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">Who it&apos;s for, what should happen, and what must never happen without a person. Skip the tech — that&apos;s our part.</p>
        <div className="panel mt-6 rounded-2xl focus-within:border-amber/50">
          <label htmlFor="new-brief" className="sr-only">Describe what you want to build</label>
          <textarea id="new-brief" autoFocus rows={5} value={brief} onChange={(e) => setBrief(e.target.value)} className="block w-full resize-none bg-transparent p-4 text-[15px] leading-relaxed outline-none placeholder:text-faint" placeholder="A desk that reads every refund request, checks the order and warranty, approves the simple ones, and asks me before sending money back." />
          <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
            {EXAMPLES.map((ex) => (
              <button key={ex.label} onClick={() => setBrief(ex.prompt)} className="rounded-full border border-hairline px-2.5 py-1 text-[12px] text-muted-foreground hover:border-amber/40 hover:text-foreground">{ex.label}</button>
            ))}
            <Button className="ml-auto" onClick={() => setStep("questions")} disabled={brief.trim().length < 12}>Next <ArrowRight /></Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "questions") {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="micro-label">New project · step 2 of 3</p>
        <h1 className="mt-2 font-display text-[40px] leading-tight">Three quick questions.</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">They shape who the agents answer to. Skip them and Architect picks sensible, careful defaults.</p>
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
                      className={cn("rounded-full border px-3 py-1.5 text-[13px] transition-colors", current === o ? "border-amber/60 bg-amber-soft text-amber" : "border-hairline text-muted-foreground hover:text-foreground")}
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
          <Button variant="ghost" className="ml-auto text-muted-foreground" onClick={() => plan(true)}>Skip — use sensible defaults</Button>
          <Button size="lg" onClick={() => plan(false)}>Plan it <ArrowRight /></Button>
        </div>
        <p className="mt-4 text-right text-[12px] text-faint">Planning is free to review. Nothing is built until you approve a Work Order.</p>
      </div>
    );
  }

  return <PlanningView s={planner} eyebrow="New project · step 3 of 3" onRetry={() => plan(false)} />;
}
