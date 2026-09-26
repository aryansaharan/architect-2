/*
 * Two-plate halftone artwork, like a risograph pulls it.
 * Each plate is painted as a grey "tone" field first, then screened into
 * dots at its own angle. The browser overprints the two plates with
 * mix-blend-mode: multiply, so overlaps make a third colour for free.
 */
import { rng, type Motif, type Spec } from "./engine";

type Ctx = CanvasRenderingContext2D;
type R = () => number;
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const k = (t: number) => `rgba(0,0,0,${Math.max(0, Math.min(1, t))})`;

function lin(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, t0: number, t1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, k(t0));
  g.addColorStop(1, k(t1));
  return g;
}
function rad(ctx: Ctx, x: number, y: number, r: number, t0: number, t1: number) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.05, x, y, r);
  g.addColorStop(0, k(t0));
  g.addColorStop(1, k(t1));
  return g;
}
function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
/** Knock out a stroke: the paper shows through, the way riso "white" works. */
function knock(ctx: Ctx, draw: () => void, width: number) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000";
  draw();
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------- motifs */

const MOTIFS: Record<Motif, (ctx: Ctx, b: Box, r: R, strong: boolean) => void> = {
  inbox(ctx, b, r, strong) {
    // a stack of trays, stepping down
    const n = 3;
    for (let i = 0; i < n; i++) {
      const w = b.w * 0.82;
      const h = b.h * 0.26;
      const x = b.x + (b.w - w) * (i / (n - 1));
      const y = b.y + b.h * 0.12 + i * h * 0.95;
      ctx.fillStyle = lin(ctx, x, y, x + w, y + h, strong ? 0.95 : 0.7, 0.25 + r() * 0.2);
      rrect(ctx, x, y, w, h, h * 0.18);
      ctx.fill();
      knock(ctx, () => {
        ctx.beginPath();
        ctx.moveTo(x + w * 0.3, y + h * 0.5);
        ctx.lineTo(x + w * 0.7, y + h * 0.5);
      }, h * 0.14);
    }
  },
  email(ctx, b, r, strong) {
    const w = b.w * 0.9;
    const h = w * 0.62;
    const x = b.x + (b.w - w) / 2;
    const y = b.y + (b.h - h) / 2;
    ctx.fillStyle = lin(ctx, x, y + h, x + w, y, strong ? 1 : 0.75, 0.3 + r() * 0.15);
    rrect(ctx, x, y, w, h, 6);
    ctx.fill();
    knock(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + w / 2, y + h * 0.58);
      ctx.lineTo(x + w - 4, y + 4);
    }, Math.max(4, w * 0.035));
  },
  approve(ctx, b, r, strong) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const R = Math.min(b.w, b.h) * 0.48;
    ctx.fillStyle = rad(ctx, cx, cy, R, strong ? 1 : 0.8, 0.35);
    ctx.beginPath();
    const teeth = 22 + Math.floor(r() * 10);
    for (let i = 0; i <= teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const rr = i % 2 ? R : R * 0.9;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.fill();
    knock(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.42, cy + R * 0.02);
      ctx.lineTo(cx - R * 0.1, cy + R * 0.32);
      ctx.lineTo(cx + R * 0.45, cy - R * 0.3);
    }, R * 0.16);
  },
  pay(ctx, b, r, strong) {
    const n = 3 + Math.floor(r() * 2);
    const R = Math.min(b.h * 0.42, (b.w / (n + 1)) * 0.95);
    for (let i = 0; i < n; i++) {
      const cx = b.x + R + (i * (b.w - 2 * R)) / Math.max(1, n - 1);
      const cy = b.y + b.h * 0.5 + (i % 2 ? -1 : 1) * R * 0.25;
      ctx.fillStyle = rad(ctx, cx, cy, R, strong ? 1 : 0.8, 0.3 + r() * 0.2);
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      knock(ctx, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.72, 0, Math.PI * 2);
      }, R * 0.07);
    }
  },
  form(ctx, b, r, strong) {
    const rows = 4;
    const h = (b.h / rows) * 0.62;
    for (let i = 0; i < rows; i++) {
      const y = b.y + i * (b.h / rows);
      const w = b.w * (i === rows - 1 ? 0.42 : 0.7 + r() * 0.3);
      ctx.fillStyle = lin(ctx, b.x, y, b.x + w, y, strong ? 0.95 : 0.7, 0.2);
      rrect(ctx, b.x, y, w, h, h / 2);
      ctx.fill();
    }
  },
  chat(ctx, b, r, strong) {
    const bubbles = [
      { x: 0, y: 0, w: 0.72, h: 0.4, tail: -1 },
      { x: 0.3, y: 0.52, w: 0.7, h: 0.4, tail: 1 },
    ];
    for (const q of bubbles) {
      const x = b.x + q.x * b.w;
      const y = b.y + q.y * b.h;
      const w = q.w * b.w;
      const h = q.h * b.h;
      ctx.fillStyle = lin(ctx, x, y, x + w, y + h, strong ? 1 : 0.75, 0.3 + r() * 0.2);
      rrect(ctx, x, y, w, h, h * 0.45);
      ctx.fill();
      ctx.beginPath();
      const tx = q.tail < 0 ? x + w * 0.18 : x + w * 0.82;
      ctx.moveTo(tx - 10, y + h - 6);
      ctx.lineTo(tx + q.tail * 22, y + h + 18);
      ctx.lineTo(tx + 12, y + h - 6);
      ctx.fill();
      knock(ctx, () => {
        ctx.beginPath();
        for (let d = 0; d < 3; d++) {
          const dx = x + w * (0.35 + d * 0.15);
          ctx.moveTo(dx + h * 0.07, y + h / 2);
          ctx.arc(dx, y + h / 2, h * 0.07, 0, Math.PI * 2);
        }
      }, h * 0.06);
    }
  },
  dashboard(ctx, b, r, strong) {
    const n = 6;
    const gap = b.w * 0.04;
    const w = (b.w - gap * (n - 1)) / n;
    let v = 0.3 + r() * 0.2;
    for (let i = 0; i < n; i++) {
      v = Math.min(1, v + r() * 0.22 - 0.04);
      const h = b.h * v;
      const x = b.x + i * (w + gap);
      ctx.fillStyle = lin(ctx, x, b.y + b.h - h, x, b.y + b.h, strong ? 1 : 0.8, 0.25);
      ctx.fillRect(x, b.y + b.h - h, w, h);
    }
  },
  report(ctx, b, r, strong) {
    const R = Math.min(b.w, b.h) * 0.42;
    const cx = b.x + R;
    const cy = b.y + b.h / 2;
    const cut = Math.PI * (0.3 + r() * 0.5);
    ctx.fillStyle = rad(ctx, cx, cy, R, strong ? 1 : 0.8, 0.35);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, cut, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = k(0.25);
    ctx.beginPath();
    ctx.moveTo(cx + 6, cy - 4);
    ctx.arc(cx + 6, cy - 4, R, 0, cut);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      const y = b.y + b.h * 0.18 + i * b.h * 0.2;
      const x = cx + R * 1.25;
      ctx.fillStyle = k(strong ? 0.85 - i * 0.12 : 0.6 - i * 0.1);
      ctx.fillRect(x, y, (b.x + b.w - x) * (0.6 + r() * 0.4), b.h * 0.07);
    }
  },
  schedule(ctx, b, r, strong) {
    const cols = 5;
    const rows = 3;
    const s = Math.min(b.w / cols, b.h / rows) * 0.84;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const on = r() > 0.55;
        ctx.fillStyle = k(on ? (strong ? 0.95 : 0.75) : 0.18);
        rrect(ctx, b.x + i * (s / 0.84), b.y + j * (s / 0.84), s, s, s * 0.12);
        ctx.fill();
      }
  },
  people(ctx, b, r, strong) {
    const n = 3;
    const w = b.w / n;
    for (let i = 0; i < n; i++) {
      const cx = b.x + w * (i + 0.5);
      const head = w * 0.22;
      const top = b.y + b.h * (0.18 + (i % 2) * 0.1);
      ctx.fillStyle = rad(ctx, cx, top + head, head, strong ? 1 : 0.8, 0.4);
      ctx.beginPath();
      ctx.arc(cx, top + head, head, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = lin(ctx, cx, top + head * 2.3, cx, b.y + b.h, strong ? 0.9 : 0.7, 0.2 + r() * 0.1);
      ctx.beginPath();
      ctx.ellipse(cx, b.y + b.h, w * 0.42, b.h - (top + head * 2.3 - b.y), 0, Math.PI, 0);
      ctx.fill();
    }
  },
  shop(ctx, b, r, strong) {
    // an awning and a box
    const stripes = 5;
    const w = b.w / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = k(i % 2 ? 0.22 : strong ? 0.95 : 0.7);
      ctx.beginPath();
      ctx.moveTo(b.x + i * w, b.y);
      ctx.lineTo(b.x + (i + 1) * w, b.y);
      ctx.lineTo(b.x + (i + 1) * w, b.y + b.h * 0.3);
      ctx.arc(b.x + (i + 0.5) * w, b.y + b.h * 0.3, w / 2, 0, Math.PI);
      ctx.fill();
    }
    ctx.fillStyle = lin(ctx, b.x, b.y + b.h * 0.5, b.x, b.y + b.h, 0.55, 0.15 + r() * 0.1);
    ctx.fillRect(b.x + b.w * 0.08, b.y + b.h * 0.5, b.w * 0.84, b.h * 0.5);
  },
  sun(ctx, b, r, strong) {
    const cx = b.x + b.w / 2;
    const R = b.w * 0.42;
    const cy = b.y + b.h * 0.72;
    ctx.fillStyle = rad(ctx, cx, cy, R, strong ? 1 : 0.8, 0.3);
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI, 0);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const y = cy + 8 + i * b.h * 0.1;
      ctx.fillStyle = k(0.7 - i * 0.18);
      ctx.beginPath();
      ctx.moveTo(b.x, y);
      for (let x = 0; x <= b.w; x += 8) ctx.lineTo(b.x + x, y + Math.sin(x / (18 + r() * 2) + i) * 5);
      ctx.lineTo(b.x + b.w, y + 10);
      ctx.lineTo(b.x, y + 10);
      ctx.fill();
    }
  },
};

