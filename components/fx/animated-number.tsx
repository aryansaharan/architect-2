"use client";
import { useEffect, useRef } from "react";
import { animate, useInView } from "motion/react";

/** Counts up to a value when it first becomes visible, and springs between later values. */
export function AnimatedNumber({ value, decimals = 0, className, prefix = "", suffix = "" }: { value: number; decimals?: number; className?: string; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const current = useRef(0);
  useEffect(() => {
    if (!inView || !ref.current) return;
    const el = ref.current;
    const controls = animate(current.current, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        current.current = v;
        el.textContent = `${prefix}${v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [inView, value, decimals, prefix, suffix]);
  return (
    <span ref={ref} className={className}>
      {prefix}
      {value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}
