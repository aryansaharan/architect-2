import { ImageResponse } from "next/og";

export const alt = "Prod AI: sketch your app, make it real, change it with notes in the margin, publish it";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f7f5f0", color: "#1a1a17", padding: 72, fontFamily: "serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="44" height="44" viewBox="0 0 24 24">
            <path d="M7.5 20.4V6.4c0-1.6 1.2-2.8 2.8-2.8H13c2.9 0 5.2 2.2 5.2 5s-2.3 5-5.2 5h-2.2" fill="none" stroke="#1a1a17" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="10.8" cy="13.6" r="1.9" fill="#1f4d3a" />
          </svg>
          <span style={{ fontSize: 36, fontWeight: 600, fontFamily: "sans-serif" }}>Prod AI</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 80, lineHeight: 1.04, letterSpacing: -2 }}>Sketch your app.</span>
          <span style={{ fontSize: 80, lineHeight: 1.04, letterSpacing: -2, color: "#1f4d3a" }}>Get a production app.</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#66635a", fontFamily: "sans-serif" }}>
          <span>Change it with notes in the margin · publish in one click</span>
          <span>prod-ai-studio.vercel.app</span>
        </div>
      </div>
    ),
    size,
  );
}