/* ---------------------------------------------------------- composition */

export interface PlateTone {
  data: Float32Array;
  w: number;
  h: number;
}

function toTone(c: HTMLCanvasElement): PlateTone {
  const ctx = c.getContext("2d")!;
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  const out = new Float32Array(c.width * c.height);
  for (let i = 0; i < out.length; i++) out[i] = img[i * 4 + 3] / 255;
  return { data: out, w: c.width, h: c.height };
}

/** Paints both plates as tone fields (alpha = ink amount). */
export function paintTones(spec: Spec, W: number, H: number, fontFamily: string): [PlateTone, PlateTone] {
  const r = rng(spec.seed ^ 0x9e3779b9);
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(W));
    c.height = Math.max(1, Math.round(H));
    return c;
  };
  const A = mk();
  const B = mk();
  const a = A.getContext("2d", { willReadFrequently: true })!;
  const b = B.getContext("2d", { willReadFrequently: true })!;

  // Plate B: the field. A big gradient form behind everything.
  const field = Math.floor(r() * 4);
  if (field === 0) {
    const R = H * (0.62 + r() * 0.2);
    const cx = W * (0.55 + r() * 0.3);
    const cy = H * (0.35 + r() * 0.3);
    b.fillStyle = rad(b, cx, cy, R, 0.6, 0.06);
    b.beginPath();
    b.arc(cx, cy, R, 0, Math.PI * 2);
    b.fill();
  } else if (field === 1) {
    b.save();
    b.translate(W / 2, H / 2);
    b.rotate(-0.5 + r() * 0.3);
    b.fillStyle = lin(b, -W, 0, W, 0, 0.05, 0.6);
    b.fillRect(-W, -H * 0.28, W * 2, H * 0.56);
    b.restore();
  } else if (field === 2) {
    b.fillStyle = lin(b, 0, 0, 0, H, 0.04, 0.55);
    b.fillRect(0, H * (0.35 + r() * 0.2), W, H);
    b.fillStyle = rad(b, W * 0.25, H * 0.35, H * 0.3, 0.8, 0.35);
    b.beginPath();
    b.arc(W * (0.2 + r() * 0.2), H * 0.34, H * 0.26, 0, Math.PI * 2);
    b.fill();
  } else {
    const R = H * 1.05;
    b.fillStyle = rad(b, W, H, R, 0.08, 0.6);
    b.beginPath();
    b.arc(W * (0.92 + r() * 0.1), H * 1.02, R, 0, Math.PI * 2);
    b.fill();
  }

  // The initial of the app, set huge in wood type on plate B.
  const initial = (spec.title.match(/[A-Za-z]/)?.[0] ?? "P").toUpperCase();
  b.save();
  b.font = `900 ${Math.round(H * 1.25)}px ${fontFamily}`;
  try {
    (b as Ctx & { fontStretch?: string }).fontStretch = "extra-condensed";
  } catch {
    /* older engines ignore it */
  }
  b.textBaseline = "alphabetic";
  const gx = r() > 0.5 ? W * 0.06 : W * 0.62;
  b.fillStyle = lin(b, 0, 0, 0, H, 0.5, 0.95);
  b.fillText(initial, gx, H * 1.02);
  b.restore();

  // Secondary motif on plate B, primary motif on plate A.
  const side = r() > 0.5;
  const pBox: Box = side
    ? { x: W * 0.08, y: H * 0.14, w: W * 0.46, h: H * 0.66 }
    : { x: W * 0.46, y: H * 0.14, w: W * 0.46, h: H * 0.66 };
  const sBox: Box = side
    ? { x: W * 0.5, y: H * 0.34, w: W * 0.38, h: H * 0.52 }
    : { x: W * 0.12, y: H * 0.3, w: W * 0.38, h: H * 0.52 };
  MOTIFS[spec.motifs[1]](b, sBox, r, false);
  MOTIFS[spec.motifs[0]](a, pBox, r, true);

  // Confetti row on plate A: a registration of little marks, count from the word count.
  const words = Math.max(3, Math.min(14, spec.text.split(" ").length / 3));
  for (let i = 0; i < words; i++) {
    a.fillStyle = k(0.35 + r() * 0.5);
    const x = W * 0.06 + (i / words) * W * 0.88;
    a.beginPath();
    a.arc(x, H * 0.92, 2.5 + r() * 3, 0, Math.PI * 2);
    a.fill();
  }

  return [toTone(A), toTone(B)];
}

