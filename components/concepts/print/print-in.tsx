"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Prints its children in, top to bottom, the first time they scroll into view.
 * The observer sits on the outer box; the clip sits on the inner one, so the
 * clip never hides the element from its own observer.
 */
export function PrintIn({ children, className, inner, delay = 0 }: { children: ReactNode; className?: string; inner?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.12 }}>
      <motion.div
        className={inner}
        style={{ height: "100%" }}
        variants={{
          hidden: { clipPath: "inset(-6% -6% 100% -6%)" },
          shown: { clipPath: "inset(-6% -6% -6% -6%)", transitionEnd: { clipPath: "none" } },
        }}
        transition={{ duration: reduce ? 0 : 0.9, ease: [0.65, 0, 0.35, 1], delay: reduce ? 0 : delay }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
