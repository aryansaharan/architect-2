"use client";

import { useState } from "react";
import s from "./signal.module.css";

const PALETTE = [
  { name: "Radium", hex: "#D4FF3F", role: "Signal. The only colour. Live, or needs you.", ink: "#05060A" },
  { name: "Void", hex: "#05060A", role: "Deep field. Page and canvas.", ink: "#A7AEB8" },
  { name: "Abyss", hex: "#0A0C12", role: "Plates and surfaces.", ink: "#A7AEB8" },
  { name: "Hull", hex: "#11141B", role: "Raised and hover.", ink: "#A7AEB8" },
  { name: "Rule", hex: "#1D212B", role: "Hairlines, dividers.", ink: "#A7AEB8" },
  { name: "Trace", hex: "#2E3440", role: "Orbits, idle strokes.", ink: "#D3D8D6" },
  { name: "Dust", hex: "#707886", role: "Catalog codes, labels. AA on Void.", ink: "#05060A" },
  { name: "Haze", hex: "#A7AEB8", role: "Secondary text.", ink: "#05060A" },
  { name: "Lumen", hex: "#D3D8D6", role: "Body text.", ink: "#05060A" },
  { name: "Starlight", hex: "#F1F4EA", role: "Headlines, frames, bodies.", ink: "#05060A" },
];

const MOTION = [
  { title: "Condense, never pop.", body: "Everything forms out of the field. Nothing appears from nowhere.", glyph: "condense" },
  { title: "Signal travels.", body: "Pulses move the way data moves, so direction is always readable.", glyph: "signal" },
  { title: "Orbit is state.", body: "Speed shows load. A dashed halo means it will ask first.", glyph: "orbit" },
  { title: "Your input is the clock.", body: "Keystrokes set the rhythm. Stillness returns when you stop.", glyph: "clock" },
] as const;

