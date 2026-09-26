/** FNV-1a: deterministic durations so replays (and SSR) are identical. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function between(seed: string, min: number, max: number): number {
  return min + (hash(seed) % (max - min + 1));
}

export function shortId(seed: string, len = 6): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let h = hash(seed);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[h % alphabet.length];
    h = Math.floor(h / alphabet.length) || hash(seed + i);
  }
  return out;
}
