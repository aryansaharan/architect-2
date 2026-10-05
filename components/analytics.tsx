"use client";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Page views for the studio, cookieless (Vercel Web Analytics). Published apps (/live/*) belong to
 * their owners and are never counted, and project addresses are grouped, so the numbers show how
 * the product is used, not who opened which project.
 */
function shape(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(event.url);
  if (url.pathname.startsWith("/live/") || url.pathname.startsWith("/api/")) return null;
  url.pathname = url.pathname.replace(/^\/p\/[0-9a-f-]{36}/i, "/p/[id]");
  url.search = "";
  return { ...event, url: url.toString() };
}

export function StudioAnalytics() {
  return <Analytics beforeSend={shape} />;
}
