import type { CSSProperties } from "react";
import s from "./drafting.module.css";

/** Registration mark: a circle and crosshair, used at sheet corners. */
export function RegMark({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 34 34" className={className} style={style} aria-hidden fill="none" stroke="currentColor" strokeWidth="1">
      <circle cx="17" cy="17" r="9" />
      <circle cx="17" cy="17" r="4.5" />
      <path d="M17 0v34M0 17h34" />
      <path d="M17 12.5a4.5 4.5 0 0 1 4.5 4.5H17zM17 21.5a4.5 4.5 0 0 1-4.5-4.5H17z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * The mark: a datum feature symbol. In technical drawings a boxed letter on a
 * filled triangle marks the reference surface everything else is measured from.
 */
export function DatumMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 30 36" aria-hidden fill="none" stroke="currentColor">
      <rect x="4.5" y="1.5" width="21" height="19" strokeWidth="1.6" />
      <text
        x="15"
        y="16.6"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        style={{ fontFamily: "var(--stencil)", fontWeight: 800, fontSize: 15.5 }}
      >
        D
      </text>
      <path d="M15 20.5v3.2" strokeWidth="1.6" />
      <path d="M9.4 31.2 15 23.7l5.6 7.5z" fill="currentColor" strokeWidth="1" strokeLinejoin="round" />
      <path d="M1 31.5h28" strokeWidth="1.4" />
      <path d="M3 35l3.2-3.2M8 35l3.2-3.2M13 35l3.2-3.2M18 35l3.2-3.2M23 35l3.2-3.2" strokeWidth="0.9" opacity="0.7" />
    </svg>
  );
}

export function Crops() {
  return (
    <>
      <span className={s.crop} data-c="tl" aria-hidden />
      <span className={s.crop} data-c="tr" aria-hidden />
      <span className={s.crop} data-c="bl" aria-hidden />
      <span className={s.crop} data-c="br" aria-hidden />
    </>
  );
}

/** Ink texture for stamps: roughened edges and small gaps where the ink skipped. */
export function InkFilters() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
      <defs>
        <filter id="dt-rough" x="-10%" y="-20%" width="120%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="11" result="g" />
          <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3 2.75" result="gm" />
          <feComposite in="d" in2="gm" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}

export function Delta({ n, className }: { n: number | string; className?: string }) {
  return (
    <svg viewBox="0 0 30 27" className={className} aria-hidden>
      <path d="M15 2 28 25H2z" fill="none" stroke="var(--signal)" strokeWidth="1.8" strokeLinejoin="round" />
      <text x="15" y="22" textAnchor="middle" fill="var(--signal)" style={{ fontFamily: "var(--stencil)", fontWeight: 800, fontSize: 13 }}>
        {n}
      </text>
    </svg>
  );
}
