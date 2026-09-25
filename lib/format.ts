export function formatCredits(n: number): string {
  if (!n) return "0 cr";
  const v = Math.round(n * 10) / 10;
  return `${Number.isInteger(v) ? v : v.toFixed(1)} cr`;
}

export function formatUsd(n: number): string {
  if (n < 0.01) return "<$0.01";
  return n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`;
}

export function creditsUsd(credits: number): string {
  return formatUsd(credits / 100);
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
}

export function formatValue(v: unknown, type?: string): string {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "money" && typeof v === "number") return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  if (type === "number" && typeof v === "number") return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(2);
  if (type === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v + "T12:00:00Z");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
