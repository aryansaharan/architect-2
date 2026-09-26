"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import s from "./signal.module.css";
import { DEFAULT_IDEA, PRESETS, derive, type Blueprint } from "./derive";
import { FieldEngine } from "./field-engine";
import { useAnimatedNumber, useReducedMotionPref } from "./hooks";
import { Arrow, Mark } from "./glyphs";

interface Props {
  monoFamily: string;
  displayFamily: string;
}

export function SignalHero({ monoFamily, displayFamily }: Props) {
  const [text, setText] = useState(DEFAULT_IDEA);
  const bp = useMemo(() => derive(text), [text]);
  const reduced = useReducedMotionPref();

  const heroRef = useRef<HTMLElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<HTMLCanvasElement>(null);
  const wordRef = useRef<HTMLHeadingElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const statRef = useRef<HTMLSpanElement>(null);
  const engineRef = useRef<FieldEngine | null>(null);
  const bpRef = useRef<Blueprint>(bp);
  const typingRef = useRef<number | null>(null);
  const [preset, setPreset] = useState<number | null>(null);

  // Mount the engine once per motion preference.
  useEffect(() => {
    const container = fieldRef.current;
    const gl = glRef.current;
    const ov = ovRef.current;
    const stage = stageRef.current;
    if (!container || !gl || !ov || !stage) return;
    let engine: FieldEngine;
    try {
      engine = new FieldEngine({
        container,
        glCanvas: gl,
        overlay: ov,
        stage,
        origin: consoleRef.current,
        scope: scopeRef.current,
        reducedMotion: reduced,
        monoFamily,
        displayFamily,
        onStats: ({ fps, particles, kps, gl: hasGl }) => {
          if (statRef.current) {
            statRef.current.textContent = `${kps.toFixed(1)} K/S · ${particles.toLocaleString("en-US")} PTS · ${reduced ? "STILL" : `${Math.round(fps)} FPS`}${hasGl ? "" : " · 2D"}`;
          }
        },
        onEnergy: (e) => {
          const w = wordRef.current;
          if (w)
            w.style.fontVariationSettings = `"wdth" ${(120 + Math.min(1, e) * 12).toFixed(1)}, "CTRS" ${(Math.min(1.2, e) * 50).toFixed(0)}`;
          const m = meterRef.current;
          if (m) {
            const lit = Math.round(Math.min(1, e / 1.2) * m.children.length);
            for (let i = 0; i < m.children.length; i++) {
              const el = m.children[i] as HTMLElement;
              el.style.background =
                i < lit
                  ? i > m.children.length * 0.8
                    ? "var(--star)"
                    : "var(--sig)"
                  : "";
            }
          }
        },
      });
    } catch (err) {
      console.warn("[signal] field unavailable", err);
      return;
    }
    engineRef.current = engine;
    engine.setBlueprint(bpRef.current);
    // Fonts arrive after first paint; redraw the still frame when they do.
    document.fonts?.ready.then(() => {
      if (reduced) engine.renderStill();
    });
    engine.start();
    const hero = heroRef.current;
    const move = (e: PointerEvent) => {
      // the reticle only lives over open sky, never over text or controls
      if ((e.target as HTMLElement | null)?.closest("[data-ui]")) engine.clearPointer();
      else engine.setPointer(e.clientX, e.clientY);
    };
    const leave = () => engine.clearPointer();
    hero?.addEventListener("pointermove", move);
    hero?.addEventListener("pointerleave", leave);
    const vis = () => {
      if (!document.hidden) engine.start();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      hero?.removeEventListener("pointermove", move);
      hero?.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", vis);
      engine.destroy();
      engineRef.current = null;
    };
  }, [reduced, monoFamily, displayFamily]);

  useEffect(() => {
    bpRef.current = bp;
    engineRef.current?.setBlueprint(bp);
  }, [bp]);

  useEffect(
    () => () => {
      if (typingRef.current) window.clearTimeout(typingRef.current);
    },
    [],
  );

  // Presets type themselves in, so the field reacts exactly as it would to a person.
  const playPreset = (i: number | null) => {
    if (typingRef.current) window.clearTimeout(typingRef.current);
    setPreset(i);
    const target = i === null ? DEFAULT_IDEA : PRESETS[i].text;
    if (reduced) {
      setText(target);
      return;
    }
    let n = 0;
    setText("");
    const tick = () => {
      n += 1 + (Math.random() < 0.3 ? 1 : 0);
      const next = target.slice(0, n);
      setText(next);
      engineRef.current?.keystroke("char");
      if (n < target.length)
        typingRef.current = window.setTimeout(
          tick,
          22 + Math.random() * 38 + (next.endsWith(" ") ? 30 : 0),
        );
    };
    typingRef.current = window.setTimeout(tick, 120);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Backspace" || e.key === "Delete")
      engineRef.current?.keystroke("delete");
    else if (e.key.length === 1) engineRef.current?.keystroke("char");
  };

  const demoHref = `/demo?prompt=${encodeURIComponent(text.trim() || DEFAULT_IDEA)}`;
  const announce = useDebounced(
    `${bp.name}. ${bp.screens.length} screens, ${bp.agents.length} agents, ${bp.data.length} data stores, ${bp.conns.length} connections. About ${bp.credits} credits.`,
    900,
  );

  return (
    <section ref={heroRef} className={s.hero} aria-labelledby="sig-wordmark">
      <div ref={fieldRef} className={s.field} aria-hidden="true">
        <canvas ref={glRef} className={s.glCanvas} />
        <canvas ref={ovRef} />
      </div>

      <header className={s.topbar} data-ui>
        <div className={s.brand}>
          <Mark className={s.mark} />
          <div>
            <span className={s.brandWord}>ORRERY</span>
            <span className={s.brandTag}>Working name</span>
          </div>
        </div>
        <div className={s.ticker} aria-hidden="true">
          <span>
            Field <b>07</b>
          </span>
          <span>
            RA <b>14h 32m 07s</b>
          </span>
          <span>
            Dec <b>−12° 04′</b>
          </span>
          <span className={s.lock}>
            <i className={s.lockDot} /> Signal lock
          </span>
        </div>
        <nav className={s.nav} aria-label="Concept">
          <a className={s.navLink} href="#sig-product">
            Product
          </a>
          <a className={s.navLink} href="#sig-specimen">
            Specimen
          </a>
          <a className={`${s.cta} ${s.ctaSmall}`} href={demoHref}>
            Try the demo <Arrow className={s.ctaArrow} />
          </a>
        </nav>
      </header>

      <div className={s.heroGrid}>
        <div className={s.leftCol}>
          <div className={s.intro} data-ui>
            <p className={`${s.micro} ${s.eyebrow}`}>
              A working model of your app
            </p>
            <div className={s.wordmarkRow}>
              <h1 id="sig-wordmark" ref={wordRef} className={s.wordmark}>
                <span className={s.oWrap}>
                  O
                  <OrbitO />
                </span>
                RRERY
              </h1>
              <span className={s.wordmarkTag}>
                Working name <b>· not final</b>
              </span>
            </div>
            <p className={s.claim}>
              Describe an agentic app. <em>Watch it take shape,</em> see the
              plan and the price, and approve it before anything runs.
            </p>
          </div>

          <div ref={consoleRef} className={`${s.console} ${s.brackets}`} data-ui>
            <div className={s.consoleHead}>
              <span className={`${s.micro} ${s.sigText}`}>
                ● Transmit your idea
              </span>
              <span className={s.micro}>
                {String(text.length).padStart(3, "0")} chars
                <span className={s.hideSm}> · {bp.words} words</span>
              </span>
            </div>
            <div className={s.consoleBody}>
              <label htmlFor="sig-idea" className={s.srOnly}>
                Describe the app you want to build
              </label>
              <textarea
                id="sig-idea"
                className={s.prompt}
                value={text}
                rows={4}
                spellCheck={false}
                placeholder="An agent that…"
                onChange={(e) => {
                  if (typingRef.current) window.clearTimeout(typingRef.current);
                  setPreset(null);
                  setText(e.target.value.slice(0, 400));
                }}
                onKeyDown={onKeyDown}
              />
              <div ref={meterRef} className={s.meter} aria-hidden="true">
                {Array.from({ length: 48 }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
            </div>
            <div className={s.presets}>
              <span className={s.micro}>Try</span>
              {PRESETS.map((p, i) => (
                <button
                  key={p.label}
                  type="button"
                  className={s.chip}
                  aria-pressed={preset === i}
                  onClick={() => playPreset(i)}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className={s.chip}
                onClick={() => playPreset(null)}
              >
                Reset
              </button>
            </div>
            <div className={s.ctaRow}>
              <a className={s.cta} href={demoHref}>
                Try the demo <Arrow className={s.ctaArrow} />
              </a>
              <span className={s.ctaNote}>
                Opens a guest project with this idea. Nothing runs until you
                approve.
              </span>
            </div>
          </div>
        </div>

        <div className={s.rightCol}>
          <div ref={stageRef} className={s.stage} aria-hidden="true" />
          <div className={s.legend} aria-hidden="true">
            <span>
              Screen
              <svg viewBox="0 0 14 10">
                <rect
                  x="1.5"
                  y="1.5"
                  width="11"
                  height="7"
                  fill="none"
                  stroke="currentColor"
                />
              </svg>
            </span>
            <span>
              Agent
              <svg viewBox="0 0 14 10">
                <circle cx="7" cy="5" r="2" fill="#f1f4ea" />
                <circle cx="7" cy="5" r="4" fill="none" stroke="currentColor" />
              </svg>
            </span>
            <span>
              Asks first
              <svg viewBox="0 0 14 10">
                <circle
                  cx="7"
                  cy="5"
                  r="4"
                  fill="none"
                  stroke="#d4ff3f"
                  strokeDasharray="1.6 1.6"
                />
              </svg>
            </span>
            <span>
              Data ring
              <svg viewBox="0 0 14 10">
                <ellipse
                  cx="7"
                  cy="5"
                  rx="6"
                  ry="2.6"
                  fill="none"
                  stroke="currentColor"
                />
              </svg>
            </span>
            <span>
              Connection
              <svg viewBox="0 0 14 10">
                <circle
                  cx="7"
                  cy="5"
                  r="2.4"
                  fill="none"
                  stroke="currentColor"
                />
                <path d="M1 5h2.5M10.5 5H13" stroke="currentColor" />
              </svg>
            </span>
          </div>
          <Telemetry bp={bp} scopeRef={scopeRef} statRef={statRef} />
        </div>
      </div>

      <p className={s.srOnly} aria-live="polite">
        {announce}
      </p>
    </section>
  );
}

function Telemetry({
  bp,
  scopeRef,
  statRef,
}: {
  bp: Blueprint;
  scopeRef: React.RefObject<HTMLCanvasElement | null>;
  statRef: React.RefObject<HTMLSpanElement | null>;
}) {
  const credits = useAnimatedNumber(bp.credits);
  const dollars = useAnimatedNumber(bp.dollars * 100) / 100;
  const counts: [string, number, number][] = [
    ["Screens", bp.screens.length, 6],
    ["Agents", bp.agents.length, 5],
    ["Data", bp.data.length, 4],
    ["Links", bp.conns.length, 5],
  ];
  return (
    <aside
      className={`${s.telem} ${s.brackets}`}
      aria-label="Live telemetry for the described app"
      data-ui
    >
      <div className={s.telHead}>
        <span className={`${s.micro} ${s.microHi}`}>
          Telemetry<span className={s.hideSm}> · derived live</span>
        </span>
        <span className={s.micro}>Seed {bp.seedHex}</span>
      </div>
      <div className={s.telBody}>
        <div className={s.telLeft}>
          <span className={s.micro}>Object</span>
          <div className={s.telName}>{bp.name}</div>
          <dl className={s.counts}>
            {counts.map(([label, n, max]) => (
              <div key={label} className={s.count}>
                <dt>{label}</dt>
                <dd>{String(n).padStart(2, "0")}</dd>
                <div className={s.pips} aria-hidden="true">
                  {Array.from({ length: max }, (_, i) => (
                    <i key={i} data-on={i < n} />
                  ))}
                </div>
              </div>
            ))}
          </dl>
        </div>
        <div className={s.telRight}>
          <span className={s.micro}>Work order preview</span>
          <div className={s.row}>
            <span>Estimate</span>
            <span className={s.price}>≈ ${dollars.toFixed(2)}</span>
          </div>
          <div className={s.row}>
            <span>Credits</span>
            <span>{Math.round(credits).toLocaleString("en-US")}</span>
          </div>
          <div className={s.row}>
            <span>Time</span>
            <span>≈ {bp.minutes} min</span>
          </div>
          <div className={s.row}>
            <span>Files</span>
            <span>{bp.files}</span>
          </div>
          <div className={`${s.row} ${bp.askFirst ? s.rowAsk : ""}`}>
            <span>Ask first</span>
            <span>
              {bp.askFirst ? "▲ " : ""}
              {bp.askFirst} {bp.askFirst === 1 ? "action" : "actions"}
            </span>
          </div>
        </div>
      </div>
      <div className={s.telFoot}>
        <span className={s.micro}>Key rhythm</span>
        <canvas ref={scopeRef} className={s.scope} aria-hidden="true" />
        <span ref={statRef} className={s.statLine}>
          0.0 K/S
        </span>
      </div>
    </aside>
  );
}

/** The O of the wordmark is a body with its own orbit: back arc behind the letter, front arc over it. */
function OrbitO() {
  const path = "M198,32 A98,30 0 1,1 2,32 A98,30 0 1,1 198,32";
  return (
    <>
      <svg className={`${s.oOrbit} ${s.oBack}`} viewBox="0 0 200 64" aria-hidden="true">
        <path d="M2,32 A98,30 0 0,1 198,32" />
        <circle r="5.5" className={`${s.oDot} ${s.oDotBack}`} style={{ offsetPath: `path("${path}")` }} />
      </svg>
      <svg className={`${s.oOrbit} ${s.oFront}`} viewBox="0 0 200 64" aria-hidden="true">
        <path d="M198,32 A98,30 0 0,1 2,32" />
        <circle r="5.5" className={`${s.oDot} ${s.oDotFront}`} style={{ offsetPath: `path("${path}")` }} />
      </svg>
    </>
  );
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}
