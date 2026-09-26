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
      <div className="solstice-orb -left-[14%] -top-[46%] h-[760px] w-[760px] opacity-[0.34]" />
      <div className="solstice-orb -right-[16%] -top-[40%] h-[600px] w-[600px] opacity-[0.22] [animation-direction:reverse] [animation-duration:38s]" />
      <div className="absolute left-[18%] top-[-30%] h-[520px] w-[64%] rounded-full bg-[radial-gradient(ellipse,rgb(255_79_139/0.10),transparent_65%)] blur-2xl [animation:aurora-a_22s_ease-in-out_infinite_alternate]" />
      <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.055)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(rgb(255_170_120/0.7)_1px,transparent_1.2px)] [background-size:22px_22px] [mask-image:radial-gradient(220px_circle_at_var(--mx)_var(--my),black,transparent)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-canvas" />
    </div>
  );
}
