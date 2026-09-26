import s from "./drafting.module.css";
import { SectionHead } from "./section-head";

const PALETTE = [
  { name: "Ferro blue", hex: "#0F3B70", role: "The sheet. Every surface starts here.", ink: "var(--chalk)", share: 58 },
  { name: "Deep prussian", hex: "#0A2850", role: "Wells: inputs, title blocks, code.", ink: "var(--chalk)", share: 16 },
  { name: "Chalk", hex: "#EEF4F8", role: "Primary lines and text. 10:1 on Ferro.", ink: "var(--ink)", share: 12 },
  { name: "Plotter cyan", hex: "#9FDBF5", role: "Secondary lines, grid, notes. 7.4:1.", ink: "var(--ink)", share: 8 },
  { name: "Pencil", hex: "#8FB6DD", role: "Metadata and quiet labels. 5.3:1.", ink: "var(--ink)", share: 4 },
  { name: "Safety orange", hex: "#FF5B1F", role: "Only for a person: ask first, approve, stamp.", ink: "var(--ink)", share: 1.4 },
  { name: "Ink", hex: "#06182F", role: "Type on chalk and orange. 5.7:1 on orange.", ink: "var(--chalk)", share: 0.6 },
];

const MOTION = [
  {
    t: "Plot, don't fade",
    b: "Lines draw in the order a pen would. Labels arrive after their line.",
    demo: (
      <svg viewBox="0 0 84 52" aria-hidden>
        <path className={s.mPlot} d="M6 44V10H46V30H78" fill="none" stroke="var(--chalk)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    t: "Swing from a center",
    b: "Agents are drawn with a compass: the circle first, then the arc.",
    demo: (
      <svg viewBox="0 0 84 52" aria-hidden>
        <circle cx="42" cy="30" r="15" fill="none" stroke="var(--cyan)" strokeWidth="1" opacity="0.45" />
        <path className={s.mArc} d="M24 30A18 18 0 0 1 60 30" fill="none" stroke="var(--chalk)" strokeWidth="1.5" />
        <g className={s.mArm}>
          <path d="M42 30L60 30" stroke="var(--chalk)" strokeWidth="1" />
          <circle cx="60" cy="30" r="2" fill="var(--signal)" />
        </g>
        <circle cx="42" cy="30" r="1.8" fill="var(--chalk)" />
      </svg>
    ),
  },
  {
    t: "Snap to the grid",
    b: "When the plan changes, parts glide and settle with one short overshoot.",
    demo: (
      <svg viewBox="0 0 84 52" aria-hidden>
        <path d="M0 12H84M0 26H84M0 40H84M14 0V52M28 0V52M42 0V52M56 0V52M70 0V52" stroke="var(--cyan)" strokeWidth="0.6" opacity="0.35" />
        <g className={s.mSnap}>
          <rect x="28" y="12" width="28" height="28" fill="none" stroke="var(--chalk)" strokeWidth="1.5" />
          <path d="M22 12H26M28 6V10" stroke="var(--chalk)" strokeWidth="1" />
        </g>
      </svg>
    ),
  },
  {
    t: "Stamp once",
    b: "Only a person's approval gets the slam. Nothing else moves that hard.",
    demo: (
      <svg viewBox="0 0 84 52" aria-hidden>
        <g className={s.mStamp} style={{ filter: "url(#dt-rough)" }}>
          <rect x="14" y="14" width="56" height="24" fill="none" stroke="var(--signal)" strokeWidth="2.4" />
          <text x="42" y="31.5" textAnchor="middle" style={{ fontFamily: "var(--stencil)", fontWeight: 900, fontSize: 14, fill: "var(--signal)", letterSpacing: "0.04em" }}>
            APPROVED
          </text>
        </g>
      </svg>
    ),
  },
];

function Sub({ n, name, note }: { n: string; name: string; note: string }) {
  return (
    <div className="mb-6 flex items-baseline gap-4 border-b pb-3" style={{ borderColor: "var(--line-faint)" }}>
      <span className={`${s.label} ${s.cyan}`}>{n}</span>
      <h3 className={s.detailName} style={{ border: 0, padding: 0 }}>
        {name}
      </h3>
      <span className={`${s.tiny} ${s.pencil} ml-auto text-right`}>{note}</span>
    </div>
  );
}

export function Specimen() {
  return (
    <section id="specimen" className={s.section} aria-labelledby="dt-spec">
      <SectionHead n={3} sheet="A-301" id="dt-spec" title="Specimen" note="Seven colours, two typefaces, four rules for motion. Nothing else." />

      {/* palette */}
      <Sub n="3.1" name="Palette" note="Share of an average screen" />
      <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-4 lg:grid-cols-7" data-reveal>
        {PALETTE.map((c) => (
          <div key={c.hex}>
            <div className={s.swatch} style={{ background: c.hex, color: c.ink }}>
              <span className={`${s.tiny} absolute bottom-2 left-2.5`} style={{ color: c.ink }}>
                {c.share}%
              </span>
            </div>
            <div className={s.detailName} style={{ border: 0, padding: 0, marginTop: 12, fontSize: 19 }}>
              {c.name}
            </div>
            <div className={`${s.label} ${s.cyan} mt-1`}>{c.hex}</div>
            <p className={`${s.tiny} ${s.pencil} mt-2`} style={{ lineHeight: 1.6, textTransform: "none", letterSpacing: "0.04em", fontSize: 10.5 }}>
              {c.role}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-10" aria-hidden>
        <div className="flex h-5 w-full" style={{ border: "1px solid var(--line-soft)" }}>
          {PALETTE.map((c) => (
            <span key={c.hex} style={{ flex: c.share, background: c.hex, borderRight: "1px solid var(--line-faint)" }} />
          ))}
        </div>
        <div className="relative mt-2 h-4" style={{ borderLeft: "1px solid var(--chalk)", borderRight: "1px solid var(--chalk)" }}>
          <span className="absolute inset-x-0 top-2" style={{ borderTop: "1px solid var(--chalk)" }} />
          <span className={`${s.tiny} ${s.pencil} absolute left-1/2 -top-[2px] -translate-x-1/2 px-2`} style={{ background: "var(--ferro)" }}>
            100% · orange stays under 2%
          </span>
        </div>
      </div>

      {/* type */}
      <div className="mt-24 grid grid-cols-[minmax(0,1fr)] gap-14 lg:grid-cols-12" data-reveal>
        <div className="lg:col-span-7">
          <Sub n="3.2" name="Display" note="Big Shoulders Stencil · 100 to 900" />
          <div className="relative">
            <div className={s.aa} aria-hidden>
              Aa
            </div>
            <div className={s.typeLine} style={{ top: "8.4%" }}>
              <span className={`${s.tiny} ${s.cyan}`}>Cap height</span>
            </div>
            <div className={s.typeLine} style={{ top: "29%" }}>
              <span className={`${s.tiny} ${s.cyan}`}>x-height</span>
            </div>
            <div className={s.typeLine} style={{ top: "88%", borderTopStyle: "solid", borderColor: "var(--chalk)" }}>
              <span className={`${s.tiny} ${s.cyan}`}>Baseline</span>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2" style={{ fontFamily: "var(--stencil)", textTransform: "uppercase", lineHeight: 1 }}>
            <span style={{ fontWeight: 300, fontSize: 36 }}>Draft</span>
            <span style={{ fontWeight: 600, fontSize: 36 }}>Price</span>
            <span style={{ fontWeight: 900, fontSize: 36, color: "var(--signal)" }}>Approve</span>
            <span style={{ fontWeight: 800, fontSize: 36 }}>Ship</span>
          </div>
          <p className={`${s.body} mt-6 max-w-[60ch]`}>
            Sheet titles on real drawings were lettered through stencils. The break in every letter says drawn with a tool, not typed. It is condensed, so long project names still fit a title block.
          </p>
        </div>
        <div className="lg:col-span-5">
          <Sub n="3.3" name="Everything else" note="Martian Mono · width 75 to 112" />
          <p style={{ fontSize: 22, lineHeight: 1.45, fontStretch: "100%" }}>Every object has a plain face, a spec and its code.</p>
          <p className={`mt-6 ${s.cyan}`} style={{ fontSize: 13, letterSpacing: "0.1em", fontStretch: "75%", textTransform: "uppercase" }}>
            X 412.0 · Y 208.5 · 682 cr ≈ $6.82 · rev C
          </p>
          <p className="mt-4" style={{ fontSize: 30, letterSpacing: "0.02em", fontStretch: "112.5%", fontWeight: 300 }}>
            0123456789
          </p>
          <div className="mt-6 flex flex-col gap-2">
            {[
              [75, "Annotations, dimensions"],
              [87.5, "Labels, buttons, tabs"],
              [100, "Reading text"],
              [112.5, "Figures on their own"],
            ].map(([w, l]) => (
              <div key={w} className="flex items-baseline gap-4 border-t pt-2" style={{ borderColor: "var(--line-faint)" }}>
                <span className={`${s.tiny} ${s.pencil} w-24 flex-none whitespace-nowrap`}>wdth {w}</span>
                <span style={{ fontStretch: `${w}%`, fontSize: 15 }}>{l}</span>
              </div>
            ))}
          </div>
          <p className={`${s.body} mt-6`}>
            A mono is the honest voice for dimensions, prices and code. The width axis lets one family be roomy body copy and tight plotter lettering.
          </p>
        </div>
      </div>

      {/* motion */}
      <div className="mt-24">
        <Sub n="3.4" name="Motion" note="Transforms, opacity and dash offset only" />
        <div className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-4" data-reveal>
          {MOTION.map((m, i) => (
            <div key={m.t} className={s.motionRow} style={{ gridTemplateColumns: "84px 1fr" }}>
              {m.demo}
              <div>
                <div className={s.noteTitle} style={{ fontSize: 21, marginBottom: 6 }}>
                  <span className={s.cyan} style={{ fontFamily: "var(--mono)", fontSize: 10, marginRight: 8, verticalAlign: 3 }}>
                    0{i + 1}
                  </span>
                  {m.t}
                </div>
                <p className={`${s.pencil}`} style={{ fontSize: 11.5, lineHeight: 1.6, fontStretch: "88%" }}>
                  {m.b}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