export function Specimen() {
  const [wdth, setWdth] = useState(150);
  return (
    <section id="sig-specimen" className={s.section} aria-labelledby="sig-spec-title">
      <div className={s.sectionHead}>
        <span className={s.sectionIndex} aria-hidden="true">
          03
        </span>
        <h2 id="sig-spec-title" className={s.sectionTitle}>
          Specimen
        </h2>
        <p className={s.sectionLede}>One signal, nine greys, two families, four rules for motion. Small enough to hold in your head, strict enough to scale.</p>
        <div className={s.ruler} aria-hidden="true" />
      </div>

      <div className={s.specGrid}>
        <div className={`${s.specCell} ${s.specPalette}`}>
          <div className={s.cellHead}>
            <span className={s.micro}>Palette · 1 signal + 9 step ramp</span>
            <span className={s.micro}>Radium on Void 17.5 : 1</span>
          </div>
          <div className={s.swatches}>
            {PALETTE.map((p) => (
              <div key={p.name} className={s.swatch} style={{ background: p.hex, color: p.ink }}>
                <span>
                  <span className={s.swatchName}>{p.name}</span>
                  <span className={s.swatchHex}>{p.hex}</span>
                </span>
                <span className={s.swatchRole}>{p.role}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`${s.specCell} ${s.specType}`}>
          <div className={s.cellHead}>
            <span className={s.micro}>Display · Science Gothic, variable width 50 to 200</span>
            <span className={s.micro}>
              wdth <span className={s.sigText}>{wdth}</span>
            </span>
          </div>
          <div className={s.typeHero} style={{ fontVariationSettings: `"wdth" ${wdth}`, fontWeight: 300 + Math.round((200 - wdth) * 1.2) }} aria-hidden="true">
            Orrery
          </div>
          <div className={s.slider}>
            <span className={s.micro}>50</span>
            <input className={s.range} type="range" min={50} max={200} value={wdth} onChange={(e) => setWdth(Number(e.target.value))} aria-label="Display width axis" />
            <span className={s.micro}>200</span>
          </div>
          <div className={s.typeRows}>
            <div className={s.typeRow}>
              <span className={s.micro}>Display 500 · wdth 138</span>
              <span className={`${s.typeSample} ${s.display}`} style={{ fontSize: 28, fontWeight: 500, fontVariationSettings: '"wdth" 138', lineHeight: 1.1 }}>
                Describe it. See it form.
              </span>
            </div>
            <div className={s.typeRow}>
              <span className={s.micro}>Display 300 · wdth 104</span>
              <span className={`${s.typeSample} ${s.display}`} style={{ fontSize: 20, fontWeight: 300, fontVariationSettings: '"wdth" 104' }}>
                Agents orbit. Data rings. Signal travels.
              </span>
            </div>
            <div className={s.typeRow}>
              <span className={s.micro}>Martian Mono 400</span>
              <span className={s.typeSample} style={{ fontSize: 12.5 }}>
                SC·01 INBOX  AG·02 REFUND AGENT  1,550 CR ≈ $15.50
              </span>
            </div>
            <div className={s.typeRow}>
              <span className={s.micro}>Martian Mono · wdth 75</span>
              <span className={s.typeSample} style={{ fontSize: 12.5, fontVariationSettings: '"wdth" 75', color: "var(--haze)" }}>
                RA 14h 32m 07s · DEC −12° 04′ · SEED 0x3962AFA3 · 60 FPS
              </span>
            </div>
          </div>
          <p className={s.why}>
            Science Gothic comes from the Bank Gothic line of engineering lettering: squared counters, the geometry of instrument panels and mission
            patches, without the sci-fi costume. Its width axis runs from 50 to 200, so one family covers a condensed label and a horizon-wide
            wordmark, and width can move with the signal. Martian Mono shares the square skeleton and has its own width axis, so telemetry compresses
            without switching family.
          </p>
        </div>

        <div className={`${s.specCell} ${s.specMotion}`}>
          <div className={s.cellHead}>
            <span className={s.micro}>Motion · 4 rules</span>
          </div>
          <ol className={s.motionList}>
            {MOTION.map((m) => (
              <li key={m.title} className={s.motionItem}>
                <MotionGlyph kind={m.glyph} />
                <span>
                  <strong>{m.title}</strong>
                  <span>{m.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className={s.why}>With reduced motion on, you get the chart, not the weather: one settled frame that still redraws as you type.</p>
        </div>
      </div>
    </section>
  );
}

function MotionGlyph({ kind }: { kind: (typeof MOTION)[number]["glyph"] }) {
  return (
    <svg className={s.motionGlyph} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="47" height="47" stroke="#1d212b" />
      {kind === "condense" && (
        <g>
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return <circle key={i} className={s.mgCondense} cx={(24 + Math.cos(a) * 16).toFixed(2)} cy={(24 + Math.sin(a) * 16).toFixed(2)} r="1.2" fill="#f1f4ea" style={{ "--dx": `${(-Math.cos(a) * 13).toFixed(2)}px`, "--dy": `${(-Math.sin(a) * 13).toFixed(2)}px`, animationDelay: `${i * 0.05}s` } as React.CSSProperties} />;
          })}
          <circle cx="24" cy="24" r="2.5" fill="#f1f4ea" />
        </g>
      )}
      {kind === "signal" && (
        <g>
          <path d="M8 34 Q24 6 40 34" stroke="#2e3440" />
          <circle r="2" fill="#d4ff3f" className={s.mgSignal} />
          <circle cx="8" cy="34" r="2" stroke="#a7aeb8" />
          <circle cx="40" cy="34" r="2" stroke="#a7aeb8" />
        </g>
      )}
      {kind === "orbit" && (
        <g>
          <ellipse cx="24" cy="24" rx="16" ry="7" stroke="#2e3440" strokeDasharray="1 2" />
          <circle cx="24" cy="24" r="2" fill="#f1f4ea" />
          <g className={s.mgOrbit}>
            <circle r="2.2" fill="#f1f4ea" />
            <circle r="5" stroke="#d4ff3f" strokeDasharray="1.2 1.6" />
          </g>
        </g>
      )}
      {kind === "clock" && (
        <path className={s.mgClock} d="M4 24h8l2-10 3 20 3-14 2 4h22" stroke="#d4ff3f" strokeWidth="1.2" strokeLinejoin="round" pathLength={100} />
      )}
    </svg>
  );
}
