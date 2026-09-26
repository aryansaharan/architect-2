import type { Metadata, Viewport } from "next";
import { display, mono } from "@/components/concepts/signal/fonts";
import { SignalHero } from "@/components/concepts/signal/hero";
import { ProductStrip } from "@/components/concepts/signal/product-strip";
import { Specimen } from "@/components/concepts/signal/specimen";
import s from "@/components/concepts/signal/signal.module.css";

export const metadata: Metadata = {
  title: "Orrery (working name) · Deep Field / Signal concept",
  description: "Describe an agentic app and watch it take shape: a live identity concept where the field reorganises into your app's structure as you type.",
};

export const viewport: Viewport = { themeColor: "#05060a", colorScheme: "dark" };

export default function SignalConceptPage() {
  return (
    <main id="main" className={`${s.root} ${display.variable} ${mono.variable}`}>
      <SignalHero monoFamily={mono.style.fontFamily} displayFamily={display.style.fontFamily} />
      <ProductStrip />
      <Specimen />
      <footer className={s.footer}>
        <span className={s.micro}>
          <span className={s.microHi}>Orrery</span> is a working name, not a final brand · Concept: Deep Field / Signal
        </span>
        <span className={s.micro}>Field rendered in raw WebGL · no libraries · respects reduced motion</span>
      </footer>
    </main>
  );
}
