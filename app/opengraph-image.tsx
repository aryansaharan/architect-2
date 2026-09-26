import { ImageResponse } from "next/og";

export const alt = "Wonderwork: agentic apps you'd trust in production";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "radial-gradient(900px 520px at 18% -10%, rgba(255,116,56,0.35), transparent 60%), radial-gradient(700px 480px at 90% -20%, rgba(176,107,255,0.30), transparent 60%), #09080f", color: "#efedf4", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="44" height="44" viewBox="0 0 24 24">
            <defs>
              <linearGradient id="g" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#ffd27a" />
                <stop offset="0.45" stopColor="#ff7438" />
                <stop offset="0.75" stopColor="#ff4f8b" />
                <stop offset="1" stopColor="#b06bff" />
              </linearGradient>
            </defs>
            <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" fill="none" stroke="url(#g)" strokeWidth="1.6" />
            <path d="M12 7 17 12 12 17 7 12Z" fill="url(#g)" />
          </svg>
          <span style={{ fontSize: 34, fontWeight: 600 }}>Wonderwork</span>
          <span style={{ fontSize: 20, color: "#a19dae", border: "1px solid rgba(255,79,139,0.45)", borderRadius: 6, padding: "2px 10px" }}>Architect 2.0 prototype for Lyzr</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: -2 }}>Agentic apps you&apos;d trust</span>
          <span style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: -2, backgroundImage: "linear-gradient(90deg, #ffd27a, #ff7438 40%, #ff4f8b 70%, #b06bff)", backgroundClip: "text", color: "transparent" }}>in production.</span>
        </div>
        <div style={{ display: "flex", gap: 28, fontSize: 24, color: "#a19dae" }}>
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
