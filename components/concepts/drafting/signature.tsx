"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import s from "./drafting.module.css";
import { EXAMPLES, diff, draft, fnv, type Blueprint } from "./model";
import { BlueprintSheet } from "./blueprint-sheet";
import { Crops, RegMark } from "./marks";

const revLetter = (n: number) => {
  let out = "";
  let k = n + 1;
  while (k > 0) {
    const m = (k - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    k = Math.floor((k - 1) / 26);
  }
  return out;
};

const CHIPS = [
  { label: "Claims desk", text: EXAMPLES[0] },
  { label: "Yoga bookings", text: EXAMPLES[1] },
  { label: "Tenant concierge", text: EXAMPLES[2] },
  { label: "Sales pipeline", text: EXAMPLES[3] },
];

/** Text that re-plots itself: characters cycle briefly, then settle left to right. */
function Plotted({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (first.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      first.current = false;
      el.textContent = value;
      return;
    }
    const glyphs = "0123456789ABCDEFXYZ+/";
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 460);
      const keep = Math.floor(p * value.length);
      el.textContent = value.slice(0, keep) + value.slice(keep).replace(/[^\s·≈$.,:]/g, () => glyphs[(Math.random() * glyphs.length) | 0]);
      if (p < 1) raf = requestAnimationFrame(step);
      else el.textContent = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span className={className}>
      <span className="sr-only">{value}</span>
      <span ref={ref} aria-hidden />
    </span>
  );
}

interface Rev {
  n: number;
  note: string;
}

/** CAD crosshair: follows a fine pointer over the drawing, snapping to a 10px grid. */
function Crosshair({ host, units }: { host: RefObject<HTMLDivElement | null>; units: number }) {
  const v = useRef<HTMLSpanElement>(null);
  const h = useRef<HTMLSpanElement>(null);
  const tag = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el || !window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      raf = 0;
      if (v.current) v.current.style.transform = `translateX(${x}px)`;
      if (h.current) h.current.style.transform = `translateY(${y}px)`;
      if (tag.current) {
        const k = units / el.clientWidth;
        tag.current.style.transform = `translate(${x + 10}px, ${y + 8}px)`;
        tag.current.textContent = `X ${Math.round(x * k)}  Y ${Math.round(y * k)}`;
      }
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      x = Math.round((e.clientX - r.left) / 10) * 10;
      y = Math.round((e.clientY - r.top) / 10) * 10;
      box.current?.setAttribute("data-on", "");
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const leave = () => box.current?.removeAttribute("data-on");
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, [host, units]);
  return (
    <div ref={box} className={s.cross} aria-hidden>
      <span ref={v} className={s.crossV} />
      <span ref={h} className={s.crossH} />
      <span ref={tag} className={`${s.crossTag} ${s.tiny}`} />
    </div>
  );
}

