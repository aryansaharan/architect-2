import type { Blueprint } from "./model";
import { f } from "./geometry";

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Dot {
  x: number;
  y: number;
  r: number;
}
export interface ConnPos {
  x: number;
  y: number;
  len: number;
}
export interface Route {
  d: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  dir: "down" | "right" | "left";
}
export interface Level {
  key: string;
  label: string;
  y: number;
}

export interface Plan {
  W: number;
  H: number;
  portrait: boolean;
  levels: Level[];
  screens: Record<string, Frame>;
  agents: Record<string, Dot>;
  data: Record<string, Frame>;
  conns: Record<string, ConnPos>;
  /** orthogonal routes, all with the same command shape so they can morph */
  routes: Record<string, Route>;
  dim: { x0: number; x1: number; y: number } | null;
  connHead: { x: number; y: number } | null;
}

/** Evenly spread n centres inside [a, b], at most `max` apart. */
function spread(n: number, a: number, b: number, max: number) {
  const step = Math.min(max, (b - a) / n);
  const start = a + (b - a - step * (n - 1)) / 2;
  return Array.from({ length: n }, (_, i) => start + i * step);
}

const route = (x0: number, y0: number, mid: number, x1: number, y1: number): Route => ({
  d: `M${f(x0)} ${f(y0)}V${f(mid)}H${f(x1)}V${f(y1)}`,
  x0,
  y0,
  x1,
  y1,
  dir: "down",
});

const route5 = (x0: number, y0: number, lane: number, bus: number, y1: number, x1: number): Route => ({
  d: `M${f(x0)} ${f(y0)}V${f(lane)}H${f(bus)}V${f(y1)}H${f(x1)}`,
  x0,
  y0,
  x1,
  y1,
  dir: x1 > bus ? "right" : "left",
});

