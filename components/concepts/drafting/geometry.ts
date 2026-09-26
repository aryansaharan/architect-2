import type { ScreenKind } from "./model";

/** Two decimals keeps server and client markup identical and paths short. */
export const f = (n: number) => Math.round(n * 100) / 100;

export const rect = (x: number, y: number, w: number, h: number) => `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;

export function circle(cx: number, cy: number, r: number, startDeg = -90) {
  const a = (startDeg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(a);
  const y1 = cy + r * Math.sin(a);
  const x2 = cx - r * Math.cos(a);
  const y2 = cy - r * Math.sin(a);
  return `M${f(x1)} ${f(y1)}A${r} ${r} 0 1 1 ${f(x2)} ${f(y2)}A${r} ${r} 0 1 1 ${f(x1)} ${f(y1)}`;
}

export function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (d: number) => [cx + r * Math.cos((d * Math.PI) / 180), cy + r * Math.sin((d * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
}

/** Radial ticks, like a protractor edge. */
export function ticks(cx: number, cy: number, r0: number, r1: number, every: number, offset = 0) {
  let d = "";
  for (let a = offset; a < 360 + offset; a += every) {
    const c = Math.cos((a * Math.PI) / 180);
    const s = Math.sin((a * Math.PI) / 180);
    const long = Math.round((a - offset) / every) % 3 === 0 ? 2.5 : 0;
    d += `M${f(cx + r0 * c)} ${f(cy + r0 * s)}L${f(cx + (r1 + long) * c)} ${f(cy + (r1 + long) * s)}`;
  }
  return d;
}

/** Scalloped revision cloud around a w by h box: the drafting mark for "changed here". */
export function cloud(w: number, h: number, s = 16) {
  const nx = Math.max(2, Math.round(w / s));
  const ny = Math.max(2, Math.round(h / s));
  const sx = w / nx;
  const sy = h / ny;
  const r = (v: number) => f(v * 0.62);
  let d = `M0 0`;
  for (let i = 1; i <= nx; i++) d += `A${r(sx)} ${r(sx)} 0 0 1 ${f(i * sx)} 0`;
  for (let i = 1; i <= ny; i++) d += `A${r(sy)} ${r(sy)} 0 0 1 ${f(w)} ${f(i * sy)}`;
  for (let i = nx - 1; i >= 0; i--) d += `A${r(sx)} ${r(sx)} 0 0 1 ${f(i * sx)} ${f(h)}`;
  for (let i = ny - 1; i >= 0; i--) d += `A${r(sy)} ${r(sy)} 0 0 1 0 ${f(i * sy)}`;
  return d;
}

export interface Wire {
  /** secondary linework, one path so it plots as a single pass */
  wire: string;
  /** areas filled with section hatching */
  hatch: { x: number; y: number; w: number; h: number }[];
  /** marks in the human accent (things that wait for a person) */
  accent?: string;
}

const line = (x0: number, y0: number, x1: number, y1: number) => `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
const h = (x: number, y: number, len: number) => `M${f(x)} ${f(y)}h${f(len)}`;

