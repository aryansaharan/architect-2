import { Big_Shoulders_Stencil, Martian_Mono } from "next/font/google";

/**
 * Display: Big Shoulders Stencil. Sheet titles on real drawings were lettered
 * through stencils, so the break in every letter reads as "drawn with a tool",
 * not "typed". Condensed, so long project names still fit a title block.
 */
export const stencil = Big_Shoulders_Stencil({
  subsets: ["latin"],
  variable: "--font-dt-stencil",
  axes: ["opsz"],
  display: "swap",
});

/**
 * Everything else: Martian Mono. A mono is the honest voice for dimensions,
 * prices and code, and its width axis lets one family do both roomy body copy
 * (100) and tight plotter-style annotations (75 to 87.5).
 */
export const mono = Martian_Mono({
  subsets: ["latin"],
  variable: "--font-dt-mono",
  axes: ["wdth"],
  display: "swap",
});