export function Signature() {
  const [text, setText] = useState(EXAMPLES[0]);
  const [committed, setCommitted] = useState(EXAMPLES[0]);
  const [revs, setRevs] = useState<Rev[]>([{ n: 0, note: "Issued for review" }]);
  const [portrait, setPortrait] = useState<boolean | null>(null);
  const bp = useMemo(() => draft(committed), [committed]);
  const last = useRef<Blueprint | null>(null);
  const pendingSince = useRef<number | null>(null);
  const typer = useRef<number | null>(null);
  const status = useRef<HTMLSpanElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  /* Debounce with a ceiling: redraw on pauses, and at least every 0.8s while typing. */
  useEffect(() => {
    if (text === committed) return;
    const now = performance.now();
    if (pendingSince.current === null) pendingSince.current = now;
    const wait = Math.max(0, Math.min(300, 800 - (now - pendingSince.current)));
    const id = window.setTimeout(() => {
      pendingSince.current = null;
      const prev = last.current ?? draft(committed);
      const next = draft(text);
      last.current = next;
      const note = diff(prev, next);
      if (note) setRevs((r) => [{ n: r[0].n + 1, note }, ...r].slice(0, 8));
      setCommitted(text);
    }, wait);
    return () => window.clearTimeout(id);
  }, [text, committed]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setPortrait(e.contentRect.width < 560));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (typer.current) window.clearInterval(typer.current);
    },
    [],
  );

  const typeOut = (target: string) => {
    if (typer.current) window.clearInterval(typer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(target);
      return;
    }
    let i = 0;
    setText("");
    typer.current = window.setInterval(() => {
      i += 2;
      setText(target.slice(0, i));
      if (i >= target.length && typer.current) {
        window.clearInterval(typer.current);
        typer.current = null;
      }
    }, 32);
  };

  const onType = (v: string) => {
    if (typer.current) {
      window.clearInterval(typer.current);
      typer.current = null;
    }
    setText(v);
  };

  const busy = text !== committed;
  const liveHex = fnv(text.toLowerCase().replace(/\s+/g, " ").trim()).toString(16).toUpperCase().padStart(8, "0");
  const rev = revLetter(revs[0].n);

  return (
    <div className={s.heroGrid}>
      {/* ---------------------------------------------------------------- intro */}
      <div className="relative flex flex-col" style={{ gridArea: "intro" }}>
        <p className={`${s.label} ${s.cyan} ${s.fadeUp} mb-6`} style={{ ["--i" as string]: 0 }}>
          DWG A-000 &nbsp;·&nbsp; Concept &nbsp;·&nbsp; Drafting table
        </p>
        <div className="relative">
          <span className={`${s.claimDim} ${s.fadeUp}`} aria-hidden style={{ ["--i" as string]: 2 }}>
            <span className={s.tiny}>3 lines · stencil 800</span>
          </span>
          <h1 className={`${s.display} ${s.claim}`}>
            <span>
              <span style={{ ["--i" as string]: 0 }}>Apps,</span>
            </span>
            <span>
              <span style={{ ["--i" as string]: 1 }}>drawn to</span>
            </span>
            <span>
              <span style={{ ["--i" as string]: 2 }}>
                <em>scale.</em>
              </span>
            </span>
          </h1>
        </div>
        <p className={`${s.body} ${s.fadeUp} mt-7 max-w-[34rem]`} style={{ ["--i" as string]: 1 }}>
          Describe an agentic app in plain words. Datum drafts the blueprint, prices the work, and waits for your signature before anything runs.
        </p>

        <div className={`${s.brief} ${s.fadeUp} mt-8`} style={{ ["--i" as string]: 2 }}>
          <span className={`${s.leader} hidden lg:block lg:w-12 xl:w-16`} aria-hidden>
            <i key={committed} />
          </span>
          <div className={s.briefHead}>
            <label htmlFor="dt-brief" className={s.label}>
              01 · The brief <span className={`${s.pencil} ${s.briefHint}`}>/ describe your app</span>
            </label>
            <span className={`${s.label} ${s.pencil}`} aria-hidden>
              <i className={s.statusDot} data-busy={busy ? "" : undefined} />
              {busy ? "Drafting" : `Rev ${rev} drawn`}
            </span>
          </div>
          <textarea
            id="dt-brief"
            className={s.briefArea}
            value={text}
            onChange={(e) => onType(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder="An inbox for support tickets that drafts replies and asks before refunds..."
          />
          <div className={s.briefFoot}>
            <span className={`${s.tiny} ${s.pencil} mr-1`}>Try</span>
            {CHIPS.map((c) => (
              <button key={c.label} type="button" className={s.chip} onClick={() => typeOut(c.text)}>
                {c.label}
              </button>
            ))}
            <span className={`${s.tiny} ${s.pencil} ml-auto hidden sm:inline`} aria-hidden>
              Hash {liveHex}
            </span>
          </div>
        </div>

      </div>

      {/* ---------------------------------------------------------------- cta */}
      <div className={`${s.fadeUp} flex flex-wrap items-center gap-x-8 gap-y-4 self-start`} style={{ ["--i" as string]: 3, gridArea: "cta" }}>
        <Link href="/demo" className={s.cta}>
          <Crops />
          Try the demo
          <ArrowUpRight size={18} strokeWidth={1.8} />
        </Link>
        <a href="#parts" className={`${s.ghost} ${s.label}`}>
          See the parts <ArrowDown size={14} strokeWidth={1.6} />
        </a>
      </div>

      {/* ---------------------------------------------------------------- sheet */}
      <div className={`${s.fadeUp} relative self-start`} style={{ ["--i" as string]: 1, gridArea: "sheet" }}>
        <RegMark className={s.reg} style={{ left: -26, top: -26 }} />
        <RegMark className={s.reg} style={{ right: -26, top: -26 }} />
        <RegMark className={`${s.reg} max-sm:hidden`} style={{ left: -26, bottom: -26 }} />
        <RegMark className={`${s.reg} max-sm:hidden`} style={{ right: -26, bottom: -26 }} />
        <div className={s.sheet}>
          <div className={s.sheetHead}>
            <span className={`${s.label} ${s.cyan}`}>
              Plan view · <Plotted value={bp.sheet} />
              <span className="max-sm:hidden"> · drawn by Datum · checked by you</span>
            </span>
            <span ref={status} className={`${s.tiny} ${s.pencil} text-right`} aria-hidden>
              Pen parked
            </span>
          </div>
          <div ref={wrap} className={`${s.drawWrap} relative px-2 pt-3 pb-1 sm:px-4 sm:pt-4`}>
            {portrait === null ? (
              <div className="aspect-[920/520] w-full" />
            ) : (
              <BlueprintSheet bp={bp} portrait={portrait} status={status} />
            )}
            <Crosshair host={wrap} units={portrait ? 440 : 920} />
          </div>
          <TitleBlock bp={bp} revs={revs} rev={rev} />
        </div>
        <p className="sr-only" aria-live="polite">
          {bp.empty
            ? "The sheet is empty."
            : `Drafted ${bp.name}. ${bp.screens.length} screens, ${bp.agents.length} agents, ${bp.data.length} data sets, ${bp.conns.length} connections. About ${bp.minutes} minutes, ${bp.credits} credits, about $${bp.dollars}. ${bp.gates} actions ask first.`}
        </p>
      </div>
    </div>
  );
}

function TitleBlock({ bp, revs, rev }: { bp: Blueprint; revs: Rev[]; rev: string }) {
  const contents = [
    [bp.screens.length, "screens"],
    [bp.agents.length, "agents"],
    [bp.data.length, "data"],
    [bp.conns.length, "links"],
  ] as const;
  return (
    <div className={s.tb}>
      <div className={s.tbWide} style={{ gridColumn: "span 2" }}>
        <div className={`${s.tiny} ${s.cyan} mb-1.5`}>Project</div>
        <Plotted value={bp.empty ? "Untitled" : bp.name} className={s.tbName} />
        <div className={`${s.tiny} ${s.pencil} mt-2`}>
          {bp.code} · hash {bp.hex}
        </div>
      </div>
      <div className={s.askCell}>
        <div className="min-w-0">
          <div className={`${s.tiny} ${s.cyan} mb-2`}>Needs a person</div>
          <AnimatePresence mode="popLayout" initial={false}>
            {bp.gates > 0 ? (
              <motion.div
                key={`g${bp.gates}`}
                className={s.askStamp}
                initial={{ opacity: 0, scale: 1.9, rotate: -16 }}
                animate={{ opacity: 1, scale: 1, rotate: -4 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={{ type: "spring", stiffness: 520, damping: 22 }}
              >
                <b>{bp.gates}</b>
                <span className={s.tiny} style={{ lineHeight: 1.25 }}>
                  action{bp.gates === 1 ? "" : "s"}
                  <br />
                  ask{bp.gates === 1 ? "s" : ""} first
                </span>
              </motion.div>
            ) : (
              <motion.div key="none" className={`${s.tiny} ${s.askNone}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                Nothing waits
                <br />
                for approval
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div>
        <div className={`${s.tiny} ${s.cyan} mb-1.5`}>Contents</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {contents.map(([n, l]) => (
            <div key={l}>
              <Plotted value={String(n)} className={s.tbBig} />
              <div className={`${s.tiny} ${s.pencil}`}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className={`${s.tiny} ${s.cyan} mb-1.5`}>
          Estimate<span className={s.briefHint}> · before it runs</span>
        </div>
        <Plotted value={bp.empty ? "0 min" : `≈ ${bp.minutes} min`} className={s.tbBig} />
        <div className={`${s.tiny} ${s.pencil} mt-1`}>
          <Plotted value={`${bp.credits} cr ≈ $${bp.dollars} · ${bp.files} files`} />
        </div>
      </div>
      <div>
        <div className={`${s.tiny} ${s.cyan} mb-1.5`}>Sheet</div>
        <Plotted value={bp.sheet} className={s.tbBig} />
        <div className={`${s.tiny} ${s.pencil} mt-1`}>
          Rev {rev} · scale 1:1
        </div>
      </div>

      <div className={s.tbWide} style={{ gridColumn: "1 / -1" }}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span className={`${s.tiny} ${s.cyan}`}>Revisions</span>
          {revs.slice(0, 2).map((r, i) => (
              <motion.span
                key={r.n}
                initial={i === 0 && r.n > 0 ? { opacity: 0, x: -10 } : false}
                animate={{ opacity: i === 0 ? 1 : 0.55, x: 0 }}
                transition={{ duration: 0.35 }}
                className={`${s.tiny} inline-flex min-w-0 items-baseline gap-2`}
              >
                <b style={{ color: "var(--chalk)" }}>
                  {revLetter(r.n)}
                </b>
                <span className={`${s.pencil} truncate normal-case`} style={{ maxWidth: "28ch" }}>
                  {r.note}
                </span>
              </motion.span>
            ))}
        </div>
      </div>
      <div className={s.tbWide} style={{ gridColumn: "1 / -1" }}>
        <div className={`${s.legend} ${s.tiny} ${s.pencil}`}>
          <span className={s.cyan}>Legend</span>
          <span>
            <svg width="16" height="11" aria-hidden>
              <rect x="0.5" y="0.5" width="15" height="10" fill="none" stroke="var(--chalk)" />
            </svg>
            Screen
          </span>
          <span>
            <svg width="12" height="12" aria-hidden>
              <circle cx="6" cy="6" r="5.3" fill="none" stroke="var(--chalk)" />
            </svg>
            Agent
          </span>
          <span>
            <svg width="16" height="13" aria-hidden>
              <path d="M3 3.5H15V12M0.5 5.5H12.5V12.5H0.5Z" fill="none" stroke="var(--chalk)" />
            </svg>
            Data
          </span>
          <span>
            <svg width="20" height="10" aria-hidden>
              <path d="M1 1V9M19 1V9M1 5H19M-1 7L3 3M17 7L21 3" fill="none" stroke="var(--chalk)" />
            </svg>
            Connection
          </span>
          <span>R read · C change · U can&apos;t undo</span>
          <span style={{ color: "var(--signal-hi)" }}>
            <svg width="12" height="12" aria-hidden>
              <circle cx="6" cy="6" r="5" fill="none" stroke="var(--signal)" strokeDasharray="2 2" />
            </svg>
            Ask first
          </span>
        </div>
      </div>
    </div>
  );
}
