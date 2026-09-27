/**
 * Pencil drawings. Every line is drawn by code with a little wobble, from a fixed
 * seed, so the server and the browser draw exactly the same thing. No motion.
 * Pencil = graphite with a second, lighter pass. Ink = the same shapes, crisp.
 */

function rng(seed: number) {
  let s = (Math.imul(seed + 1, 2654435761) >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const f = (n: number) => Math.round(n * 10) / 10;

/** One stroke from a to b: a slight bow and loose ends, like a hand with a pencil. j = 0 draws it crisp. */
function stroke(x1: number, y1: number, x2: number, y2: number, r: () => number, j: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const over = j * (0.4 + r() * 0.9);
  const sx = x1 - ux * over + (r() - 0.5) * j;
  const sy = y1 - uy * over + (r() - 0.5) * j;
  const ex = x2 + ux * over * 0.6 + (r() - 0.5) * j;
  const ey = y2 + uy * over * 0.6 + (r() - 0.5) * j;
  const bow = (r() - 0.5) * j * Math.min(3, len / 18);
  const mx = (sx + ex) / 2 - uy * bow;
  const my = (sy + ey) / 2 + ux * bow;
  return `M${f(sx)} ${f(sy)}Q${f(mx)} ${f(my)} ${f(ex)} ${f(ey)}`;
}

export function roughLine(x1: number, y1: number, x2: number, y2: number, seed: number, j = 1) {
  return stroke(x1, y1, x2, y2, rng(seed), j);
}

export function roughRect(x: number, y: number, w: number, h: number, seed: number, j = 1) {
  const r = rng(seed);
  return stroke(x, y, x + w, y, r, j) + stroke(x + w, y, x + w, y + h, r, j) + stroke(x + w, y + h, x, y + h, r, j) + stroke(x, y + h, x, y, r, j);
}

/** A line of handwriting: little arches along a baseline, with gaps between words. */
export function scribble(x: number, y: number, w: number, seed: number, amp = 3.2) {
  const r = rng(seed);
  let d = `M${f(x)} ${f(y)}`;
  let cx = x;
  while (cx < x + w - 5) {
    if (r() < 0.16 && cx > x + 8) {
      cx += 4 + r() * 4;
      d += `M${f(cx)} ${f(y)}`;
      continue;
    }
    const wd = 3 + r() * 3.2;
    const h = r() < 0.18 ? amp * 2.2 : amp * (0.75 + r() * 0.5);
    d += `c${f(wd * 0.1)} ${f(-h)} ${f(wd * 0.9)} ${f(-h)} ${f(wd)} 0`;
    cx += wd;
  }
  return d;
}

const GRAPHITE = "var(--graphite)";
const SOFT = "var(--graphite-soft)";
const INK = "var(--foreground)";

/** A path drawn in pencil: one firm pass and a lighter second pass beside it. */
function Pencil({ d, d2, width = 1.4, color = GRAPHITE, opacity = 1 }: { d: string; d2?: string; width?: number; color?: string; opacity?: number }) {
  return (
    <>
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeOpacity={opacity} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {d2 && <path d={d2} fill="none" stroke={color} strokeWidth={width * 0.7} strokeOpacity={opacity * 0.4} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
    </>
  );
}

const handwriting = { fontFamily: "var(--font-pencil), cursive" } as const;

/** Step 1: a note on ruled paper, and the pencil that wrote it. */
export function WriteSketch({ className }: { className?: string }) {
  const rules = [48, 66, 84, 102, 120, 138];
  return (
    <svg viewBox="0 0 240 170" className={className} role="img" aria-label="A pencil writing a note on ruled paper">
      <g transform="rotate(-4 118 86)">
        <rect x="54" y="18" width="130" height="136" fill="var(--panel)" />
        {rules.map((y, i) => (
          <path key={y} d={roughLine(60, y, 178, y, 40 + i, 0.4)} stroke="rgb(44 98 201 / 0.22)" strokeWidth="0.9" fill="none" />
        ))}
        <Pencil d={roughRect(54, 18, 130, 136, 11)} d2={roughRect(54, 18, 130, 136, 12, 1.4)} />
        <Pencil d={scribble(64, 46, 98, 21)} width={1.2} />
        <Pencil d={scribble(64, 64, 108, 22)} width={1.2} />
        <Pencil d={scribble(64, 82, 62, 23)} width={1.2} />
      </g>
      <g transform="rotate(-36 186 118)">
        <path d="M150 112 L150 124 L134 118 Z" fill="var(--panel)" />
        <path d="M139 116.2 L139 119.8 L134 118 Z" fill={GRAPHITE} />
        <rect x="150" y="112" width="68" height="12" fill="#efe3b0" />
        <rect x="218" y="112" width="10" height="12" fill="var(--hairline-hi)" />
        <Pencil d={roughRect(150, 112, 78, 12, 31, 0.6) + roughLine(150, 112, 134, 118, 32, 0.4) + roughLine(150, 124, 134, 118, 33, 0.4) + roughLine(218, 112, 218, 124, 34, 0.3)} width={1.2} />
      </g>
    </svg>
  );
}

/** Step 2: the app drawn as a pencil sketch, a helper on a sticky note, and the price on a tag. */
export function PlanSketch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 170" className={className} role="img" aria-label="A pencil sketch of an app with a helper note and a price tag">
      <Pencil d={roughRect(18, 26, 160, 122, 51)} d2={roughRect(18, 26, 160, 122, 52, 1.6)} />
      <Pencil d={roughLine(18, 44, 178, 44, 53)} />
      <Pencil d={roughLine(56, 44, 56, 148, 54)} />
      <Pencil d={scribble(26, 38, 26, 55, 2.4)} width={1.1} />
      {[60, 74, 88].map((y, i) => (
        <Pencil key={y} d={roughLine(26, y, 46 - i * 4, y, 60 + i, 0.6)} width={1.1} color={SOFT} />
      ))}
      <Pencil d={roughRect(66, 54, 102, 48, 56)} width={1.2} />
      {[66, 78, 90].map((y, i) => (
        <Pencil key={y} d={roughLine(72, y, 160, y, 70 + i, 0.6)} width={1} color={SOFT} />
      ))}
      <Pencil d={roughRect(66, 112, 36, 16, 57)} width={1.2} />
      <Pencil d={scribble(71, 123, 24, 58, 2)} width={1} />

      <g transform="rotate(5 184 104)">
        <rect x="152" y="76" width="66" height="56" fill="#fdf6d8" stroke="#efe3b0" />
        <text x="160" y="96" fontSize="15" fill={GRAPHITE} style={handwriting}>helper</text>
        <Pencil d={scribble(160, 110, 46, 81, 2.2)} width={1} />
        <Pencil d={scribble(160, 122, 34, 82, 2.2)} width={1} />
      </g>

      <g transform="rotate(9 200 20)">
        <Pencil d={`M170 10 L210 10 L220 20 L210 30 L170 30 Z`} width={1.2} />
        <circle cx="212" cy="20" r="2" fill="none" stroke={GRAPHITE} strokeWidth="1" />
        <text x="175" y="25" fontSize="14" fill="var(--amber)" style={handwriting}>$0.60</text>
      </g>
    </svg>
  );
}

/** Step 3: the same app, inked and real, with a note written in the margin. */
export function RealSketch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 170" className={className} role="img" aria-label="The finished app with a note in the margin asking for a change">
      <rect x="18" y="38" width="160" height="122" rx="6" fill="#ffffff" stroke={INK} strokeWidth="1.4" />
      <path d="M18 56 H178" stroke={INK} strokeWidth="1.1" />
      <rect x="26" y="44" width="34" height="6" rx="2" fill={INK} />
      <rect x="18.7" y="56.5" width="37" height="102.8" fill="var(--deep)" />
      <path d="M56 56 V160" stroke={INK} strokeWidth="1.1" />
      {[70, 82, 94].map((y, i) => (
        <rect key={y} x="26" y={y} width={22 - i * 4} height="4" rx="2" fill={i === 0 ? "var(--amber)" : "var(--hairline-hi)"} />
      ))}
      <rect x="66" y="66" width="102" height="48" rx="3" fill="none" stroke="var(--hairline-hi)" strokeWidth="1.1" />
      {[78, 90, 102].map((y) => (
        <g key={y}>
          <circle cx="74" cy={y} r="2.2" fill="var(--amber)" />
          <rect x="81" y={y - 2} width="50" height="4" rx="2" fill="var(--hairline-hi)" />
          <rect x="140" y={y - 2} width="20" height="4" rx="2" fill="var(--hairline)" />
        </g>
      ))}
      <rect x="66" y="124" width="38" height="16" rx="3" fill="var(--amber)" />
      <rect x="73" y="130.5" width="24" height="3" rx="1.5" fill="#f7f5f0" />

      <text x="104" y="17" fontSize="16" fill="var(--amber)" style={handwriting}>a bigger title, please</text>
      <path d="M102 14 C 78 12, 58 18, 50 36" fill="none" stroke="var(--amber)" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M45 29 L50 37 L56 30" fill="none" stroke="var(--amber)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A loose pencil arrow for notes in the margin. Points left and down by default. */
export function PencilArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 70" className={className} aria-hidden>
      <path d="M112 8 C 84 2, 40 8, 16 54" fill="none" stroke={GRAPHITE} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 44 L15 56 L27 50" fill="none" stroke={GRAPHITE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A hand-drawn checkbox (square) or choice (round). The tick is inked in the accent. */
export function PencilBox({ on, round, seed = 1 }: { on: boolean; round?: boolean; seed?: number }) {
  return (
    <svg viewBox="0 0 20 20" className="size-[18px] shrink-0 overflow-visible" aria-hidden>
      {round ? (
        <path d="M10 2.6 C 14.6 2.4, 17.6 5.6, 17.4 10.2 C 17.2 14.6, 14 17.6, 9.6 17.4 C 5.4 17.2, 2.4 14.2, 2.6 9.8 C 2.8 5.6, 5.6 2.9, 10.6 2.8" fill="none" stroke={GRAPHITE} strokeWidth="1.3" strokeLinecap="round" />
      ) : (
        <path d={roughRect(2.5, 2.5, 15, 15, seed, 0.7)} fill="none" stroke={GRAPHITE} strokeWidth="1.3" strokeLinecap="round" />
      )}
      {on && <path d="M4.5 10.5 L8.6 14.6 L18.5 2.5" fill="none" stroke="var(--amber)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="fade-up" />}
    </svg>
  );
}

/**
 * A small wireframe of one screen. In pencil while it's a sketch, in ink once it's real.
 * The layout follows the screen's own layout (dashboard, split, single, form).
 */
export function Wireframe({ layout, ink, seed = 1, className }: { layout?: string; ink?: boolean; seed?: number; className?: string }) {
  const j = ink ? 0 : 0.9;
  const color = ink ? INK : GRAPHITE;
  const soft = ink ? "var(--hairline-hi)" : SOFT;
  const w = ink ? 1 : 1.15;
  const s = seed * 17;
  const line = (x1: number, y1: number, x2: number, y2: number, k: number, c = soft) => <Pencil key={`l${k}`} d={roughLine(x1, y1, x2, y2, s + k, j)} color={c} width={w} />;
  const box = (x: number, y: number, bw: number, bh: number, k: number, c = color) => <Pencil key={`b${k}`} d={roughRect(x, y, bw, bh, s + k, j)} d2={ink ? undefined : roughRect(x, y, bw, bh, s + k + 50, j * 1.5)} color={c} width={w} />;
  const button = (x: number, y: number) =>
    ink ? <rect key="btn" x={x} y={y} width="26" height="9" rx="2" fill="var(--amber)" /> : box(x, y, 26, 9, 90);
  let body: React.ReactNode;
  switch (layout) {
    case "dashboard":
      body = (
        <>
          {[10, 58, 106].map((x, i) => box(x, 24, 44, 18, 10 + i, soft))}
          {box(10, 48, 140, 42, 20)}
          {[60, 70, 80].map((y, i) => line(16, y, 144, y, 30 + i))}
        </>
      );
      break;
    case "split":
      body = (
        <>
          {box(10, 24, 58, 66, 10)}
          {[34, 46, 58, 70].map((y, i) => line(16, y, 60, y, 20 + i))}
          {box(76, 24, 74, 66, 30)}
          {[36, 48, 60].map((y, i) => line(82, y, 140 - i * 10, y, 40 + i))}
          {button(82, 72)}
        </>
      );
      break;
    case "form":
      body = (
        <>
          {[26, 40, 54].map((y, i) => box(42, y, 76, 9, 10 + i, soft))}
          {button(42, 72)}
        </>
      );
      break;
    default:
      body = (
        <>
          {box(10, 26, 140, 64, 10)}
          {line(10, 38, 150, 38, 20, color)}
          {[50, 62, 74].map((y, i) => line(16, y, 144, y, 30 + i))}
          {button(124, 10)}
        </>
      );
  }
  return (
    <svg viewBox="0 0 160 100" className={className} aria-hidden>
      {ink && <rect x="4" y="4" width="152" height="92" rx="4" fill="#ffffff" />}
      {box(4, 4, 152, 92, 1, color)}
      {ink ? <rect x="10" y="9" width="36" height="5" rx="2" fill={INK} /> : <Pencil d={scribble(10, 14, 34, s + 3, 2.2)} width={1} />}
      {body}
    </svg>
  );
}
