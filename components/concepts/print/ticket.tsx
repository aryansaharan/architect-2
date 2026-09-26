"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { paintTones, screenPlate } from "./art";
import { INKS, PERM_LABEL, rng, type Spec } from "./engine";
import { Barcode, CancelMark, CropMarks, Scissors, Wire } from "./primitives";

const PRESS_EASE = [0.65, 0, 0.35, 1] as const;
export const ROLL_S = 1.15;

/* ---------------------------------------------------------------- art */

export function HalftoneArt({ spec }: { spec: Spec }) {
  const wrap = useRef<HTMLDivElement>(null);
  const aRef = useRef<HTMLCanvasElement>(null);
  const bRef = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = wrap.current;
    const ca = aRef.current;
    const cb = bRef.current;
    if (!w || !el || !ca || !cb) return;
    let cancelled = false;
    const h = Math.round((w * 3) / 5);
    const family = getComputedStyle(el).fontFamily || "sans-serif";
    const run = async () => {
      try {
        await document.fonts.load(`900 100px ${family}`);
      } catch {
        /* draw with the fallback */
      }
      if (cancelled) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const [ta, tb] = paintTones(spec, w, h, family);
      const pitch = Math.max(4.6, Math.min(7, w / 82));
      const [ia, ib] = spec.inks;
      const angle = (ink: string, fallback: number) => (ink === "yellow" ? 0 : fallback);
      for (const [cv, tone, ink, ang] of [
        [ca, ta, ia, angle(ia, 15)],
        [cb, tb, ib, angle(ib, 75)],
      ] as const) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        screenPlate(cv, tone, INKS[ink].hex, ang, pitch, spec.seed % 100000 + ang);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [spec, w]);

  const dx = ((spec.seed >> 3) % 5) - 2;
  const dy = ((spec.seed >> 6) % 5) - 2;
  const [ia, ib] = spec.inks;
  return (
    <div ref={wrap} className="pr-art" style={{ ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px` } as CSSProperties}>
      <canvas ref={aRef} aria-hidden="true" />
      <canvas ref={bRef} className="pr-art__b" aria-hidden="true" />
      <div className="pr-art__cap" aria-hidden="true">
        <span>
          A · {INKS[ia].name} {ia === "yellow" ? 0 : 15}°
        </span>
        <span>
          B · {INKS[ib].name} {ib === "yellow" ? 0 : 75}°
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- ticket */

function titleSize(title: string) {
  const n = title.length;
  if (n <= 10) return "clamp(58px, 7.4vw, 104px)";
  if (n <= 16) return "clamp(50px, 6vw, 86px)";
  if (n <= 24) return "clamp(40px, 4.8vw, 68px)";
  return "clamp(34px, 3.8vw, 54px)";
}

function Stamp({ i, children, tone, delay }: { i: number; children: ReactNode; tone: "ink" | "blue"; delay: number }) {
  const reduce = useReducedMotion();
  const rot = ((i * 37) % 7) - 3;
  return (
    <motion.div
      className="pr-astamp"
      data-tone={tone}
      initial={{ opacity: 0, scale: 1.9, rotate: rot - 9, y: -6 }}
      animate={{ opacity: 1, scale: 1, rotate: rot, y: 0 }}
      transition={reduce ? { duration: 0, delay } : { delay, type: "spring", stiffness: 820, damping: 34, mass: 1.1 }}
    >
      <span className="pr-astamp__frame" aria-hidden="true" />
      {children}
    </motion.div>
  );
}

export function Ticket({ spec, delay = 0 }: { spec: Spec; delay?: number }) {
  const r = rng(spec.seed ^ 0x51ed);
  const rots = spec.screens.map(() => (r() - 0.5) * 5);
  const ys = spec.screens.map(() => (r() - 0.5) * 6);
  const stampAt = delay + ROLL_S * 0.62;
  return (
    <article className="pr-ticket" aria-label={`Work ticket ${spec.id}: ${spec.title}`}>
      <div className="pr-ticket__body">
        <header className="pr-ticket__head">
          <span className="pr-label">Work ticket · Proof</span>
          <span className="pr-ticket__no">No. {spec.id}</span>
        </header>

        <HalftoneArt spec={spec} />
        <h2 className="pr-ticket__title" style={{ ["--title-size" as string]: titleSize(spec.title) } as CSSProperties}>
          {spec.title}
        </h2>
        <div className="pr-ticket__meta">
          <p className="pr-brief">{spec.text ? `“${spec.text}”` : "Start typing and the press sets your words in type."}</p>
          <div className="pr-inkchips" aria-label={`Printed in ${INKS[spec.inks[0]].name} and ${INKS[spec.inks[1]].name}`} role="img">
            <i className="pr-inkchip" style={{ background: INKS[spec.inks[0]].hex }} />
            <i className="pr-inkchip" style={{ background: INKS[spec.inks[1]].hex }} />
          </div>
        </div>

        <section className="pr-sec" aria-label="Screens">
          <div className="pr-sec__label">
            <span className="pr-label">Screens</span>
            <span className="pr-label pr-label--soft">{spec.screens.length} index cards</span>
          </div>
          <div className="pr-cards">
            {spec.screens.map((s, i) => (
              <div key={s.name} className="pr-icard" style={{ ["--r" as string]: `${rots[i]}deg`, ["--y" as string]: `${ys[i]}px` } as CSSProperties}>
                <div className="pr-icard__top">
                  <b>{String(i + 1).padStart(2, "0")}</b>
                  <span>{s.name}</span>
                </div>
                <Wire kind={s.kind} />
              </div>
            ))}
          </div>
        </section>

        <section className="pr-sec" aria-label="Agents">
          <div className="pr-sec__label">
            <span className="pr-label">Agents</span>
            <span className="pr-label pr-label--soft">stamped with permissions</span>
          </div>
          <div className="pr-agents">
            {spec.agents.map((a, i) => (
              <Stamp key={a.name} i={i + (spec.seed % 5)} tone={a.perms.includes("change") ? "ink" : "blue"} delay={stampAt + i * 0.14}>
                <span className="pr-astamp__name">{a.name}</span>
                <span className="pr-astamp__perms">
                  {a.perms.map((p) => (
                    <span key={p} className="pr-perm" data-perm={p}>
                      {PERM_LABEL[p]}
                    </span>
                  ))}
                </span>
              </Stamp>
            ))}
          </div>
        </section>

        <div className="pr-row2">
          <section className="pr-sec" aria-label="Data">
            <div className="pr-sec__label">
              <span className="pr-label">Data</span>
              <span className="pr-label pr-label--soft">ledger · {spec.tables.length} tables</span>
            </div>
            <table className="pr-ledger">
              <thead>
                <tr>
                  <th scope="col">Table · fields</th>
                  <th scope="col">Who writes</th>
                </tr>
              </thead>
              <tbody>
                {spec.tables.map((t) => (
                  <tr key={t.name}>
                    <td>
                      <b>{t.name}</b>
                      <span>{t.fields.join(", ")}</span>
                    </td>
                    <td>{t.access}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="pr-sec" aria-label="Connections">
            <div className="pr-sec__label">
              <span className="pr-label">Connections</span>
              <span className="pr-label pr-label--soft">{spec.connections.length || "none"}</span>
            </div>
            {spec.connections.length ? (
              <div className="pr-posts">
                {spec.connections.map((c, i) => {
                  const ink = [INKS.pink.hex, INKS.blue.hex, INKS.yellow.hex][(spec.seed + i) % 3];
                  return (
                    <div key={c.name} className="pr-post" style={{ transform: `rotate(${((i * 53 + spec.seed) % 7) - 3}deg)` }}>
                      <div
                        className="pr-post__img"
                        style={{
                          background: `radial-gradient(circle, ${ink} 1.5px, transparent 1.9px) 0 0 / 5px 5px, color-mix(in srgb, ${ink} 30%, #fffdf8)`,
                        }}
                      >
                        <span className="pr-post__code">{c.code}</span>
                      </div>
                      <span className="pr-post__name">{c.name}</span>
                      <CancelMark />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="pr-brief">Nothing outside. Everything stays in the app.</p>
            )}
          </section>
        </div>
      </div>
      <Stub spec={spec} />
    </article>
  );
}

