"use client";
import type { RefObject } from "react";

/**
 * The quick tour is retired. It explained the old plan canvas, and the Sheet explains itself.
 * This stays as a no-op so the plan map keeps compiling while it still renders <Tour />;
 * the workspace shell drops any ?tour=1 from the address (components/workspace/shell.tsx).
 */
export function Tour(props: { nodes: RefObject<Map<string, HTMLElement>>; scroller: RefObject<HTMLDivElement | null> }): null {
  void props;
  return null;
}
