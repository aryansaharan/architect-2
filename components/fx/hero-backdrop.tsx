"use client";
import { useEffect, useRef } from "react";
import { FireflyField } from "@/components/fx/firefly-field";

/**
 * The landing backdrop: a night meadow. Moonlit haze, a drafting grid that
 * lights up around the cursor, and a swarm of fireflies that falls into one
 * rhythm as the plan in the hero comes together.
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
      <div className="absolute inset-0 bg-[radial-gradient(1100px_560px_at_72%_-12%,rgb(111_183_255/0.10),transparent_62%),radial-gradient(900px_520px_at_12%_-18%,rgb(63_224_197/0.09),transparent_60%),radial-gradient(1200px_420px_at_50%_118%,rgb(141_255_158/0.07),transparent_65%)]" />
      <div className="solstice-orb -right-[18%] -top-[48%] h-[680px] w-[680px] opacity-[0.16] [animation-duration:48s]" />
      <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.045)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(rgb(223_255_79/0.55)_1px,transparent_1.2px)] [background-size:22px_22px] [mask-image:radial-gradient(200px_circle_at_var(--mx)_var(--my),black,transparent)]" />
      <FireflyField />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-canvas" />
    </div>
  );
}