/* ---------------------------------------------------------------- stub */

function Stub({ spec }: { spec: Spec }) {
  const reduce = useReducedMotion();
  const [copy, setCopy] = useState(0);
  const [on, setOn] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const tear = () => {
    if (!on) return;
    setOn(false);
    timer.current = setTimeout(
      () => {
        setCopy((c) => c + 1);
        setOn(true);
      },
      reduce ? 500 : 1300,
    );
  };

  return (
    <div className="pr-stubslot">
      <div className="pr-stubslot__note" aria-live="polite">
        {!on && (
          <p className="pr-label">
            Quote {spec.id} kept.
            <br />
            <span className="pr-label--soft">Printing a fresh stub…</span>
          </p>
        )}
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        {on && (
          <motion.div
            key={copy}
            className="pr-stub"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.45 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 36) tear();
            }}
            initial={{ clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0% 0)", transitionEnd: { clipPath: "none" } }}
            exit={
              reduce
                ? { opacity: 0, transition: { duration: 0.2 } }
                : { y: 220, x: 30, rotate: 9, opacity: 0, transition: { duration: 0.9, ease: [0.55, 0, 0.8, 0.35] } }
            }
            transition={{ duration: reduce ? 0 : 0.7, ease: PRESS_EASE }}
            whileDrag={{ cursor: "grabbing", rotate: 1.5 }}
          >
            <div className="pr-stub__grid">
              <div>
                <span className="pr-label">Estimate · before anything runs</span>
                <div className="pr-price" style={{ marginTop: 10 }}>
                  <small>≈$</small>
                  {spec.dollars}
                </div>
                <div className="pr-stub__facts">
                  {spec.credits} credits · ~{spec.minutes} min · {spec.files} files
                </div>
                {spec.askFirst > 0 ? (
                  <div className="pr-askpill">
                    {spec.askFirst} {spec.askFirst === 1 ? "action asks" : "actions ask"} first
                  </div>
                ) : (
                  <div className="pr-askpill" style={{ background: "var(--blue-tint)" }}>
                    Nothing asks first
                  </div>
                )}
              </div>
              <div style={{ display: "grid", justifyItems: "end", gap: 8 }}>
                <Barcode seed={spec.seed} />
                <span className="pr-ticket__no">{spec.id}</span>
                <button type="button" className="pr-tear" onClick={tear}>
                  <Scissors /> Tear off
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --------------------------------------------------------------- press */

export interface Print {
  id: number;
  spec: Spec;
}

function Roller({ delay }: { delay: number }) {
  return (
    <motion.div
      className="pr-roller"
      aria-hidden="true"
      initial={{ top: "0%", opacity: 0 }}
      animate={{ top: ["0%", "100%"], opacity: [1, 1, 1, 0] }}
      transition={{
        top: { duration: ROLL_S, ease: PRESS_EASE, delay },
        opacity: { duration: ROLL_S + 0.35, times: [0, 0.05, 0.8, 1], delay },
      }}
    >
      <div className="pr-roller__wet" />
      <i className="pr-roller__cap" />
      <div className="pr-roller__drum" />
      <i className="pr-roller__cap" />
    </motion.div>
  );
}

export function TicketPress({ prints, typing, setting, onPrinted }: { prints: Print[]; typing: boolean; setting?: string; onPrinted: (id: number) => void }) {
  const reduce = useReducedMotion();
  const top = prints[prints.length - 1];
  const first = top.id === 0;
  const delay = first ? 0.45 : 0;
  const state = typing ? "typing" : prints.length > 1 ? "rolling" : "ready";
  return (
    <div className="pr-press" data-typing={typing ? "true" : "false"}>
      <div className="pr-press__status">
        <span className="pr-lamp pr-label" data-state={state}>
          <i />
          {state === "typing" ? `Setting type: ${setting ?? "…"}` : state === "rolling" ? "Rolling ink…" : `Printed · No. ${top.spec.id}`}
        </span>
        <span className="pr-label pr-label--soft">Two inks · one pass</span>
      </div>
      <div className="pr-bed" style={{ ["--tilt" as string]: `${top.spec.tilt}deg` } as CSSProperties}>
        <CropMarks />
        <div className="pr-stack">
          {prints.map((p) => {
            const isTop = p.id === top.id;
            return (
              <motion.div
                key={p.id}
                className={isTop ? "pr-layer" : "pr-layer is-under"}
                initial={{ clipPath: "inset(0 0 100% 0)" }}
                animate={{ clipPath: "inset(0 0 0% 0)", transitionEnd: { clipPath: "none" } }}
                transition={{ duration: reduce ? 0 : ROLL_S, ease: PRESS_EASE, delay: reduce ? 0 : p.id === 0 ? delay : 0 }}
                onAnimationComplete={() => {
                  if (isTop) onPrinted(p.id);
                }}
              >
                <Ticket spec={p.spec} delay={p.id === 0 ? delay : 0} />
              </motion.div>
            );
          })}
          <Roller key={top.id} delay={delay} />
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {`Proof printed: ${top.spec.title}. ${top.spec.screens.length} screens, ${top.spec.agents.length} agents, ${top.spec.tables.length} tables. Estimate about ${top.spec.dollars} dollars.`}
      </p>
    </div>
  );
}
