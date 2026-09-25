import { ImageResponse } from "next/og";

export const alt = "Architect 2.0 — agentic apps you'd trust in production";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0b0c0f", color: "#ecedef", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="44" height="44" viewBox="0 0 24 24">
            <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" fill="none" stroke="#f5a524" strokeWidth="1.6" />
            <path d="M12 7 17 12 12 17 7 12Z" fill="#f5a524" />
          </svg>
          <span style={{ fontSize: 34, fontWeight: 600 }}>Architect</span>
          <span style={{ fontSize: 20, color: "#f5a524", border: "1px solid rgba(245,165,36,0.4)", borderRadius: 6, padding: "2px 8px" }}>2.0</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: -2 }}>Agentic apps you&apos;d trust</span>
          <span style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: -2, color: "#f5a524" }}>in production.</span>
        </div>
        <div style={{ display: "flex", gap: 28, fontSize: 24, color: "#9ba1ad" }}>
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
