"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** Live prefers-reduced-motion, safe on the server (assumes motion is fine). */
export function useReducedMotionPref() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/** Eases a displayed number toward its target, like a settling instrument needle. */
export function useAnimatedNumber(target: number, ms = 520) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const current = useRef(target);
  useEffect(() => {
    from.current = current.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const v = from.current + (target - from.current) * e;
      current.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
