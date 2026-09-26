"use client";

import { useEffect, useState } from "react";
import { AdmitOne, Hero } from "./hero";
import { ColorBar, InkDefs, Misreg, RegMark, Seal } from "./primitives";
import { ProductStrip } from "./product";
import { Specimen } from "./specimen";

const SECTIONS = [
  { id: "proof", label: "01 Proof", bg: "var(--yellow)" },
  { id: "product", label: "02 Product", bg: "var(--pink)" },
  { id: "specimen", label: "03 Specimen", bg: "var(--blue-tint)" },
];

const TAPE = ["Describe it", "Proof it", "Sign it", "Then it runs", "Nothing runs until you sign", "Plain face", "Spec", "Code"];

function Tape() {
  const run = (k: string) => (
    <span key={k} className="pr-tape__item" aria-hidden="true">
      {TAPE.map((t, i) => (
        <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 26 }}>
          {i % 3 === 1 ? <em>{t}</em> : t}
          <RegMark size={26} />
        </span>
      ))}
    </span>
  );
  return (
    <div className="pr-tape">
      <div className="pr-tape__track">{[run("a"), run("b")]}</div>
    </div>
  );
}

function IndexTabs() {
  const [active, setActive] = useState("proof");
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <nav className="pr-itabs" aria-label="Sections">
      {SECTIONS.map((s) => (
        <a key={s.id} href={`#${s.id}`} className="pr-itab" style={{ background: s.bg }} aria-current={active === s.id ? "true" : undefined}>
          {s.label}
        </a>
      ))}
    </nav>
  );
}

export function PrintConcept({ fontClass }: { fontClass: string }) {
  // The root layout paints the html element dark. Lay our stock under it while we are on screen.
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.backgroundColor;
    html.style.backgroundColor = "#f4efe6";
    return () => {
      html.style.backgroundColor = prev;
    };
  }, []);

  return (
    <div className={`${fontClass} pr-root`}>
      <InkDefs />
      <div className="pr-grain" aria-hidden="true" />
      <header>
        <ColorBar />
        <div className="pr-wrap">
          <div className="pr-top__row">
            <a className="pr-brand" href="#proof" aria-label="Proof, working name. Back to top">
              <RegMark />
              <span className="pr-brand__word">Proof</span>
              <span className="pr-wn">Working name</span>
            </a>
            <p className="pr-slug">Sheet 01 of 03 · three inks on warm stock · pink, blue, yellow</p>
            <nav className="pr-nav" aria-label="Primary">
              <a href="#product">Product</a>
              <a href="#specimen">Specimen</a>
              <a className="pr-chipbtn" href="/demo">
                Try the demo
              </a>
            </nav>
          </div>
        </div>
      </header>
      <IndexTabs />
      <main id="main">
        <Hero />
        <Tape />
        <ProductStrip />
        <Specimen />
      </main>
      <footer className="pr-colophon">
        <div className="pr-wrap">
          <div className="pr-colophon__top">
            <Misreg dots className="pr-colophon__big pr-knock" a="var(--blue)" b="var(--pink)" label="Proof">
              Proof
            </Misreg>
            <Seal />
          </div>
          <div
            style={{
              display: "grid",
              gap: 28,
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              marginTop: 36,
              alignItems: "end",
            }}
          >
            <p className="pr-secsub" style={{ maxWidth: "44ch" }}>
              <strong style={{ color: "var(--ink)" }}>Proof is a working name.</strong> Concept No. 01 for the Architect 2.0 identity. Printed on screen
              in three inks on warm stock, set in Archivo and Courier Prime. A few pixels were misregistered on purpose.
            </p>
            <div className="pr-mono" style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--graphite)" }}>
              Inks: FF48B0 · 0078BF · FFE800
              <br />
              Stock: F4EFE6 · Black: 1D1A17
              <br />
              Screens: 15° · 75° · 0°
            </div>
            <div style={{ justifySelf: "start" }}>
              <AdmitOne />
            </div>
          </div>
        </div>
        <div style={{ marginTop: 40 }}>
          <ColorBar />
        </div>
      </footer>
    </div>
  );
}
