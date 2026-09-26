"use client";
import { useEffect, useRef } from "react";

/**
 * The landing backdrop: a dot grid that lights up around the cursor, over slow
 * warm aurora light. Pure CSS painting; the only JS is two custom properties.
 */
export function HeroBackdrop() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden [--mx:60%] [--my:20%]">
      <div className="absolute -left-40 -top-56 h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,rgb(245_165_36/0.20),transparent_62%)] blur-2xl [animation:aurora-a_18s_ease-in-out_infinite_alternate]" />
      <div className="absolute -top-40 right-[-10%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgb(255_138_61/0.13),transparent_62%)] blur-2xl [animation:aurora-b_22s_ease-in-out_infinite_alternate]" />
      <div className="absolute left-[30%] top-[40%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgb(180_140_255/0.07),transparent_62%)] blur-3xl [animation:aurora-a_26s_ease-in-out_infinite_alternate-reverse]" />
      <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.055)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(rgb(255_199_107/0.55)_1px,transparent_1.2px)] [background-size:22px_22px] [mask-image:radial-gradient(220px_circle_at_var(--mx)_var(--my),black,transparent)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-canvas" />
    </div>
  );
}