export function plan(bp: Blueprint, portrait: boolean): Plan {
  const out: Plan = {
    W: portrait ? 440 : 920,
    H: portrait ? 640 : 520,
    portrait,
    levels: [],
    screens: {},
    agents: {},
    data: {},
    conns: {},
    routes: {},
    dim: null,
    connHead: null,
  };
  if (bp.empty) return out;

  const hasConns = bp.conns.length > 0;

  if (!portrait) {
    const X0 = 122;
    const X1 = hasConns ? 646 : 890;
    /* screens */
    const n = bp.screens.length;
    const gap = 22;
    const sh = 112;
    const sy = 58;
    const sw = Math.min(176, (X1 - X0 - gap * (n - 1)) / n);
    const total = n * sw + (n - 1) * gap;
    const sx0 = X0 + (X1 - X0 - total) / 2;
    bp.screens.forEach((s, i) => (out.screens[s.id] = { x: sx0 + i * (sw + gap), y: sy, w: sw, h: sh }));
    out.dim = { x0: sx0, x1: sx0 + total, y: 34 };

    /* agents */
    const r = 28;
    const cy = 296;
    spread(bp.agents.length, X0, X1, 150).forEach((x, i) => (out.agents[bp.agents[i].id] = { x, y: cy, r }));

    /* data */
    const dw = 88;
    const dh = 54;
    const dy = 410;
    spread(bp.data.length, X0, X1, 170).forEach((x, i) => (out.data[bp.data[i].id] = { x: x - dw / 2, y: dy, w: dw, h: dh }));

    /* connections column */
    const cx0 = 734;
    const clen = 156;
    const ys = spread(bp.conns.length, 214, 404, 58);
    bp.conns.forEach((c, i) => (out.conns[c.id] = { x: cx0, y: ys[i], len: clen }));
    if (hasConns) out.connHead = { x: cx0 + clen / 2, y: ys[0] - 40 };

    out.levels = [
      { key: "l1", label: "Screens", y: sy },
      { key: "l2", label: "Agents", y: cy },
      { key: "l3", label: "Data", y: dy },
    ];

    /* wiring */
    let k = 0;
    let j = 0;
    for (const l of bp.links) {
      const s = out.screens[l.from];
      const a = out.agents[l.from];
      const ta = out.agents[l.to];
      const td = out.data[l.to];
      if (s && ta) {
        out.routes[l.id] = route(s.x + s.w / 2, s.y + s.h + 28, 226 + (k++ % 3) * 7, ta.x, ta.y - ta.r - 4);
      } else if (a && td) {
        out.routes[l.id] = route(a.x, a.y + a.r + 36, 388 - (j++ % 2) * 6, td.x + td.w / 2, td.y - 14);
      }
    }
    bp.conns.forEach((c, i) => {
      const a = out.agents[c.agentId];
      const p = out.conns[c.id];
      if (!a || !p) return;
      out.routes[c.id] = route5(a.x + 12, a.y + a.r + 36, 366 + i * 5, X1 + 34 + i * 8, p.y, p.x);
    });
    return out;
  }

  /* ------------------------------------------------------------ portrait */
  const X0 = 44;
  const X1 = 424;
  const XR = hasConns ? X1 - 34 : X1;
  const n = bp.screens.length;
  const gap = 16;
  const sh = 104;
  const perRow = n === 1 ? 1 : 2;
  const sw = n === 1 ? 220 : (X1 - X0 - gap) / 2;
  const rows = Math.ceil(n / perRow);
  const sy0 = 50;
  bp.screens.forEach((s, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const inRow = Math.min(perRow, n - row * perRow);
    const rowW = inRow * sw + (inRow - 1) * gap;
    const x0 = X0 + (X1 - X0 - rowW) / 2;
    out.screens[s.id] = { x: x0 + col * (sw + gap), y: sy0 + row * (sh + 44), w: sw, h: sh };
  });
  const firstRowW = Math.min(perRow, n) * sw + (Math.min(perRow, n) - 1) * gap;
  out.dim = { x0: X0 + (X1 - X0 - firstRowW) / 2, x1: X0 + (X1 - X0 + firstRowW) / 2, y: 28 };
  const screensEnd = sy0 + (rows - 1) * (sh + 44) + sh + 28;

  const r = 24;
  const cy = screensEnd + 64;
  spread(bp.agents.length, X0, XR, 104).forEach((x, i) => (out.agents[bp.agents[i].id] = { x, y: cy, r }));

  const dw = 80;
  const dh = 50;
  const dy = cy + r + 34 + 52;
  spread(bp.data.length, X0, XR, 130).forEach((x, i) => (out.data[bp.data[i].id] = { x: x - dw / 2, y: dy, w: dw, h: dh }));

  const cstart = dy + dh + 36 + 56;
  bp.conns.forEach((c, i) => (out.conns[c.id] = { x: 150, y: cstart + i * 52, len: 236 }));
  if (hasConns) out.connHead = { x: 268, y: cstart - 34 };

  out.levels = [
    { key: "l1", label: "Screens", y: sy0 },
    { key: "l2", label: "Agents", y: cy },
    { key: "l3", label: "Data", y: dy },
  ];
  out.H = f((hasConns ? cstart + (bp.conns.length - 1) * 52 + 34 : dy + dh + 44) + 8);

  let k = 0;
  let j = 0;
  for (const l of bp.links) {
    const s = out.screens[l.from];
    const a = out.agents[l.from];
    const ta = out.agents[l.to];
    const td = out.data[l.to];
    if (s && ta) {
      out.routes[l.id] = route(s.x + s.w / 2, s.y + s.h + 26, screensEnd + 10 + (k++ % 3) * 6, ta.x, ta.y - ta.r - 4);
    } else if (a && td) {
      out.routes[l.id] = route(a.x, a.y + a.r + 34, dy - 24 - (j++ % 2) * 5, td.x + td.w / 2, td.y - 14);
    }
  }
  bp.conns.forEach((c, i) => {
    const a = out.agents[c.agentId];
    const p = out.conns[c.id];
    if (!a || !p) return;
    out.routes[c.id] = route5(a.x + 10, a.y + a.r + 34, dy - 46 + i * 4, X1 + 4 - i * 7, p.y, p.x + p.len);
  });
  return out;
}
