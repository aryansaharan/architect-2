"use client";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Info, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { questionsFor, renderAnswers, type Question } from "@/lib/blueprint/questions";
import { guestStarterNote, matchVertical } from "@/lib/blueprint/match";
import { WritingSheet } from "@/components/home/writing-sheet";
import { MAX_BRIEF, MIN_BRIEF } from "@/components/home/brief-limits";
import { PencilBox } from "@/components/landing/sketches";
import motion from "@/components/motion/entry-motion.module.css";
import { cn } from "@/lib/utils";
import { CapNote, signInHref } from "./cap-note";
import { PencilCircle } from "./pencil-circle";
import { PlanningView, usePlanStream } from "./plan-stream";
import { CodeWritingView } from "./code-writing";
import { KindLine, type AppKind } from "./kind-switch";
import { PRICE } from "@/lib/prices";
import { connectionsFor, isConnectionsQuestion, isNothingOption, toggleConnection } from "./connections";

type Step = "describe" | "questions" | "planning";

/** How long the page waits for the questions written for this brief. After that the templates simply stay. */
const TAILOR_WAIT_MS = 10_000;

const isKind = (v: unknown): v is AppKind => v === "business" || v === "code";
/** Why it's that kind of app, in one plain sentence, as the server said it. */
const reasonOf = (j: Record<string, unknown> | null): string | null => {
  const w = j?.kindReason;
  return typeof w === "string" && w.trim() ? w.trim().slice(0, 160) : null;
};

const isQuestions = (v: unknown): v is Question[] =>
  Array.isArray(v) && v.length === 3 && v.every((q) => q && typeof q.id === "string" && typeof q.label === "string" && Array.isArray(q.options) && q.options.length >= 2 && q.options.every((o: unknown) => typeof o === "string") && Number.isInteger(q.defaultIndex));

const STEPS = ["Write it", "A few questions", "The sketch"];
const CODE_STEPS = ["Write it", "What to make", "The code"];

