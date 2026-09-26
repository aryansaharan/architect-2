"use client";

import { useId, useState, type CSSProperties } from "react";
import { Misreg } from "./primitives";
import { PrintIn } from "./print-in";

const SWATCHES = [
  { name: "Warm stock", hex: "#F4EFE6", c: "var(--paper)", ramp: "#b9ab94", role: "The page. Uncoated, never pure white." },
  { name: "Press black", hex: "#1D1A17", c: "var(--ink)", ramp: "var(--ink)", role: "Text and rules. 15.1:1 on stock." },
  { name: "Fluo pink", hex: "#FF48B0", c: "var(--pink)", ramp: "var(--pink)", role: "Ask first, attention, the hand-marked X. Never used for text." },
  { name: "Riso blue", hex: "#0078BF", c: "var(--blue)", ramp: "var(--blue)", role: "Read, structure, ruled lines. Blue text prints in #005A94 (6.3:1)." },
  { name: "Yellow", hex: "#FFE800", c: "var(--yellow)", ramp: "#e0c800", role: "Change, highlighter, the docket header." },
];

const OVERPRINTS = [
  { a: "var(--pink)", b: "var(--yellow)", name: "Pink over yellow", hex: "#FF4200", role: "Can't undo. The only red is two inks stacked." },
  { a: "var(--blue)", b: "var(--yellow)", name: "Blue over yellow", hex: "#006D00", role: "Passed. Approved stamps, green lights." },
  { a: "var(--pink)", b: "var(--blue)", name: "Pink over blue", hex: "#002284", role: "Our fix. Free repairs wear the deepest ink." },
];

const PRINCIPLES = [
  { t: "Roll", d: "New things are printed in by one pass of the roller. Nothing fades in from nowhere.", demo: "roll" },
  { t: "Thud", d: "Decisions land like a stamp: fast, heavy, a little crooked, then perfectly still.", demo: "thud" },
  { t: "Drift", d: "Hover loosens the plates a few pixels. Let go and they snap back into register.", demo: "drift" },
  { t: "Tear", d: "What you keep tears off along a perforation. Pages flip over. Nothing slides.", demo: "tear" },
] as const;

function Demo({ kind }: { kind: (typeof PRINCIPLES)[number]["demo"] }) {
  if (kind === "roll")
    return (
      <div className="pr-demo pr-demo--roll" aria-hidden="true">
        <div className="pr-demo__sheet">
          <i />
          <i />
          <i />
        </div>
        <div className="pr-demo__roller" />
      </div>
    );
  if (kind === "thud")
    return (
      <div className="pr-demo pr-demo--thud" aria-hidden="true">
        <span className="pr-demo__stamp">OK</span>
      </div>
    );
  if (kind === "drift")
    return (
      <div className="pr-demo pr-demo--drift" aria-hidden="true">
        <Misreg className="pr-demo__aa" a="var(--blue)" b="var(--pink)">
          Aa
        </Misreg>
      </div>
    );
  return (
    <div className="pr-demo pr-demo--tear" aria-hidden="true">
      <div className="pr-demo__ticket" />
      <div className="pr-demo__stub" />
    </div>
  );
}

