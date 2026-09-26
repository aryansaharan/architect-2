"use client";
import { MotionConfig } from "motion/react";

/** Motion respects the OS "reduce motion" setting everywhere. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 380, damping: 32 }}>
      {children}
    </MotionConfig>
  );
}
