import { ImageResponse } from "next/og";

export const alt = "Prod AI: sketch your app, make it real, change it with notes in the margin, publish it";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LOOP = "M22.9 7.9C19.4 5.2 12.2 5.9 8.9 9.8 5.8 13.5 6.8 20.6 11.1 23.4c4.4 2.9 11.5 1.6 13.9-2.7 2.2-3.9.8-9.1-3.6-11.4-1.9-1-4.4-1.4-6.7-.9";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f7f5f0", color: "#1a1a17", padding: 72, fontFamily: "serif" }}>
        {/* The wordmark: "prod" with its o drawn as a pencil circle around a drop of ink (components/brand/logo.tsx). */}
        <div style={{ display: "flex", alignItems: "flex-end", fontSize: 46, fontWeight: 700, letterSpacing: -1.4, fontFamily: "sans-serif", lineHeight: 1 }}>
          <span>pr</span>
          <svg width="32" height="32" viewBox="5 4 23 23" style={{ marginBottom: 0, marginLeft: 1, marginRight: 1 }}>
            <path d={LOOP} fill="none" stroke="#1f4d3a" strokeWidth="2.9" strokeLinecap="round" />
            <circle cx="16.4" cy="16" r="2.7" fill="#1a1a17" />
          </svg>
          <span>d</span>
          <span style={{ fontSize: 18, letterSpacing: 1.4, color: "#1f4d3a", marginLeft: 10, marginBottom: 26 }}>AI</span>
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
