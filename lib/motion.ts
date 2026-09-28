/**
 * Motion, one set for the whole product (docs/DESIGN.md): 150ms for hover, 250ms for menus and
 * panels, 450ms for a page fade, and ink-in (1100ms, in CSS) for a sketch becoming real.
 * Loops run only while a build is running.
 */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const SPRING = { type: "spring", stiffness: 480, damping: 40 } as const;
export const DUR = { hover: 0.15, panel: 0.25, page: 0.45 } as const;
