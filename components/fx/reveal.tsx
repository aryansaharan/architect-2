"use client";
import { motion, type HTMLMotionProps } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Fades and lifts content into view once, as it scrolls in. */
export function Reveal({ children, delay = 0, y = 18, className, ...rest }: { children: React.ReactNode; delay?: number; y?: number; className?: string } & Omit<HTMLMotionProps<"div">, "children">) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.8, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({ children, className, gap = 0.08 }: { children: React.ReactNode; className?: string; gap?: number }) {
  return (
    <motion.div className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} variants={{ show: { transition: { staggerChildren: gap } } }}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 20, filter: "blur(6px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } } }}
    >
      {children}
    </motion.div>
  );
}
