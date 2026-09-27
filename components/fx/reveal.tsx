"use client";
import { motion, type HTMLMotionProps } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Paper: content fades in once as it scrolls into view, with the smallest lift.
 * No blur and no travel, so nothing floats or smears. (Reduced motion is respected by Providers.)
 */
export function Reveal({ children, delay = 0, y = 6, className, ...rest }: { children: React.ReactNode; delay?: number; y?: number; className?: string } & Omit<HTMLMotionProps<"div">, "children">) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: Math.min(y, 6) }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({ children, className, gap = 0.06 }: { children: React.ReactNode; className?: string; gap?: number }) {
  return (
    <motion.div className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} variants={{ show: { transition: { staggerChildren: Math.min(gap, 0.06) } } }}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } } }}
    >
      {children}
    </motion.div>
  );
}
