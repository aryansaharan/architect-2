import { Martian_Mono, Science_Gothic } from "next/font/google";

/**
 * Display: Science Gothic. A variable revival of the Bank Gothic lineage of
 * engineering lettering, with a width axis from 50 to 200. One family spans
 * condensed telemetry labels to an ultra extended horizon wordmark, and the
 * width itself can be driven live by the signal.
 */
export const display = Science_Gothic({
  subsets: ["latin"],
  axes: ["wdth", "CTRS"],
  variable: "--sig-display",
  display: "swap",
});

/**
 * Telemetry: Martian Mono. Square, instrument-like forms that rhyme with the
 * display face, plus its own width axis so readouts compress without
 * switching family.
 */
export const mono = Martian_Mono({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--sig-mono",
  display: "swap",
});