/** Wireframe contents for a screen of size w by ht, in local coordinates. */
export function wireframe(kind: ScreenKind, w: number, ht: number): Wire {
  const bar = 14;
  let wire = `M0 ${bar}H${f(w)}` + h(w - 38, 7, 7) + h(w - 27, 7, 7) + h(w - 16, 7, 7);
  const hatch: Wire["hatch"] = [{ x: 5, y: 4, w: 6, h: 6 }];
  let accent = "";
  const top = bar + 7;
  const inner = w - 12;

  switch (kind) {
    case "inbox": {
      const rail = Math.max(22, w * 0.24);
      wire += `M${f(rail)} ${bar}V${f(ht)}`;
      for (let i = 0; i < 4; i++) wire += h(6, top + 3 + i * 9, rail - 14);
      const rows = Math.floor((ht - top - 4) / 17);
      for (let i = 0; i < rows; i++) {
        const y = top + i * 17;
        wire += circle(rail + 9, y + 5, 3) + h(rail + 17, y + 3, (w - rail) * 0.46) + h(rail + 17, y + 8, (w - rail) * 0.28);
        wire += h(rail + 4, y + 14, w - rail - 8);
      }
      hatch.push({ x: rail + 1, y: top + 17, w: w - rail - 2, h: 13 });
      break;
    }
    case "approvals": {
      const rows = Math.min(3, Math.floor((ht - top) / 28));
      for (let i = 0; i < rows; i++) {
        const y = top + i * 28;
        wire += rect(6, y, inner, 22) + h(12, y + 7, inner * 0.42) + h(12, y + 14, inner * 0.28);
        wire += rect(w - 34, y + 6, 10, 10);
        accent += rect(w - 20, y + 6, 10, 10) + line(w - 18, y + 11, w - 15, y + 14) + line(w - 15, y + 14, w - 12, y + 8);
      }
      break;
    }
    case "dashboard": {
      const kw = (inner - 8) / 3;
      for (let i = 0; i < 3; i++) {
        wire += rect(6 + i * (kw + 4), top, kw, 18) + h(10 + i * (kw + 4), top + 12, kw * 0.5);
      }
      const base = ht - 7;
      const cy = top + 26;
      const half = inner / 2;
      wire += h(6, base, half - 4);
      const bars = 5;
      const bw = (half - 10) / bars;
      for (let i = 0; i < bars; i++) {
        const bh = (base - cy) * [0.45, 0.7, 0.55, 0.9, 0.65][i];
        wire += rect(8 + i * bw, base - bh, bw - 3, bh);
        if (i % 2 === 1) hatch.push({ x: 8 + i * bw, y: base - bh, w: bw - 3, h: bh });
      }
      const x0 = 6 + half + 4;
      const pts = [0.8, 0.55, 0.62, 0.3, 0.4, 0.12].map((p, i) => [x0 + (i * (half - 10)) / 5, cy + p * (base - cy)]);
      wire += "M" + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L");
      pts.forEach(([x, y]) => (wire += circle(x, y, 1.6)));
      wire += h(x0, base, half - 10);
      break;
    }
    case "form": {
      const rows = Math.min(3, Math.floor((ht - top - 22) / 22));
      for (let i = 0; i < rows; i++) {
        const y = top + i * 22;
        wire += h(8, y + 2, inner * 0.3) + rect(6, y + 6, inner, 11);
      }
      const by = top + rows * 22 + 4;
      wire += rect(6, by, inner * 0.36, 12);
      hatch.push({ x: 6, y: by, w: inner * 0.36, h: 12 });
      break;
    }
    case "chat": {
      let y = top;
      let i = 0;
      while (y + 16 < ht - 18) {
        const left = i % 2 === 0;
        const bw = inner * (left ? 0.62 : 0.5);
        const x = left ? 6 : w - 6 - bw;
        wire += `M${f(x + 4)} ${f(y)}H${f(x + bw - 4)}Q${f(x + bw)} ${f(y)} ${f(x + bw)} ${f(y + 4)}V${f(y + 10)}Q${f(x + bw)} ${f(y + 14)} ${f(x + bw - 4)} ${f(y + 14)}H${f(x + 4)}Q${f(x)} ${f(y + 14)} ${f(x)} ${f(y + 10)}V${f(y + 4)}Q${f(x)} ${f(y)} ${f(x + 4)} ${f(y)}Z`;
        if (!left) hatch.push({ x: x + 1, y: y + 1, w: bw - 2, h: 12 });
        y += 19;
        i++;
      }
      wire += rect(6, ht - 15, inner, 10) + h(10, ht - 10, inner * 0.4);
      break;
    }
    case "reports": {
      wire += rect(6, top, inner * 0.56, ht - top - 6);
      for (let i = 0; i < 6 && top + 8 + i * 8 < ht - 10; i++) wire += h(10, top + 6 + i * 8, inner * (i % 3 === 2 ? 0.3 : 0.46));
      const r = Math.min(inner * 0.18, (ht - top) * 0.32);
      const cx = 6 + inner * 0.8;
      const cy = top + (ht - top) / 2 - 3;
      wire += circle(cx, cy, r) + line(cx, cy, cx, cy - r) + line(cx, cy, cx + r * 0.87, cy + r * 0.5);
      break;
    }
    case "schedule": {
      const cols = 7;
      const rows = 4;
      const cw = inner / cols;
      const rh = (ht - top - 6) / rows;
      wire += rect(6, top, inner, rh * rows);
      for (let c = 1; c < cols; c++) wire += `M${f(6 + c * cw)} ${f(top)}V${f(top + rh * rows)}`;
      for (let r = 1; r < rows; r++) wire += h(6, top + r * rh, inner);
      [
        [1, 0],
        [3, 1],
        [4, 1],
        [2, 2],
        [5, 3],
      ].forEach(([c, r]) => hatch.push({ x: 6 + c * cw + 1, y: top + r * rh + 1, w: cw - 2, h: rh - 2 }));
      break;
    }
    case "pipeline": {
      const cols = w > 130 ? 4 : 3;
      const cw = (inner - (cols - 1) * 4) / cols;
      for (let c = 0; c < cols; c++) {
        const x = 6 + c * (cw + 4);
        wire += h(x, top + 2, cw);
        const cards = [3, 2, 2, 1][c];
        for (let k = 0; k < cards && top + 7 + k * 16 + 12 < ht; k++) {
          wire += rect(x, top + 7 + k * 16, cw, 12) + h(x + 3, top + 13 + k * 16, cw * 0.5);
        }
        if (c === 0) hatch.push({ x: x + 1, y: top + 8, w: cw - 2, h: 10 });
      }
      break;
    }
    case "catalog": {
      const cols = w > 130 ? 3 : 2;
      const tw = (inner - (cols - 1) * 5) / cols;
      const th = (ht - top - 10) / 2 - 4;
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < cols; c++) {
          const x = 6 + c * (tw + 5);
          const y = top + r * (th + 6);
          wire += rect(x, y, tw, th) + h(x, y + th - 7, tw) + h(x + 2, y + th - 3, tw * 0.5);
          hatch.push({ x: x + 1, y: y + 1, w: tw - 2, h: th - 9 });
        }
      break;
    }
    default: {
      hatch.push({ x: 6, y: top, w: inner, h: (ht - top) * 0.45 });
      wire += rect(6, top, inner, (ht - top) * 0.45);
      const y = top + (ht - top) * 0.45 + 8;
      wire += h(6, y, inner * 0.6) + h(6, y + 7, inner * 0.4) + rect(6, y + 13, inner * 0.3, 10);
    }
  }
  return { wire, hatch, accent: accent || undefined };
}
