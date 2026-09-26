"use client";

import { useEffect } from "react";

/**
 * Marks `[data-reveal]` elements as they enter the viewport. Content is only
 * hidden once this has run (the root gets `data-js`), so nothing is lost
 * without JavaScript, and nothing moves for people who prefer reduced motion.
 */
export function RevealOnScroll() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-dt-root]");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-in", "");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0 },
    );
    items.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9) el.setAttribute("data-in", "");
      else io.observe(el);
    });
    root.setAttribute("data-js", "");
    return () => io.disconnect();
  }, []);
  return null;
}
