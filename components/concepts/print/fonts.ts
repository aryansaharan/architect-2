import { Archivo, Courier_Prime } from "next/font/google";

/** The press: a grotesk with a width axis, from wood-type condensed to stamp-wide. */
export const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--pr-sans", display: "swap" });

/** The typist: whatever a person typed, and every number worth checking. */
export const courierPrime = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--pr-mono", display: "swap" });