export function Specimen() {
  const id = useId();
  const [wdth, setWdth] = useState(66);
  return (
    <section className="pr-section" id="specimen" aria-labelledby={`${id}-h`}>
      <div className="pr-wrap">
        <PrintIn inner="pr-sechead">
          <Misreg dots className="pr-secnum pr-knock" a="var(--ink)" b="var(--blue)" label="Section 03">
            03
          </Misreg>
          <h2 id={`${id}-h`} className="pr-sectitle">
            Specimen
          </h2>
          <p className="pr-secsub">Three inks, one stock, two typefaces and four rules for movement. Every colour below is an ink or two inks overprinted.</p>
        </PrintIn>

        <h3 className="pr-label" style={{ marginBottom: 14 }}>
          Inks and stock
        </h3>
        <div className="pr-swatches">
          {SWATCHES.map((s, i) => (
            <PrintIn key={s.name} inner="pr-swatch" delay={i * 0.08}>
              <div className="pr-swatch__chip" style={{ background: s.c }}>
                <div className="pr-swatch__ramp" aria-hidden="true">
                  {[3.3, 2.5, 1.9, 1.3, 0.7].map((d) => (
                    <i key={d} style={{ ["--c" as string]: s.ramp, ["--d" as string]: `${d}px` } as CSSProperties} />
                  ))}
                </div>
              </div>
              <div className="pr-swatch__meta">
                <div className="pr-swatch__name">{s.name}</div>
                <div className="pr-swatch__hex">{s.hex}</div>
                <p className="pr-swatch__role">{s.role}</p>
              </div>
            </PrintIn>
          ))}
        </div>

        <h3 className="pr-label" style={{ margin: "34px 0 14px" }}>
          Overprints · the semantic colours
        </h3>
        <div className="pr-overprints">
          {OVERPRINTS.map((o) => (
            <div key={o.name} className="pr-venn">
              <div className="pr-venn__art" aria-hidden="true">
                <i style={{ background: o.a }} />
                <i style={{ background: o.b }} />
              </div>
              <div>
                <div className="pr-swatch__name">{o.name}</div>
                <div className="pr-swatch__hex">{o.hex}</div>
                <p className="pr-swatch__role">{o.role}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="pr-type">
          <div className="pr-spec-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span className="pr-label">Archivo · the press</span>
              <span className="pr-label pr-label--soft">variable · wdth 62 to 125 · wght 100 to 900</span>
            </div>
            <div className="pr-aa" style={{ fontStretch: `${wdth}%`, marginTop: 18 }} aria-hidden="true">
              Proof
            </div>
            <label className="pr-label" htmlFor={`${id}-w`} style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <span>Width</span>
              <span>{wdth}</span>
            </label>
            <input id={`${id}-w`} className="pr-range" type="range" min={62} max={125} value={wdth} onChange={(e) => setWdth(Number(e.target.value))} style={{ marginTop: 6 }} />
            <p className="pr-secsub" style={{ marginTop: 12 }}>
              One family does every job. Squeezed to 62 it is wood type for posters and titles. Stretched to 118 it is a rubber stamp. At 100 it sets the interface. A grotesk drawn for print and screen, so the page and the app feel like one press.
            </p>
            <div className="pr-weights">
              <span style={{ fontWeight: 400 }}>Regular 400</span>
              <span style={{ fontWeight: 700 }}>Bold 700</span>
              <span style={{ fontWeight: 900, fontStretch: "62%", textTransform: "uppercase" }}>Poster 900/62</span>
              <span style={{ fontWeight: 900, fontStretch: "118%", textTransform: "uppercase", fontSize: 17, letterSpacing: "0.08em" }}>Stamp 900/118</span>
            </div>
          </div>
          <div className="pr-spec-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span className="pr-label">Courier Prime · the typist</span>
              <span className="pr-label pr-label--soft">400 · 700 · italic</span>
            </div>
            <div className="pr-typed" style={{ marginTop: 22 }} aria-hidden="true">
              Aa $3.94
            </div>
            <div className="pr-mono" style={{ marginTop: 20, fontSize: 16, lineHeight: 1.7, borderTop: "1px dashed var(--ink)", paddingTop: 12 }}>
              JOB ....... Refund Desk
              <br />
              EST ....... ≈ $3.94 · 197 credits
              <br />
              ASKS ...... 3 actions ask first
              <br />
              <i>“Bigger refunds ask me first.”</i>
            </div>
            <p className="pr-secsub" style={{ marginTop: 14 }}>
              Anything a person typed, or a number you might check, is set in a typewriter face. Your words stay your words: the press sets the headline, you type the docket.
            </p>
          </div>
        </div>

        <h3 className="pr-label" style={{ marginTop: "clamp(56px, 7vw, 96px)", marginBottom: 0 }}>
          Motion · four rules
        </h3>
        <div className="pr-principles" style={{ marginTop: 14 }}>
          {PRINCIPLES.map((p, i) => (
            <div key={p.t} className="pr-principle">
              <Demo kind={p.demo} />
              <div className="pr-principle__t">
                <span className="pr-label pr-label--soft" style={{ display: "block", marginBottom: 6 }}>
                  0{i + 1}
                </span>
                {p.t}
              </div>
              <p className="pr-principle__d">{p.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
