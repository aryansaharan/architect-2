import Link from "next/link";

export const metadata = { title: "Identity concepts", robots: { index: false } };

const CONCEPTS = [
  {
    href: "/concepts/drafting",
    name: "Datum",
    direction: "Drafting Table",
    line: "Every app is a working drawing on cyanotype paper. A pen plotter drafts your idea to scale as you type, and orange appears only where a person must sign.",
    bg: "#0F3B70",
    fg: "#EEF4F8",
    accent: "#FF5B1F",
  },
  {
    href: "/concepts/signal",
    name: "Orrery",
    direction: "Deep Field / Signal",
    line: "An instrument from a far-future observatory. Your idea condenses out of a live particle field into orbiting agents, lit screens and signal lines.",
    bg: "#05060A",
    fg: "#F1F4EA",
    accent: "#D4FF3F",
  },
  {
    href: "/concepts/print",
    name: "Proof",
    direction: "Print Studio",
    line: "A risograph print shop. Your idea is printed as a two-ink work ticket with stamps and a price stub, and nothing runs until you sign the proof.",
    bg: "#F4EFE6",
    fg: "#1D1A17",
    accent: "#FF48B0",
  },
];

export default function ConceptsIndex() {
  return (
    <main id="main" className="relative z-[70] min-h-screen bg-[#0b0b0d] px-6 py-16 text-[#ececef]">
      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8a8a93]">Identity exploration · three directions · working names</p>
        <h1 className="mt-3 text-[40px] font-semibold leading-tight tracking-tight">Pick a direction.</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#a3a3ad]">
          Each concept is a live page. Type your own app idea into the hero and watch the signature visual react. The names are placeholders until one is chosen.
        </p>
        <ul className="mt-10 grid gap-5 md:grid-cols-3">
          {CONCEPTS.map((c) => (
            <li key={c.href}>
              <Link href={c.href} className="group flex h-full flex-col overflow-hidden rounded-2xl ring-1 ring-white/10 transition-transform duration-300 hover:-translate-y-1" style={{ background: c.bg, color: c.fg }}>
                <div className="flex-1 p-6">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] opacity-70">{c.direction}</p>
                  <p className="mt-4 text-[34px] font-bold leading-none tracking-tight">{c.name}</p>
                  <p className="mt-4 text-[13.5px] leading-relaxed opacity-85">{c.line}</p>
                </div>
                <div className="flex items-center justify-between px-6 pb-6">
                  <span className="h-2 w-16 rounded-full" style={{ background: c.accent }} />
                  <span className="font-mono text-[12px] uppercase tracking-[0.12em] transition-transform group-hover:translate-x-1">Open →</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
