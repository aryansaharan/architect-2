import { hash } from "@/lib/sim/hash";

/**
 * A second colour for each app, taken from its own theme: the primary's hue turned a little
 * (which way and how far is fixed by the app's name), so two apps that share a primary still
 * look like two apps. Used for the app mark and the screen badges, never for buttons.
 */
export function accentFor(primary: string, seed: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(primary.trim());
  if (!m) return primary;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  // Never turn into red: in an app, red means something needs attention.
  const turns = [-42, -28, 28, 42].filter((t) => {
    const x = (h + t + 360) % 360;
    return x > 20 && x < 335;
  });
  const turn = turns.length ? turns[hash(seed) % turns.length] : 0;
  const H = (h + turn + 360) % 360;
  const S = Math.min(0.75, Math.max(0.45, sat));
  const L = Math.min(0.48, Math.max(0.36, l));
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((H / 60) % 2) - 1));
  const o = L - c / 2;
  const [R, G, B] = H < 60 ? [c, x, 0] : H < 120 ? [x, c, 0] : H < 180 ? [0, c, x] : H < 240 ? [0, x, c] : H < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[R, G, B].map((v) => Math.round((v + o) * 255).toString(16).padStart(2, "0")).join("")}`;
}