/** Screens a tone field into dots on a canvas, at the given angle. */
export function screenPlate(canvas: HTMLCanvasElement, tone: PlateTone, color: string, angleDeg: number, pitch: number, seed: number) {
  const dpr = canvas.width / tone.w;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  const r = rng(seed);
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const { w: W, h: H, data } = tone;
  const cx = W / 2;
  const cy = H / 2;
  const n = Math.ceil(Math.hypot(W, H) / pitch / 2) + 1;
  // riso drums lay ink down unevenly: a slow density drift across the sheet
  const drift = (x: number, y: number) => 0.9 + 0.1 * Math.sin(x / (W * 0.37) + seed) * Math.cos(y / (H * 0.53));
  ctx.beginPath();
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const u = i * pitch;
      const v = j * pitch;
      const x = cx + u * cos - v * sin;
      const y = cy + u * sin + v * cos;
      if (x < -pitch || y < -pitch || x > W + pitch || y > H + pitch) continue;
      const xi = Math.min(W - 1, Math.max(0, Math.round(x)));
      const yi = Math.min(H - 1, Math.max(0, Math.round(y)));
      let t = data[yi * W + xi];
      if (t < 0.04) continue;
      t = Math.pow(t, 0.8) * drift(x, y);
      if (r() < 0.004) continue; // the odd dropout
      const rad = Math.min(pitch * 0.74, pitch * 0.58 * Math.sqrt(t) * (0.94 + r() * 0.12));
      ctx.moveTo((x + rad) * dpr, y * dpr);
      ctx.arc(x * dpr, y * dpr, rad * dpr, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}
