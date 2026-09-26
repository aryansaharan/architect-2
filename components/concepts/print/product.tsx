"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { PERM_LABEL, type Perm } from "./engine";
import { Misreg } from "./primitives";
import { PrintIn } from "./print-in";

const EASE = [0.65, 0, 0.35, 1] as const;

/* ---------------------------------------------------------- stamp thud */

function BigStamp({ show, children, color, style }: { show: boolean; children: ReactNode; color: string; style?: CSSProperties }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pr-bigstamp"
          style={{ color, ...style }}
          initial={reduce ? { opacity: 0, rotate: -8 } : { opacity: 0, scale: 2.4, rotate: -20 }}
          animate={{ opacity: 0.94, scale: 1, rotate: -8 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 900, damping: 32, mass: 1.3 }}
          aria-hidden="true"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The sheet under a stamp gives a little when it lands. */
const thud = { y: [0, 3, -1, 0], transition: { duration: 0.32, delay: 0.08 } };

/* ------------------------------------------------------------- binder */

function MiniBlueprint() {
  const cards = ["Inbox", "Approvals", "Refunds", "Report"];
  return (
    <svg viewBox="0 0 440 190" width="100%" role="img" aria-label="A small Blueprint: four screens, two agents, one table, three connections" style={{ mixBlendMode: "multiply" }}>
      <g fill="none" stroke="var(--blue)" strokeWidth="1.5" strokeDasharray="4 4">
        <path d="M70 70 C 70 120, 150 120, 160 150" />
        <path d="M180 70 C 180 110, 190 120, 190 150" />
        <path d="M290 70 C 290 120, 240 120, 230 150" />
        <path d="M250 165 H 330" />
      </g>
      {cards.map((c, i) => (
        <g key={c} transform={`translate(${14 + i * 106} ${10 + (i % 2) * 6}) rotate(${(i % 2 ? 1 : -1) * 2})`}>
          <rect width="94" height="58" fill="#fffdf8" stroke="var(--ink)" strokeWidth="1.3" />
          <path d="M0 16 H94" stroke="var(--pink)" strokeWidth="1.6" />
          {[26, 36, 46].map((y) => (
            <path key={y} d={`M6 ${y} H88`} stroke="var(--blue)" strokeWidth="0.8" opacity="0.6" />
          ))}
          <text x="6" y="12" fontSize="10" fontWeight="700" fill="var(--ink)" fontFamily="var(--pr-mono)">
            {String(i + 1).padStart(2, "0")} {c}
          </text>
        </g>
      ))}
      <g transform="translate(140 138)">
        <rect width="120" height="42" rx="4" fill="#fffdf8" stroke="var(--ink)" strokeWidth="2.2" />
        <text x="60" y="17" textAnchor="middle" fontSize="10" fontWeight="900" fill="var(--ink)" style={{ fontStretch: "100%", letterSpacing: "0.06em" }}>
          REFUND CLERK
        </text>
        <rect x="16" y="24" width="42" height="12" fill="var(--yellow)" />
        <rect x="62" y="24" width="42" height="12" fill="var(--pink)" />
        <text x="37" y="33" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="var(--ink)" fontFamily="var(--pr-mono)">
          CHANGE
        </text>
        <text x="83" y="33" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="var(--ink)" fontFamily="var(--pr-mono)">
          ASK
        </text>
      </g>
      <g transform="translate(330 146)">
        <ellipse cx="40" cy="6" rx="40" ry="6" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="1.3" />
        <path d="M0 6 V30 A40 6 0 0 0 80 30 V6" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="1.3" />
        <text x="40" y="26" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink)" fontFamily="var(--pr-mono)">
          Refunds
        </text>
      </g>
    </svg>
  );
}

