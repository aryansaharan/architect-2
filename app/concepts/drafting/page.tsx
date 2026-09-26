import type { Metadata } from "next";
import { DraftingPage } from "@/components/concepts/drafting/drafting-page";

export const metadata: Metadata = {
  title: "Datum · Drafting Table concept",
  description: "Identity concept: describe an agentic app and watch its blueprint get drafted, priced and signed.",
};

export const viewport = { themeColor: "#0f3b70" };

export default function Page() {
  return <DraftingPage />;
}
