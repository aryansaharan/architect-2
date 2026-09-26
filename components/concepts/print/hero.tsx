"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { compose, DEFAULT_IDEA, detect, KEYWORDS, SAMPLE_IDEAS } from "./engine";
import { Misreg } from "./primitives";
import { TicketPress, type Print } from "./ticket";

const MAX = 320;
const SAMPLES = [{ label: "Refund desk", text: DEFAULT_IDEA }, ...SAMPLE_IDEAS];

export function AdmitOne({ label = "Try the demo", href = "/demo" }: { label?: string; href?: string }) {
  return (
    <a className="pr-admit" href={href}>
      <span className="pr-admit__paper">
        <span className="pr-admit__stub" aria-hidden="true">
          Admit
          <br />
          one
        </span>
        <span className="pr-admit__main">
          {label}
          <svg className="pr-admit__arrow" width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
            <path d="M1 8h18M13 2l6 6-6 6" />
          </svg>
        </span>
      </span>
      <span className="pr-admit__plate" aria-hidden="true" />
    </a>
  );
}

export function Hero() {
  const id = useId();
  const [text, setText] = useState(DEFAULT_IDEA);
  const [typing, setTyping] = useState(false);
  const [prints, setPrints] = useState<Print[]>(() => [{ id: 0, spec: compose(DEFAULT_IDEA) }]);
  const detected = useMemo(() => detect(text), [text]);
  const setting = useMemo(() => (typing ? compose(text).title : undefined), [typing, text]);

  // Debounced reprint: the press waits for a pause in the typing, then rolls.
  useEffect(() => {
    const t = setTimeout(() => {
      setTyping(false);
      setPrints((ps) => {
        const next = compose(text);
        const last = ps[ps.length - 1];
        if (next.seed === last.spec.seed) return ps;
        return [...ps.slice(-1), { id: last.id + 1, spec: next }];
      });
    }, 560);
    return () => clearTimeout(t);
  }, [text]);

  const onPrinted = useCallback((pid: number) => {
    setPrints((ps) => (ps.length > 1 && ps[ps.length - 1].id === pid ? ps.slice(-1) : ps));
  }, []);

  const update = (v: string) => {
    setText(v.slice(0, MAX));
    setTyping(true);
  };

  return (
    <section className="pr-hero" id="proof" aria-labelledby={`${id}-h`}>
      <div className="pr-wrap pr-hero__grid">
        <div>
          <div className="pr-kicker">
            <span className="pr-label">No. 01</span>
            <span className="pr-label pr-label--soft">A builder for agentic apps · Autumn 2026</span>
          </div>

          <div className="pr-wordmark" role="img" aria-label="Proof, working name">
            <Misreg dots className="pr-knock" a="var(--pink)" b="var(--blue)">
              Proof
            </Misreg>
            <span className="pr-wn pr-wordmark__tag" aria-hidden="true">
              Working name
            </span>
          </div>

          <h1 id={`${id}-h`} className="pr-claim">
            Nothing runs until you <span className="pr-hl">sign the proof.</span>
          </h1>
          <p className="pr-sub">
            Describe an agentic app in plain words. We print the plan first: every <strong>screen, agent, table and connection</strong>, with the
            price on a stub you can tear off. Owners read the plain face. Engineers read the code. It is the same sheet.
          </p>

          <div className="pr-docket">
            <div className="pr-docket__head">
              <label htmlFor={`${id}-idea`} className="pr-label">
                Job description · in your words
              </label>
              <span className="pr-label" aria-hidden="true">
                {text.length}/{MAX}
              </span>
            </div>
            <div className="pr-docket__field">
              <textarea
                id={`${id}-idea`}
                value={text}
                rows={5}
                maxLength={MAX}
                spellCheck={false}
                placeholder="An app that…"
                onChange={(e) => update(e.target.value)}
                aria-describedby={`${id}-found`}
              />
            </div>
            <div className="pr-docket__foot">
              <div>
                <span id={`${id}-found`} className="pr-label pr-label--soft">
                  The press found
                </span>
                <ul className="pr-checks" style={{ marginTop: 8 }} aria-labelledby={`${id}-found`}>
                  {KEYWORDS.map((k) => {
                    const on = detected.includes(k.key);
                    return (
                      <li key={k.key} className="pr-check" data-on={on}>
                        <span className="pr-check__box" aria-hidden="true">
                          <AnimatePresence>
                            {on && (
                              <motion.svg
                                className="pr-check__x"
                                viewBox="0 0 20 20"
                                initial={{ scale: 2.2, opacity: 0, rotate: -25 }}
                                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
                                transition={{ type: "spring", stiffness: 800, damping: 30 }}
                              >
                                <path d="M3 4 17 16M16 3 4 17" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" fill="none" />
                              </motion.svg>
                            )}
                          </AnimatePresence>
                        </span>
                        {k.label}
                        <span className="sr-only">{on ? ", found" : ", not found"}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="pr-samples">
                <span className="pr-label pr-label--soft">Try</span>
                {SAMPLES.map((s) => (
                  <button key={s.label} type="button" className="pr-sample" aria-pressed={text === s.text} onClick={() => update(s.text)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pr-cta-row">
            <AdmitOne />
            <span className="pr-label pr-label--soft">No sign-up · test data only</span>
          </div>
        </div>

        <div className="pr-sunwrap">
          <div className="pr-sun" aria-hidden="true" />
          <TicketPress prints={prints} typing={typing} setting={setting} onPrinted={onPrinted} />
        </div>
      </div>
    </section>
  );
}
