import { ImageResponse } from "next/og";

export const alt = "Prod AI: agentic apps you'd trust in production";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// A few fireflies, placed by hand so the card is identical on every render.
const FLIES: [number, number, number, string][] = [
  [690, 120, 5, "223,255,79"], [812, 204, 3, "255,242,166"], [930, 96, 4, "223,255,79"], [1040, 250, 6, "141,255,158"],
  [1110, 150, 3, "223,255,79"], [760, 330, 4, "63,224,197"], [980, 390, 5, "223,255,79"], [1080, 470, 3, "255,242,166"],
  [880, 520, 4, "223,255,79"], [620, 470, 3, "141,255,158"], [1150, 360, 4, "223,255,79"], [700, 250, 2, "255,242,166"],
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", background: "radial-gradient(900px 520px at 80% -10%, rgba(111,183,255,0.18), transparent 60%), radial-gradient(800px 460px at 10% -20%, rgba(63,224,197,0.14), transparent 60%), radial-gradient(1000px 360px at 50% 120%, rgba(141,255,158,0.12), transparent 65%), #060a09", color: "#edf3ee", padding: 72, fontFamily: "sans-serif" }}>
        {FLIES.map(([x, y, r, c], i) => (
          <div key={i} style={{ position: "absolute", left: x - r * 6, top: y - r * 6, width: r * 12, height: r * 12, borderRadius: 9999, background: `radial-gradient(circle, rgba(255,255,240,1) 0%, rgba(${c},0.9) 12%, rgba(${c},0.25) 34%, rgba(${c},0) 70%)` }} />
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="48" height="48" viewBox="0 0 24 24">
            <defs>
              <linearGradient id="t" x1="7" y1="21" x2="18" y2="4" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#3fe0c5" stopOpacity="0.4" />
                <stop offset="0.5" stopColor="#8dff9e" />
                <stop offset="1" stopColor="#dfff4f" />
              </linearGradient>
            </defs>
            <path d="M7.5 20.4V6.4c0-1.6 1.2-2.8 2.8-2.8H13c2.9 0 5.2 2.2 5.2 5s-2.3 5-5.2 5h-2.2" fill="none" stroke="url(#t)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="10.8" cy="13.6" r="2.6" fill="#dfff4f" opacity="0.45" />
            <circle cx="10.8" cy="13.6" r="1.3" fill="#fffbe0" />
          </svg>
          <span style={{ fontSize: 38, fontWeight: 600 }}>Prod</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#dfff4f", border: "1px solid rgba(223,255,79,0.4)", background: "rgba(223,255,79,0.1)", borderRadius: 6, padding: "1px 7px", marginLeft: -6 }}>AI</span>
          <span style={{ fontSize: 19, color: "#9baaa2", border: "1px solid rgba(223,255,79,0.35)", borderRadius: 6, padding: "3px 10px" }}>Architect 2.0 prototype for Lyzr</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontSize: 78, lineHeight: 1.04, letterSpacing: -2 }}>Agentic apps you&apos;d trust</span>
          <span style={{ fontSize: 78, lineHeight: 1.04, letterSpacing: -2, backgroundImage: "linear-gradient(90deg, #fff2a6, #dfff4f 35%, #8dff9e 65%, #3fe0c5)", backgroundClip: "text", color: "transparent" }}>in production.</span>
        </div>
        <div style={{ display: "flex", gap: 28, fontSize: 24, color: "#9baaa2" }}>
          <span>Plan and price first</span>
          <span>·</span>
          <span>Agents ask before they act</span>
          <span>·</span>
          <span>Any framework</span>
        </div>
      </div>
    ),
    size,
  );
}
