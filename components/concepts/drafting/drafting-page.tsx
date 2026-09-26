import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import s from "./drafting.module.css";
import { mono, stencil } from "./fonts";
import { Crops, DatumMark, InkFilters, RegMark } from "./marks";
import { Signature } from "./signature";
import { Parts } from "./parts";
import { Specimen } from "./specimen";
import { RevealOnScroll } from "./reveal";

const ZONES = "ABCDEFGHJKLMNPRSTUVW".split("");

/** The drawing border: zone letters down the sides, numbers across, registration marks at the corners. */
function SheetBorder() {
  return (
    <div className={s.frame} aria-hidden>
      <div className={s.zoneH} data-side="t">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i}>{8 - i}</span>
        ))}
      </div>
      <div className={s.zoneH} data-side="b">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i}>{8 - i}</span>
        ))}
      </div>
      <div className={s.zoneV} data-side="l">
        {ZONES.map((z, i) => (
          <span key={z} style={{ top: 22 + i * 320 }}>
            {z}
          </span>
        ))}
      </div>
      <div className={s.zoneV} data-side="r">
        {ZONES.map((z, i) => (
          <span key={z} style={{ top: 22 + i * 320 }}>
            {z}
          </span>
        ))}
      </div>
      <RegMark className={s.reg} style={{ left: 4, top: 4, width: 14, height: 14 }} />
      <RegMark className={s.reg} style={{ right: 4, top: 4, width: 14, height: 14 }} />
      <RegMark className={s.reg} style={{ left: 4, bottom: 4, width: 14, height: 14 }} />
      <RegMark className={s.reg} style={{ right: 4, bottom: 4, width: 14, height: 14 }} />
    </div>
  );
}

function Header() {
  return (
    <header className={s.header}>
      <Link href="/concepts/drafting" className={s.wordmark} aria-label="Datum, working name">
        <DatumMark size={30} />
        <span className="flex flex-col">
          <b>Datum</b>
          <span className={`${s.tiny} ${s.working}`}>Working name</span>
        </span>
      </Link>
      <nav className={`${s.nav} ${s.label}`} aria-label="Sheets">
        <a href="#sheet">
          <i>01</i>The sheet
        </a>
        <a href="#parts">
          <i>02</i>Parts
        </a>
        <a href="#specimen">
          <i>03</i>Specimen
        </a>
      </nav>
      <Link href="/demo" className={`${s.cta} ${s.ctaSm}`}>
        <Crops />
        Try the demo
        <ArrowUpRight size={15} strokeWidth={1.8} />
      </Link>
    </header>
  );
}

const NOTES = [
  { t: "Nothing runs until you sign", b: "Every change arrives as a Work Order: time, credits, files, and which actions will ask first. You approve it, or you don't." },
  { t: "One drawing, three faces", b: "Every screen, agent and table has a plain face, a spec and its code. Owners and engineers mark up the same sheet." },
  { t: "Agents ask first", b: "Each action is set to Read, Change or Ask first. Anything that can't be undone waits for a person." },
  { t: "Rehearse, then replay", b: "Rehearsals run agents against real cases before launch. Replays show exactly what they did, step by step." },
];

export function DraftingPage() {
  return (
      <div className={`${s.root} ${stencil.variable} ${mono.variable}`} data-dt-root>
        <RevealOnScroll />
        <InkFilters />
        <div className={s.paper} aria-hidden />
        <div className={s.grid} aria-hidden />
        <SheetBorder />

        <main id="main" className="relative z-[1] mx-auto max-w-[1480px] px-[24px] pb-16 sm:px-12 lg:px-[76px]">
          <Header />

          <section id="sheet" className={s.hero} aria-label="Draft your app">
            <div className={s.expose} aria-hidden />
            <div className={s.scan} aria-hidden />
            <Signature />
          </section>

          <section aria-labelledby="dt-notes" className="pt-6">
            <div className="mb-5 flex items-end justify-between gap-4">
              <h2 id="dt-notes" className={`${s.label}`} style={{ borderBottom: "1.5px solid var(--chalk)", paddingBottom: 4 }}>
                General notes
              </h2>
              <div className="w-[min(340px,48%)]" aria-label="Price scale: 100 credits equal 1 dollar">
                <div className={s.scaleBar} aria-hidden>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div className={`${s.tiny} ${s.pencil} mt-1.5 flex justify-between`} aria-hidden>
                  <span>0</span>
                  <span>100</span>
                  <span>200</span>
                  <span>300</span>
                  <span>400</span>
                  <span>500 cr</span>
                </div>
                <div className={`${s.tiny} ${s.cyan} mt-1 text-right`}>Price scale · 100 cr = $1</div>
              </div>
            </div>
            <ol className={s.notes} data-reveal>
              {NOTES.map((n, i) => (
                <div key={n.t} role="listitem">
                  <span className={s.noteNo}>{i + 1}</span>
                  <h3 className={s.noteTitle}>{n.t}</h3>
                  <p className={s.body} style={{ fontSize: 12.5 }}>
                    {n.b}
                  </p>
                </div>
              ))}
            </ol>
          </section>

          <Parts />
          <Specimen />

          <footer className="pt-24">
            <div className={s.foot} data-reveal>
              <div className="flex items-center gap-4">
                <DatumMark size={34} />
                <div>
                  <div className={s.display} style={{ fontSize: 40 }}>
                    Datum
                  </div>
                  <div className={`${s.tiny} ${s.pencil} mt-1`}>Working name, not final</div>
                </div>
              </div>
              <div>
                <div className={`${s.tiny} ${s.cyan} mb-1`}>Drawing</div>
                <div className={s.label}>Identity concept · Drafting table</div>
              </div>
              <div>
                <div className={`${s.tiny} ${s.cyan} mb-1`}>Drawn</div>
                <div className={s.label}>26 Sep 2026</div>
              </div>
              <div>
                <div className={`${s.tiny} ${s.cyan} mb-1`}>Checked</div>
                <div className={s.label}>You</div>
              </div>
              <div>
                <div className={`${s.tiny} ${s.cyan} mb-1`}>Sheet</div>
                <div className={s.label}>A-000 · 3 of 3</div>
              </div>
            </div>
            <p className={`${s.tiny} ${s.pencil} mt-4 flex flex-wrap justify-between gap-2`}>
              <span>Do not scale this drawing. Scale the app.</span>
              <span>All prices are estimates shown before anything runs.</span>
            </p>
          </footer>
        </main>
      </div>
  );
}