/** Where you are, in pencil: write it, answer a few questions, watch the sketch form. A code app's steps say what they are. */
export function Steps({ at, kind = "business" }: { at: number; kind?: AppKind }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-sketch text-sketch" aria-label="Steps">
      {(kind === "code" ? CODE_STEPS : STEPS).map((s, i) => (
        <li key={s} className={cn("flex items-center gap-2.5", i === at ? "text-foreground" : "text-faint")} aria-current={i === at ? "step" : undefined}>
          {i > 0 && <span aria-hidden>·</span>}
          <span className={i === at ? "pencil-underline" : undefined}>
            {i + 1} {s}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Back to this page with the note still written, after signing in. */
const comeBack = (brief: string) => (brief.trim() ? `/new?prompt=${encodeURIComponent(brief.trim().slice(0, MAX_BRIEF))}` : "/new");

/** Said once, before anything is planned: guests get a starter plan; signing in gets Claude. */
function GuestNote({ brief }: { brief: string }) {
  return (
    <p>
      As a guest you start from the closest starter plan.{" "}
      <Link href={signInHref(comeBack(brief))} className="text-foreground underline decoration-dotted underline-offset-4">
        Sign in
      </Link>{" "}
      and Claude plans it from your own words.
    </p>
  );
}

export function NewProject({ initialPrompt, llm, isGuest = false, capMessage = null }: { initialPrompt: string; llm: "live" | "offline"; isGuest?: boolean; capMessage?: string | null }) {
  const [step, setStep] = useState<Step>(initialPrompt.trim().length >= MIN_BRIEF ? "questions" : "describe");
  const [brief, setBrief] = useState(initialPrompt);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const planner = usePlanStream(llm);

  const vertical = useMemo(() => (brief.length > MIN_BRIEF ? matchVertical(brief) : null), [brief]);
  // Instant: the template questions for the closest vertical, with the brief's own systems pre-selected.
  const template: Question[] = useMemo(() => questionsFor(vertical && vertical.confidence > 0.2 ? vertical.vertical : "custom", brief), [vertical, brief]);
  // Then the three questions written for this brief (POST /api/questions), swapped in only if they arrive
  // before the person answers anything. Never blocks: Sketch it and Skip work the whole time.
  const [tailored, setTailored] = useState<{ brief: string; questions: Question[] } | null>(null);
  const [settledFor, setSettledFor] = useState<string | null>(null);
  const answeredRef = useRef(false);
  // What kind of app Claude chose for this note (with the questions), and the person's own choice, if they made one.
  const [kindFor, setKindFor] = useState<{ brief: string; kind: AppKind; reason: string | null } | null>(null);
  const [pickedKind, setPickedKind] = useState<{ brief: string; kind: AppKind } | null>(null);
  // "Sketch it" pressed while Claude is still reading the note: it starts the moment the kind is known.
  const [queued, setQueued] = useState<{ skip: boolean } | null>(null);
  const [planKind, setPlanKind] = useState<AppKind>("business");
  const tailoredHere = tailored?.brief === brief ? tailored.questions : null;
  const tailoring = llm === "live" && step === "questions" && settledFor !== brief && !tailoredHere;
  const hasTailored = Boolean(tailoredHere);
  const claudeKind = kindFor?.brief === brief ? kindFor : null;
  const handKind = pickedKind?.brief === brief ? pickedKind.kind : null;
  // Real code needs Claude: without a model (offline), every app is a business app.
  const kindOffered = llm === "live" && !capMessage;
  const kind: AppKind = kindOffered ? (handKind ?? claudeKind?.kind ?? "business") : "business";
  const deciding = kindOffered && !claudeKind && !handKind && tailoring;
  // The fetch below settled (or gave up): run a plan that was waiting for the kind.
  const onSettled = useEffectEvent((forBrief: string, k: AppKind | null) => {
    if (!queued || forBrief !== brief) return;
    const skip = queued.skip;
    setQueued(null);
    plan(skip, handKind ?? k ?? "business", true);
  });
  useEffect(() => {
    if (llm !== "live" || step !== "questions" || brief.trim().length < MIN_BRIEF || hasTailored || capMessage) return;
    const ctrl = new AbortController();
    let got: AppKind | null = null;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, TAILOR_WAIT_MS);
    fetch("/api/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief }), signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { questions?: unknown; kind?: unknown } | null) => {
        if (!answeredRef.current && isQuestions(j?.questions)) setTailored({ brief, questions: j.questions });
        if (isKind(j?.kind)) {
          got = j.kind;
          setKindFor({ brief, kind: j.kind, reason: reasonOf(j as Record<string, unknown>) });
        }
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        // Cancelled because the page moved on (or a dev double-run): the next request settles it instead.
        if (ctrl.signal.aborted && !timedOut) return;
        setSettledFor(brief);
        onSettled(brief, got);
      });
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [llm, step, brief, hasTailored, capMessage]);
  const canned: Question[] = tailoredHere ?? template;
  // "What must it connect to?" takes several answers, pre-selected from what the brief names (email, texts, Slack…).
  const conn = useMemo(() => {
    const q = canned.find(isConnectionsQuestion);
    return q ? connectionsFor(q, brief) : null;
  }, [canned, brief]);
  const questions = useMemo(() => canned.map((q) => (conn && q.id === conn.question.id ? conn.question : q)), [canned, conn]);
  const [pickedByHand, setPicked] = useState<string[] | null>(null);
  // Answers the person has clicked. Their ticks are drawn in pencil as they appear; the defaults' ticks just fade in.
  // (A tick's style never changes while it's on screen, so nothing replays when another answer is picked.)
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const handPicked = pickedByHand?.filter((o) => conn?.question.options.includes(o)) ?? [];
  const picked = handPicked.length ? handPicked : (conn?.preselected ?? []);

  function plan(skip: boolean, as: AppKind = kind, now = false) {
    // Claude is still reading the note: wait for what kind of app it is (a few seconds at most), then start.
    if (!now && as === kind && deciding) return setQueued({ skip });
    setStep("planning");
    setPlanKind(as);
    if (as === "code") return void planner.start("/api/plan", { brief, answers: "", kind: "code" }, (id) => `/p/${id}`);
    const all = conn ? { ...answers, [conn.question.id]: picked.join(", ") } : answers;
    void planner.start("/api/plan", { brief, answers: skip ? "" : renderAnswers(questions, all), kind: "business", ...(skip || !conn ? {} : { connections: picked }) }, (id) => `/p/${id}`);
  }

  const toDescribe = () => {
    setQueued(null);
    setPicked(null);
    setAnswers({});
    setTouched(new Set());
    answeredRef.current = false;
    setStep("describe");
  };
  const answer = (fn: () => void) => {
    answeredRef.current = true;
    fn();
  };

  if (step === "planning" && planKind === "code")
    return (
      <CodeWritingView
        s={planner}
        eyebrow={<Steps at={2} kind="code" />}
        onRetry={() => plan(false, "code")}
        onBusiness={() => {
          setPickedKind({ brief, kind: "business" });
          plan(true, "business");
        }}
        signInNext={isGuest ? comeBack(brief) : null}
      />
    );

  if (step === "planning")
    return (
      <PlanningView
        s={planner}
        eyebrow={<Steps at={2} />}
        onRetry={() => plan(false)}
        // The same note the server sends a guest: the closest starter, or plainly a general one when none is close.
        expectedNote={isGuest ? guestStarterNote(brief) : undefined}
        signInNext={isGuest ? comeBack(brief) : null}
      />
    );

  // Full up: say so before anything is written. A guest's note (from the landing page or Home) comes with them.
  if (capMessage)
    return (
      <div className="mx-auto max-w-2xl">
        <Steps at={0} />
        <h1 className="mt-4 font-pencil text-title">What do you want to make?</h1>
        <CapNote className="mt-7" message={capMessage} signInNext={isGuest ? comeBack(brief) : null} />
        {isGuest && brief.trim() && (
          <div className="panel mt-4 rounded-md px-5 pb-4 pt-4 sm:px-8">
            <p className="font-sketch text-sketch text-faint">Your note, kept for when you&apos;re back</p>
            <p className="paper-lines mt-1 whitespace-pre-wrap break-words pt-[7px] font-pencil text-note leading-8 text-foreground">{brief}</p>
          </div>
        )}
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl">
      <Steps at={step === "describe" ? 0 : 1} kind={step === "questions" ? kind : "business"} />
      <h1 className="mt-4 font-pencil text-title">What do you want to make?</h1>

      {step === "describe" ? (
        <>
          <p className="mt-3 text-lead text-muted-foreground">Who it&apos;s for, what should happen, and what must never happen without a person. Skip the tech. That&apos;s our part.</p>
          <WritingSheet
            id="new-brief"
            className="mt-7"
            value={brief}
            onChange={setBrief}
            label="Describe what you want to make"
            showLabel={false}
            submitLabel="Next"
            minLength={MIN_BRIEF}
            rows={5}
            autoFocus
            onSubmit={() => {
              setPicked(null);
              setAnswers({});
              answeredRef.current = false;
              setStep("questions");
            }}
          />
          {isGuest && (
            <div className="mt-4 text-meta text-muted-foreground">
              <GuestNote brief={brief} />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="panel mt-7 rounded-md">
            <div className="flex items-start gap-3 px-5 pt-5 sm:px-8 sm:pt-6">
              <p className="paper-lines min-w-0 flex-1 whitespace-pre-wrap break-words pt-[7px] font-pencil text-note leading-8 text-foreground">{brief}</p>
              <button onClick={toDescribe} className="-mr-2 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-ui text-muted-foreground transition-colors duration-150 hover:text-foreground" aria-label="Change your note">
                <Pencil className="size-3.5" />
                Change
              </button>
            </div>

            {kindOffered && (
              <KindLine
                className="mt-5 border-t border-dashed border-hairline-hi px-5 py-4 sm:px-8"
                kind={kind}
                reason={claudeKind?.kind === kind && !handKind ? claudeKind.reason : null}
                deciding={deciding}
                chosenBy={handKind ? "you" : claudeKind ? "claude" : null}
                onChange={(k) => setPickedKind({ brief, kind: k })}
              />
            )}

            {kind === "code" ? (
              <div className="border-t border-dashed border-hairline-hi px-5 py-6 sm:px-8">
                <h2 className="font-pencil text-section">Claude writes it from your note</h2>
                <p className="mt-2 text-body text-muted-foreground">
                  Real files, in React and Tailwind. Prod AI really builds them and starts your app in a sealed test space where you can try it. You see every file, and you can download them all.
                </p>
                {isGuest && (
                  <p className="mt-3 flex gap-2 text-body text-foreground">
                    <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    Claude writes real code for people who are signed in. Sign in and your note comes with you.
                  </p>
                )}
              </div>
            ) : (
            <div className={cn("border-t border-dashed border-hairline-hi px-5 py-6 sm:px-8", !kindOffered && "mt-5")}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="font-pencil text-section">A few quick questions</h2>
                <p className="text-meta text-faint" aria-live="polite">
                  {tailoredHere ? "Written for your idea." : tailoring ? "Writing questions for your idea…" : null}
                </p>
              </div>
              <p className="mt-2 text-body text-muted-foreground">They decide who the AI helpers answer to. Skip them and Prod AI picks careful defaults.</p>

              <div key={tailoredHere ? "tailored" : "template"} className={cn("mt-6 space-y-6", tailoredHere && "fade-up")}>
                {questions.map((q, qi) => {
                  const multi = conn?.question.id === q.id;
                  const selected = multi ? picked : [answers[q.id] ?? q.options[q.defaultIndex]];
                  // Where this question's answers start in the whole list, so they arrive one after another.
                  const first = questions.slice(0, qi).reduce((n, x) => n + x.options.length, 0);
                  return (
                    <fieldset key={q.id}>
                      <legend className="text-body font-medium">
                        {q.label}
                        {multi && <span className="ml-2 font-sketch text-sketch font-normal text-faint">pick any</span>}
                      </legend>
                      <div className="mt-1.5 flex flex-wrap gap-x-6 text-body">
                        {q.options.map((o, oi) => {
                          const on = selected.includes(o);
                          const key = `${q.id}\u0000${o}`;
                          return (
                            <button
                              key={o}
                              type="button"
                              aria-pressed={on}
                              onClick={() =>
                                answer(() => {
                                  setTouched((t) => (t.has(key) ? t : new Set(t).add(key)));
                                  if (multi) setPicked(toggleConnection(picked, o, q.options));
                                  else setAnswers((a) => ({ ...a, [q.id]: o }));
                                })
                              }
                              style={{ "--entry-i": first + oi } as React.CSSProperties}
                              className={cn("relative inline-flex min-h-9 items-center gap-2 rounded-md text-left transition-colors duration-150", motion.optIn, on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                            >
                              <PencilBox on={on} round={!multi} seed={oi + 1} draw={touched.has(key)} />
                              {o}
                              {/* An answer you chose yourself is circled in pencil as you pick it; the defaults are only ticked. */}
                              {!multi && answers[q.id] === o && <PencilCircle />}
                            </button>
                          );
                        })}
                      </div>
                      {multi && conn.fromBrief.length > 0 && (
                        <p className="mt-1.5 text-meta text-muted-foreground">
                          Ticked from your note: {conn.fromBrief.join(", ")}.{picked.some(isNothingOption) ? "" : " Change anything that's wrong."}
                        </p>
                      )}
                    </fieldset>
                  );
                })}
              </div>
            </div>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-hairline-hi px-5 py-4 sm:px-8">
              {kind === "code" ? (
                isGuest ? (
                  <>
                    <Button
                      variant="ghost"
                      size="lg"
                      className="-ml-4 text-muted-foreground"
                      onClick={() => {
                        setPickedKind({ brief, kind: "business" });
                        plan(true, "business");
                      }}
                    >
                      Start from a business starter instead
                    </Button>
                    <Button asChild size="cta" className="ml-auto">
                      <Link href={signInHref(comeBack(brief))}>
                        Sign in to have Claude write it <ArrowRight />
                      </Link>
                    </Button>
                  </>
                ) : (
                  <Button size="cta" className="ml-auto" onClick={() => plan(false)}>
                    Write it <ArrowRight />
                  </Button>
                )
              ) : (
                <>
                  <Button variant="ghost" size="lg" className="-ml-4 text-muted-foreground" disabled={Boolean(queued)} onClick={() => plan(true)}>
                    Skip, use sensible defaults
                  </Button>
                  <Button size="cta" className="ml-auto" disabled={Boolean(queued)} onClick={() => plan(false)}>
                    {queued ? "Reading your idea…" : <>Sketch it <ArrowRight /></>}
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="mt-4 space-y-1.5 text-meta text-muted-foreground sm:text-right">
            {kind === "code" ? (
              <p>
                Claude writes it for <span className="tabular-nums">{PRICE.codeApp}</span> credits, charged only once it&apos;s saved. Making it real is free.
              </p>
            ) : (
              <p>Sketching is free. Nothing is built until you say so, and you see the price first.</p>
            )}
            {isGuest && kind !== "code" && <GuestNote brief={brief} />}
          </div>
        </>
      )}
    </div>
  );
}
