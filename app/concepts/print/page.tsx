import type { Metadata, Viewport } from "next";
import { archivo, courierPrime } from "@/components/concepts/print/fonts";
import { PrintConcept } from "@/components/concepts/print/print-concept";
import "@/components/concepts/print/print.css";

export const metadata: Metadata = {
  title: "Proof (working name) · Print Studio concept",
  description: "Describe an agentic app and watch the press pull a proof of it: screens, agents, data, connections and a price stub, printed live in two inks.",
};

export const viewport: Viewport = { themeColor: "#f4efe6", colorScheme: "light" };

export default function PrintConceptPage() {
  return <PrintConcept fontClass={`${archivo.variable} ${courierPrime.variable}`} />;
}