function MiniPhone() {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div
        style={{
          width: 210,
          border: "2px solid var(--ink)",
          borderRadius: 22,
          padding: "14px 12px 16px",
          background: "#fffdf8",
          boxShadow: "8px 8px 0 -1px var(--blue-tint)",
        }}
        role="img"
        aria-label="Preview of the Refunds screen with two requests"
      >
        <div className="pr-label" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Refunds</span>
          <span className="pr-label--soft">test data</span>
        </div>
        {[
          ["Ana P.", "$32.00", false],
          ["Jon K.", "$180.00", true],
        ].map(([n, a, ask]) => (
          <div key={n as string} style={{ marginTop: 10, padding: "8px 9px", border: "1.5px solid var(--ink)", borderRadius: 6, background: ask ? "var(--pink-tint)" : "transparent" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14 }}>
              <span>{n}</span>
              <span className="pr-mono">{a}</span>
            </div>
            <div className="pr-mono" style={{ fontSize: 11.5, marginTop: 3, color: "var(--graphite)" }}>
              {ask ? "Waiting for your OK" : "Paid automatically"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Roster() {
  const agents: { n: string; p: Perm[]; tone: "ink" | "blue" }[] = [
    { n: "Mail Sorter", p: ["read"], tone: "blue" },
    { n: "Refund Clerk", p: ["change", "undo", "ask"], tone: "ink" },
    { n: "Reporter", p: ["read"], tone: "blue" },
  ];
  return (
    <div className="pr-agents" style={{ justifyContent: "center" }}>
      {agents.map((a, i) => (
        <div key={a.n} className="pr-astamp" data-tone={a.tone} style={{ transform: `rotate(${[-3, 2, -1][i]}deg)` }}>
          <span className="pr-astamp__frame" aria-hidden="true" />
          <span className="pr-astamp__name">{a.n}</span>
          <span className="pr-astamp__perms">
            {a.p.map((p) => (
              <span key={p} className="pr-perm" data-perm={p}>
                {PERM_LABEL[p]}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function CodeSheet() {
  return (
    <pre className="pr-code" aria-label="Agent code">
      <span className="c">{"// agents/refund-clerk.ts"}</span>
      {"\n"}
      <span className="k">export const</span> refundClerk = agent({"{"}
      {"\n  "}name: <span className="s">{'"Refund Clerk"'}</span>,{"\n  "}reads: [orders, refunds],
      {"\n  "}changes: [refunds.status],{"\n  "}cantUndo: [stripe.refund],{"\n  "}askFirst: [stripe.refund.over(<span className="k">50</span>)],
      {"\n"}
      {"});"}
    </pre>
  );
}

function ShipSheet() {
  return (
    <div style={{ position: "relative", display: "grid", placeItems: "center", minHeight: 170 }}>
      <div className="pr-runs" aria-label="5 of 5 rehearsals passed" role="img" style={{ position: "absolute", left: 0, top: 6 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} data-s="pass" />
        ))}
      </div>
      <div className="pr-bigstamp" style={{ position: "relative", color: "var(--green)", transform: "rotate(-6deg)" }} aria-hidden="true">
        <b>Ready to ship</b>
        <small>Save point 14 · 5/5 rehearsed</small>
      </div>
    </div>
  );
}

const TABS: { key: string; label: string; tab: string; plain: string; note: string; visual: ReactNode }[] = [
  {
    key: "plan",
    label: "Plan",
    tab: "var(--yellow)",
    plain: "The Blueprint: every screen, agent, table and connection on one sheet.",
    note: "Read it like a menu. Tap anything to see its plain face, its spec or its code.",
    visual: <MiniBlueprint />,
  },
  {
    key: "preview",
    label: "Preview",
    tab: "var(--pink-tint)",
    plain: "Click through the real app before it goes live.",
    note: "It runs on test data. Agents rehearse. Nothing is sent, nothing is charged.",
    visual: <MiniPhone />,
  },
  {
    key: "agents",
    label: "Agents",
    tab: "var(--pink)",
    plain: "Who does what, and what each one may touch.",
    note: "Read, Change or Ask first. Anything that can't be undone always asks.",
    visual: <Roster />,
  },
  {
    key: "code",
    label: "Code",
    tab: "var(--blue-tint)",
    plain: "The same proof, as code. Nothing is hidden.",
    note: "Plain TypeScript you can read, diff and take with you.",
    visual: <CodeSheet />,
  },
  {
    key: "ship",
    label: "Ship",
    tab: "#fffdf8",
    plain: "Five of five rehearsals passed. Save point 14 is ready.",
    note: "Going live takes one more signature. Never a surprise.",
    visual: <ShipSheet />,
  },
];

function Binder() {
  const id = useId();
  const reduce = useReducedMotion();
  const [sel, setSel] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (sel + d + TABS.length) % TABS.length;
    setSel(n);
    refs.current[n]?.focus();
  };
  const t = TABS[sel];
  return (
    <div className="pr-binder">
      <div className="pr-tablist" role="tablist" aria-label="Project" onKeyDown={onKey}>
        {TABS.map((x, i) => (
          <button
            key={x.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`${id}-t-${x.key}`}
            aria-selected={sel === i}
            aria-controls={`${id}-p`}
            tabIndex={sel === i ? 0 : -1}
            className="pr-tab"
            style={{ ["--tab" as string]: x.tab } as CSSProperties}
            onClick={() => setSel(i)}
          >
            <span className="pr-tab__n">{String(i + 1).padStart(2, "0")}</span>
            {x.label}
          </button>
        ))}
      </div>
      <div className="pr-sheet" style={{ display: "grid", ["--sheet" as string]: t.tab } as CSSProperties}>
        <AnimatePresence initial={false}>
          <motion.div
            key={t.key}
            id={`${id}-p`}
            role="tabpanel"
            aria-labelledby={`${id}-t-${t.key}`}
            className="pr-page"
            style={{ gridArea: "1 / 1", background: t.tab, zIndex: 2 }}
            initial={reduce ? { opacity: 0 } : { rotateX: 105, opacity: 0.6 }}
            animate={{ rotateX: 0, opacity: 1 }}
            exit={{ zIndex: 1, opacity: 0, transition: { zIndex: { duration: 0 }, opacity: { delay: reduce ? 0 : 0.5, duration: 0.05 } } }}
            transition={{ duration: reduce ? 0.2 : 0.62, ease: EASE }}
          >
            <div>
              <span className="pr-label">
                {String(sel + 1).padStart(2, "0")} · {t.label}
              </span>
              <p className="pr-page__plain" style={{ marginTop: 10 }}>
                {t.plain}
              </p>
              <p className="pr-page__note">{t.note}</p>
            </div>
            <div>{t.visual}</div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- work order */

function WorkOrder() {
  const [approved, setApproved] = useState(false);
  return (
    <div className="pr-wo">
      <div className="pr-wo__copy pr-wo__copy--2" aria-hidden="true" />
      <div className="pr-wo__copy pr-wo__copy--1" aria-hidden="true" />
      <motion.div className="pr-card" animate={approved ? thud : { y: 0 }}>
        <div className="pr-card__head">
          <span className="pr-label">Work order</span>
          <span className="pr-ticket__no">No. 0417 · copy 1 of 3</span>
        </div>
        <div className="pr-card__body">
          <h3 className="pr-h3">Add refund approvals</h3>
          <p className="pr-mono" style={{ marginTop: 8, fontSize: 14, color: "var(--graphite)" }}>
            Refund Desk · asked for by Maya at 2:41 PM
          </p>
          <div className="pr-wo__facts">
            <div className="pr-wo__fact">
              <span className="pr-label">Time</span>
              <div className="pr-wo__big">~4 min</div>
              <div className="pr-wo__small">one pass</div>
            </div>
            <div className="pr-wo__fact">
              <span className="pr-label">Credits</span>
              <div className="pr-wo__big">86</div>
              <div className="pr-wo__small">≈ $1.72</div>
            </div>
            <div className="pr-wo__fact">
              <span className="pr-label">Files</span>
              <div className="pr-wo__big">7</div>
              <div className="pr-wo__small">3 new · 4 edited</div>
            </div>
          </div>
          <ul className="pr-wo__ask">
            <li className="pr-label">2 actions ask first</li>
            <li>
              <span>Pay a refund over $50</span>
              <span>Stripe</span>
            </li>
            <li>
              <span>Email the customer</span>
              <span>Gmail</span>
            </li>
          </ul>
          <div className="pr-actions">
            <button type="button" className="pr-btn" onClick={() => setApproved((a) => !a)} aria-pressed={approved}>
              {approved ? "Approved · running" : "Approve"}
            </button>
            <button type="button" className="pr-btn pr-btn--ghost">
              Edit the plan
            </button>
            {approved && (
              <button type="button" className="pr-restore" onClick={() => setApproved(false)}>
                Undo
              </button>
            )}
          </div>
        </div>
        <BigStamp show={approved} color="var(--green)" style={{ left: "24%", top: -26 }}>
          <b>Approved</b>
          <small>26 Sep 2026 · 14:03</small>
        </BigStamp>
      </motion.div>
    </div>
  );
}

/* ---------------------------------------------------------- agent card */

const FACES = ["plain", "spec", "code"] as const;
type Face = (typeof FACES)[number];

function Portrait() {
  const dots = (c: string, s: number, o = 0) => ({
    WebkitMaskImage: `radial-gradient(circle, #000 ${s * 0.36}px, transparent ${s * 0.36 + 0.5}px)`,
    maskImage: `radial-gradient(circle, #000 ${s * 0.36}px, transparent ${s * 0.36 + 0.5}px)`,
    WebkitMaskSize: `${s}px ${s}px`,
    maskSize: `${s}px ${s}px`,
    WebkitMaskPosition: `${o}px ${o}px`,
    maskPosition: `${o}px ${o}px`,
    background: c,
  });
  return (
    <div className="pr-portrait" aria-hidden="true">
      <i style={dots("radial-gradient(circle at 30% 30%, var(--blue) 0 30%, color-mix(in srgb, var(--blue) 40%, transparent) 70%)", 5)} />
      <i
        style={{
          ...dots("radial-gradient(circle at 50% 36%, var(--pink) 0 19%, transparent 20%), radial-gradient(ellipse 46% 36% at 50% 100%, var(--pink) 0 98%, transparent 100%)", 4.2, 1),
          transform: "translate(2px, 1px)",
        }}
      />
    </div>
  );
}

function AgentCard() {
  const id = useId();
  const reduce = useReducedMotion();
  const [face, setFace] = useState<Face>("plain");
  const rows: { what: string; perms: Perm[] }[] = [
    { what: "Look up orders", perms: ["read"] },
    { what: "Mark a request as refunded", perms: ["change"] },
    { what: "Pay refunds under $50", perms: ["change", "undo"] },
    { what: "Pay refunds over $50", perms: ["undo", "ask"] },
  ];
  return (
    <div className="pr-card">
      <div className="pr-card__head">
        <span className="pr-label">Agent · No. 02</span>
        <span className="pr-label pr-label--soft">Refund Desk</span>
      </div>
      <div className="pr-card__body">
        <div className="pr-agent__top">
          <Portrait />
          <div>
            <h3 className="pr-h3">Refund Clerk</h3>
            <p style={{ marginTop: 6, fontSize: 15.5, lineHeight: 1.4, color: "var(--graphite)" }}>Checks the order, then pays the refund. Replies go through the Correspondent.</p>
          </div>
        </div>
        <div className="pr-faces" role="tablist" aria-label="Show this agent as">
          {FACES.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={face === f} aria-controls={`${id}-face`} onClick={() => setFace(f)}>
              {f}
            </button>
          ))}
        </div>
        <div style={{ perspective: 1200, marginTop: 4 }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={face}
              id={`${id}-face`}
              role="tabpanel"
              initial={reduce ? { opacity: 0 } : { rotateY: -80, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { rotateY: 80, opacity: 0 }}
              transition={{ duration: reduce ? 0.12 : 0.26, ease: EASE }}
              style={{ transformOrigin: "left center" }}
            >
              {face === "plain" && (
                <div className="pr-perms">
                  {rows.map((r, i) => (
                    <div key={r.what} className="pr-perms__row">
                      <span>{r.what}</span>
                      <span className="pr-perms__chips">
                        {r.perms.map((p, j) => (
                          <span key={p} className="pr-pchip" data-perm={p} style={{ ["--r" as string]: `${((i + j) % 3) - 1}deg` } as CSSProperties}>
                            {PERM_LABEL[p]}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {face === "spec" && (
                <dl className="pr-spec" style={{ marginTop: 14 }}>
                  <dt>When</dt>
                  <dd>A message is labelled “refund”</dd>
                  <dt>Reads</dt>
                  <dd>Orders (Shopify), Refunds</dd>
                  <dt>Changes</dt>
                  <dd>Refunds.status</dd>
                  <dt>Can’t undo</dt>
                  <dd>Stripe refund</dd>
                  <dt>Asks first</dt>
                  <dd>Any refund over $50</dd>
                  <dt>Rehearsed</dt>
                  <dd>5 of 5 passed · save point 14</dd>
                </dl>
              )}
              {face === "code" && (
                <div style={{ marginTop: 14 }}>
                  <CodeSheet />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- repair slip */

function RepairSlip() {
  const [choice, setChoice] = useState<"ours" | "rule">("ours");
  const [fixed, setFixed] = useState(false);
  const opts = [
    { key: "ours" as const, t: "Ask first above $50", d: "Refunds over $50 wait for your OK. Smaller ones stay automatic.", tag: <span className="pr-free">Our fix · free</span> },
    { key: "rule" as const, t: "Lower the limit to $25", d: "Fewer refunds go out on their own. You will see more requests.", tag: <span className="pr-cost">~12 credits</span> },
  ];
  const onKey = (e: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      setChoice((c) => (c === "ours" ? "rule" : "ours"));
    }
  };
  return (
    <motion.div className="pr-card pr-fix" animate={fixed ? thud : { y: 0 }}>
      <svg className="pr-fix__mark" viewBox="0 0 30 90" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
        <path d="M6 10c14-6 20 8 8 14S4 40 18 44" />
        <path d="M4 62 15 50l11 12" />
        <path d="M15 50v34" />
      </svg>
      <div className="pr-card__head">
        <span className="pr-label">Rehearsal report · run 3 of 5</span>
        <span className="pr-runs" role="img" aria-label={fixed ? "5 of 5 rehearsals passed" : "Run 3 failed"}>
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} data-s={fixed || i < 2 ? "pass" : i === 2 ? "fail" : undefined} />
          ))}
        </span>
      </div>
      <div className="pr-card__body">
        <h3 className="pr-h3">Rehearsal caught a problem</h3>
        <p className="pr-fix__quote">
          A <s>$180 refund went straight out</s> without asking you. The rule says anything over $50 should wait.
        </p>
        <div className="pr-opts" role="radiogroup" aria-label="Choose a fix" onKeyDown={onKey}>
          {opts.map((o) => (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={choice === o.key}
              tabIndex={choice === o.key ? 0 : -1}
              className="pr-opt"
              onClick={() => setChoice(o.key)}
            >
              <span className="pr-opt__radio" aria-hidden="true" />
              <span>
                <span className="pr-opt__t" style={{ display: "block" }}>
                  {o.t}
                </span>
                <span className="pr-opt__d" style={{ display: "block" }}>
                  {o.d}
                </span>
              </span>
              {o.tag}
            </button>
          ))}
        </div>
        <div className="pr-actions">
          <button type="button" className="pr-btn" style={{ ["--plate" as string]: "var(--blue)" } as CSSProperties} onClick={() => setFixed((f) => !f)} aria-pressed={fixed}>
            {fixed ? "Fixed · rehearsed again" : "Apply fix and rehearse"}
          </button>
          <button type="button" className="pr-btn pr-btn--ghost">
            Show me the run
          </button>
        </div>
      </div>
      <BigStamp show={fixed} color="var(--navy)" style={{ left: "40%", top: -24 }}>
        <b>Fixed</b>
        <small>5 / 5 passed · free</small>
      </BigStamp>
    </motion.div>
  );
}

/* ---------------------------------------------------------- save points */

const SAVES = [
  { no: 14, what: "Added refund approvals", when: "Today · 14:03 · Maya" },
  { no: 13, what: "Weekly report moved to Monday", when: "Today · 11:47 · Dev" },
  { no: 12, what: "First proof signed", when: "Yesterday · 16:20 · Maya" },
];

function SavePoints() {
  const reduce = useReducedMotion();
  const [current, setCurrent] = useState(14);
  return (
    <div className="pr-card pr-roll">
      <div className="pr-card__head">
        <span className="pr-label">Save points</span>
        <span className="pr-label pr-label--soft">every signature is kept</span>
      </div>
      <ol className="pr-saves">
        {SAVES.map((s) => {
          const on = current === s.no;
          return (
            <li key={s.no} className="pr-save" data-current={on}>
              <span className="pr-save__no" aria-hidden="true">
                {s.no}
              </span>
              <div>
                <div className="pr-save__what">
                  <span className="sr-only">Save point {s.no}: </span>
                  {s.what}
                </div>
                <div className="pr-save__when">{s.when}</div>
              </div>
              {on ? (
                <motion.span
                  key={`live-${s.no}`}
                  className="pr-datestamp"
                  initial={{ opacity: 0, scale: 2, rotate: -14 }}
                  animate={{ opacity: 1, scale: 1, rotate: -4 }}
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 900, damping: 30 }}
                >
                  Live now
                </motion.span>
              ) : (
                <button type="button" className="pr-restore" onClick={() => setCurrent(s.no)}>
                  Restore
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <p className="pr-fig" style={{ margin: 0, padding: "10px 16px 14px", borderTop: "1px solid var(--ink)" }}>
        Restoring never deletes. Newer save points stay on the roll.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- strip */

export function ProductStrip() {
  const id = useId();
  return (
    <section className="pr-section" id="product" aria-labelledby={`${id}-h`}>
      <div className="pr-wrap">
        <PrintIn inner="pr-sechead">
          <Misreg dots className="pr-secnum pr-knock" a="var(--ink)" b="var(--pink)" label="Section 02">
            02
          </Misreg>
          <h2 id={`${id}-h`} className="pr-sectitle">
            The product, in ink
          </h2>
          <p className="pr-secsub">Real parts of the product, restyled. Everything here works: tabs flip, stamps land, options choose, save points restore.</p>
        </PrintIn>

        <PrintIn>
          <Binder />
        </PrintIn>
        <p className="pr-fig">
          <b>Fig. 2.1</b> The tab bar is a set of index tabs. Each page flips over, it never slides.
        </p>

        <div className="pr-spread">
          <PrintIn className="pr-span-wo">
            <WorkOrder />
            <p className="pr-fig" style={{ marginTop: 34 }}>
              <b>Fig. 2.2</b> A Work Order shows the time, the price and what will ask first, before anything runs. Three carbon copies: owner, engineer, ledger.
            </p>
          </PrintIn>
          <PrintIn className="pr-span-agent" delay={0.12}>
            <AgentCard />
            <p className="pr-fig">
              <b>Fig. 2.3</b> Every object has a plain face, a spec and its code. Permissions are stamped, not buried in settings.
            </p>
          </PrintIn>
          <PrintIn className="pr-span-fix">
            <RepairSlip />
            <p className="pr-fig">
              <b>Fig. 2.4</b> A rehearsal failed, so the slip comes back marked up like a proofreader would. Our fix is free.
            </p>
          </PrintIn>
          <PrintIn className="pr-span-save" delay={0.12}>
            <SavePoints />
            <p className="pr-fig">
              <b>Fig. 2.5</b> Save points are date-stamped on a roll. Restore any of them in one click.
            </p>
          </PrintIn>
        </div>
      </div>
    </section>
  );
}
