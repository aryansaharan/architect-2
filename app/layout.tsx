import type { Metadata, Viewport } from "next";
import { Architects_Daughter, Caveat, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Providers } from "@/components/providers";
import "./globals.css";

// Pencil for thinking (titles, notes, sketches), a clear grotesk for the tool, a mono for code.
const pencil = Caveat({ variable: "--font-pencil", subsets: ["latin"] });
const sketch = Architects_Daughter({ variable: "--font-sketch", subsets: ["latin"], weight: "400" });
const sans = Hanken_Grotesk({ variable: "--font-work", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-code", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Prod AI: agentic apps you'd trust in production", template: "%s · Prod AI" },
  description:
    "Describe an agentic app. Prod AI plans it, prices it, builds it and shows its work, for the people who don't code and the people who do, in the same project.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = { themeColor: "#f7f5f0", colorScheme: "light" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${pencil.variable} ${sketch.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Providers>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </Providers>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
