"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { Braces, Check, DraftingCompass, Orbit, RotateCcw, ScanEye, Send } from "lucide-react";
import s from "./drafting.module.css";
import { arc, circle, cloud, ticks } from "./geometry";
import { Delta } from "./marks";
import { SectionHead } from "./section-head";

function Detail({ n, name, note }: { n: number; name: string; note: string }) {
  return (
    <div className={s.detail}>
      <span className={s.detailNo} aria-hidden>
        <b>{n}</b>
        <span>A-201</span>
      </span>
      <span className={s.detailName}>{name}</span>
      <span className={`${s.tiny} ${s.pencil} ml-auto text-right`}>{note}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ tab bar */

const TABS = [
  { k: "Plan", icon: DraftingCompass, say: "The Blueprint. Screens, agents, data and connections, drawn to scale. Change it and the price updates.", stat: "3 screens · 4 agents" },
  { k: "Preview", icon: ScanEye, say: "The app running on test data. Point at anything to see which part of the drawing made it.", stat: "Test data · 24 rows" },
  { k: "Agents", icon: Orbit, say: "Who does what. Each agent's permissions, rehearsals and replays, in one place.", stat: "4 on duty · 2 ask first" },
  { k: "Code", icon: Braces, say: "Every file, readable. Each save point is a commit you can compare line by line.", stat: "29 files · TypeScript" },
  { k: "Ship", icon: Send, say: "Preflight, then live. Blocked until every action that can't be undone asks first.", stat: "Preflight 11 of 12" },
];

function TabBar() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (active + d + TABS.length) % TABS.length;
    setActive(next);
    refs.current[next]?.focus();
  };
  const tab = TABS[active];
  return (
    <div>
      <div className={s.part}>
        <div className="flex flex-wrap items-stretch justify-between">
          <div role="tablist" aria-label="Project views" className={`${s.tabs} max-w-full overflow-x-auto`} onKeyDown={onKey} style={{ borderBottom: 0 }}>
            {TABS.map((t, i) => {
              const Icon = t.icon;
              const on = i === active;
              return (
                <button
                  key={t.k}
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  role="tab"
                  id={`dt-tab-${t.k}`}
                  aria-selected={on}
                  aria-controls="dt-tabpanel"
                  tabIndex={on ? 0 : -1}
                  className={s.tab}
                  onClick={() => setActive(i)}
                  style={{ isolation: "isolate" }}
                >
                  {on && <motion.span layoutId="dt-tab-fill" className={s.tabFill} transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
                  <i>0{i + 1}</i>
                  <Icon size={15} strokeWidth={1.4} aria-hidden />
                  {t.k}
                  {on && <motion.span layoutId="dt-tab-dim" className={s.tabDim} aria-hidden transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4 px-5 py-3 max-md:hidden">
            <span className={`${s.tiny} ${s.pencil}`}>Insurance Claims Desk · A-133</span>
            <span className={`${s.tiny}`} style={{ border: "1px solid var(--line-soft)", padding: "4px 8px" }}>
              Save point #16
            </span>
          </div>
        </div>
        <div id="dt-tabpanel" role="tabpanel" aria-labelledby={`dt-tab-${tab.k}`} className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5 pt-7 pb-5" style={{ borderTop: "1px solid var(--line-faint)" }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={tab.k}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.22 }}
              className={`${s.body} max-w-[62ch] flex-1`}
            >
              <span className={s.cyan} style={{ fontWeight: 600 }}>
                {tab.k}.{" "}
              </span>
              {tab.say}
            </motion.p>
          </AnimatePresence>
          <span className={`${s.label} ${s.pencil}`}>{tab.stat}</span>
        </div>
      </div>
      <Detail n={1} name="Tab bar" note="Arrow keys move · scale 1:1" />
    </div>
  );
}

/* --------------------------------------------------------------- work order */

function WorkOrder() {
  const [state, setState] = useState<"idle" | "approved" | "done">("idle");
  return (
    <div className="flex h-full flex-col">
      <motion.div
        className={`${s.part} relative flex-1 overflow-hidden p-5 sm:p-6`}
        animate={state === "approved" ? { x: [0, -4, 3, -1, 0], y: [0, 2, -1, 0, 0] } : { x: 0, y: 0 }}
        transition={{ duration: 0.32, delay: 0.14 }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className={s.display} style={{ fontSize: 30, lineHeight: 1 }}>
            Work order
          </span>
          <span className={`${s.tiny} ${s.pencil}`}>WO-0142</span>
        </div>
        <p className={`${s.body} mt-2 mb-4`}>Add an SLA risk column to the claims inbox</p>

        <div className={s.woRow}>
          <span className={`${s.tiny} ${s.cyan}`}>Time</span>
          <span className={s.woVal}>≈ 4 min</span>
        </div>
        <div className={s.woRow}>
          <span className={`${s.tiny} ${s.cyan}`}>Credits</span>
          <span className={s.woVal}>
            38 cr<small>≈ $0.38</small>
          </span>
        </div>
        <div className={s.woRow}>
          <span className={`${s.tiny} ${s.cyan}`}>Files</span>
          <span>
            <span className={s.woVal}>6 changed</span>
            <span className="block">
              {["inbox.tsx", "claims.ts", "triage.agent.ts", "+3"].map((f) => (
                <span key={f} className={s.fileChip}>
                  {f}
                </span>
              ))}
            </span>
          </span>
        </div>
        <div className={s.woRow}>
          <span className={`${s.tiny} ${s.cyan}`}>Gates</span>
          <span>
            <span className={s.woVal} style={{ color: "var(--signal-hi)" }}>
              2 actions ask first
            </span>
            <span className={`${s.tiny} ${s.pencil} mt-1.5 block`}>Email the customer · Issue payment</span>
          </span>
        </div>

        <div className="mt-2 border-t pt-4" style={{ borderColor: "var(--line-faint)" }}>
          <AnimatePresence mode="wait" initial={false}>
            {state === "idle" ? (
              <motion.div key="idle" exit={{ opacity: 0 }} className="flex flex-wrap items-center justify-between gap-3">
                <span className={`${s.tiny} ${s.pencil}`}>Nothing runs until you approve</span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    className={s.btnLine}
                    onClick={() => {
                      const brief = document.getElementById("dt-brief");
                      brief?.scrollIntoView({ behavior: "smooth", block: "center" });
                      brief?.focus({ preventScroll: true });
                    }}
                  >
                    Revise
                  </button>
                  <button type="button" className={s.btnSignal} onClick={() => setState("approved")}>
                    <Check size={15} strokeWidth={2.4} aria-hidden />
                    Approve
                  </button>
                </span>
              </motion.div>
            ) : (
              <motion.div key="run" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={s.label} aria-live="polite">
                    {state === "done" ? "Done · saved as save point #17" : "Running · 6 files"}
                  </span>
                  <button type="button" className={`${s.restore} inline-flex items-center gap-1.5`} onClick={() => setState("idle")}>
                    <RotateCcw size={11} aria-hidden /> Undo
                  </button>
                </div>
                <div className={s.progress} aria-hidden>
                  <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 2.2, ease: [0.65, 0, 0.35, 1], delay: 0.35 }} onAnimationComplete={() => setState("done")} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {state !== "idle" && (
            <motion.div
              key="stamp"
              className={s.stamp}
              style={{ right: "7%", top: "30%" }}
              initial={{ opacity: 0, scale: 2.6, rotate: -22 }}
              animate={{ opacity: 0.94, scale: 1, rotate: -9 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ duration: 0.22, ease: [0.55, 0, 0.9, 0.45] }}
              aria-hidden
            >
              <span style={{ fontSize: 46, display: "block" }}>Approved</span>
              <span style={{ fontSize: 12, letterSpacing: "0.2em", display: "block", marginTop: 4, fontFamily: "var(--mono)", fontWeight: 700 }}>
                26 SEP 2026 · SIGNED YOU
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <Detail n={2} name="Work order" note="Price before anything runs" />
    </div>
  );
}

/* --------------------------------------------------------------- agent card */

const TOOLS = [
  { name: "Look up claims and policies", perms: ["read"], undo: false, ask: null as boolean | null },
  { name: "Update claim status", perms: ["change"], undo: false, ask: null },
  { name: "Email the customer", perms: ["change"], undo: false, ask: true },
  { name: "Issue payment", perms: ["change"], undo: true, ask: true },
];

function AgentGlyph() {
  const r = 30;
  return (
    <svg viewBox="-50 -50 100 100" width="84" height="84" aria-hidden className="flex-none overflow-visible">
      <motion.path d={ticks(0, 0, r + 3, r + 5.5, 30, 20)} stroke="var(--cyan)" strokeWidth={0.9} fill="none" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.1, delay: 0.5 }} />
      <motion.path d={circle(0, 0, r, 20)} stroke="var(--chalk)" strokeWidth={1.6} fill="none" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1] }} />
      <motion.path d={arc(0, 0, r + 10, 35, 125)} stroke="var(--cyan)" strokeWidth={1.1} fill="none" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.8 }} />
      <circle r={r + 17} fill="none" stroke="var(--signal)" strokeWidth={1.2} strokeDasharray="3 4.5" className={s.ring} style={{ opacity: 1 }} />
      <text y={10} textAnchor="middle" style={{ fontFamily: "var(--stencil)", fontWeight: 800, fontSize: 30, fill: "var(--chalk)" }}>
        S
      </text>
    </svg>
  );
}

function AgentCard() {
  const [face, setFace] = useState<"Plain" | "Spec" | "Code">("Plain");
  const [ask, setAsk] = useState<Record<string, boolean>>({ "Email the customer": true, "Issue payment": true });
  const blocked = !ask["Issue payment"];
  return (
    <div className="flex h-full flex-col">
      <div className={`${s.part} flex-1 p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center gap-4">
          <AgentGlyph />
          <div className="min-w-[150px] flex-1">
            <div className={`${s.tiny} ${s.cyan}`}>Agent · on duty</div>
            <div className={s.display} style={{ fontSize: 36, lineHeight: 1, marginTop: 4 }}>
              Settlement
            </div>
            <div className={`${s.tiny} ${s.pencil} mt-1.5`}>Runs when a claim is approved</div>
          </div>
          <div className={`${s.seg} max-sm:w-full`} role="group" aria-label="Face">
            {(["Plain", "Spec", "Code"] as const).map((f) => (
              <button key={f} type="button" aria-pressed={face === f} onClick={() => setFace(f)} style={{ isolation: "isolate" }} className="max-sm:flex-1">
                {face === f && <motion.span layoutId="dt-face" className={s.segFill} transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 min-h-[128px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={face} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              {face === "Plain" && (
                <p className={s.body} style={{ fontSize: 15, lineHeight: 1.65, color: "var(--chalk)" }}>
                  Pays approved claims up to $2,000, then emails the customer a receipt. It asks you before any payment goes out.
                </p>
              )}
              {face === "Spec" && (
                <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-1.5" style={{ fontSize: 12, fontStretch: "88%" }}>
                  {[
                    ["Trigger", "claim.status = approved"],
                    ["Reads", "claims, policies"],
                    ["Changes", "claims.status"],
                    ["Limit", "$2,000 per claim"],
                    ["Asks first", "issuePayment, emailCustomer"],
                    ["Rehearsals", "12 cases · 11 pass"],
                  ].map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className={`${s.tiny} ${s.cyan} pt-0.5`}>{k}</dt>
                      <dd style={{ color: k === "Asks first" ? "var(--signal-hi)" : undefined }}>{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {face === "Code" && (
                <pre className={s.code}>
                  <span className={s.k}>export const</span> settlement = agent({"{"}
                  {"\n"}  on: <span className={s.s}>&quot;claim.approved&quot;</span>,{"\n"}  reads: [<span className={s.s}>&quot;claims&quot;</span>, <span className={s.s}>&quot;policies&quot;</span>],{"\n"}  changes: [<span className={s.s}>&quot;claims.status&quot;</span>],{"\n"}  tools: {"{"} issuePayment: <span className={s.a}>askFirst</span>(stripe.payout) {"}"},{"\n"}  limit: usd(<span className={s.s}>2000</span>), <span className={s.c}>{"// per claim"}</span>
                  {"\n"}
                  {"}"});
                </pre>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-4 grid grid-cols-3" style={{ borderTop: "1px solid var(--line-faint)", borderBottom: "1px solid var(--line-faint)" }}>
          {[
            ["Rehearsals", "11 / 12", "pass"],
            ["Replays", "38", "this week"],
            ["Last run", "2 min", "ago · $0.04"],
          ].map(([k, v, u], i) => (
            <div key={k} className="px-3 py-3" style={{ borderLeft: i ? "1px solid var(--line-faint)" : undefined, paddingLeft: i ? undefined : 0 }}>
              <div className={`${s.tiny} ${s.cyan}`}>{k}</div>
              <div className={s.woVal} style={{ fontSize: 22, marginTop: 4 }}>
                {v}
              </div>
              <div className={`${s.tiny} ${s.pencil}`}>{u}</div>
            </div>
          ))}
        </div>
        <div className={`${s.tiny} ${s.cyan} mt-5 mb-1`}>Tools and permissions</div>
        {TOOLS.map((t) => (
          <div key={t.name} className={s.toolRow}>
            <span style={{ fontSize: 12.5, fontStretch: "90%" }}>{t.name}</span>
            <span className={`${s.toolChips} flex flex-wrap items-center justify-end gap-1.5`}>
              {t.perms.map((p) => (
                <span key={p} className={s.perm} data-k={p}>
                  {p === "read" ? "Read" : "Change"}
                </span>
              ))}
              {t.undo && (
                <span className={s.perm} data-k="undo">
                  Can&apos;t undo
                </span>
              )}
              {t.ask !== null && (
                <button
                  type="button"
                  className={s.askChip}
                  aria-pressed={ask[t.name]}
                  onClick={() => setAsk((a) => ({ ...a, [t.name]: !a[t.name] }))}
                  aria-label={`Ask first for ${t.name}: ${ask[t.name] ? "on" : "off"}`}
                >
                  {ask[t.name] ? <Check size={11} strokeWidth={3} aria-hidden /> : null}
                  Ask first
                </button>
              )}
            </span>
          </div>
        ))}
        <AnimatePresence initial={false}>
          {blocked && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={`${s.tiny} overflow-hidden`}
              style={{ color: "var(--signal-hi)", lineHeight: 1.6 }}
              role="status"
            >
              <span className="block pt-2">Issue payment can&apos;t be undone and no longer asks first. Preflight will block going live until it does.</span>
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <Detail n={3} name="Agent" note="Plain face · spec · code" />
    </div>
  );
}

/* ------------------------------------------------------------- repair alert */

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function RepairAlert() {
  const [choice, setChoice] = useState<"gate" | "cap">("gate");
  const [fixed, setFixed] = useState(false);
  const [ref, size] = useSize<HTMLDivElement>();
  const seen = useInView(ref, { once: true, amount: 0.35 });
  const options = [
    { k: "gate" as const, title: "Add Ask first to Issue payment", body: "Settlement pauses and asks before any payment. Nothing else changes.", tag: <span className={s.ourFix}>Our fix · free</span> },
    { k: "cap" as const, title: "Let it pay up to $500 without asking", body: "Bigger payments still ask first. The rehearsal runs again after the change.", tag: <span className={s.price}>12 cr ≈ $0.12</span> },
  ];
  const onKey = (e: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      setChoice((c) => (c === "gate" ? "cap" : "gate"));
    }
  };
  return (
    <div className="flex h-full flex-col">
      <div ref={ref} className={`${s.part} relative flex-1 p-5 sm:p-6`}>
        {size && (
          <svg className={s.cloud} viewBox={`-12 -12 ${size.w + 24} ${size.h + 24}`} aria-hidden>
            <motion.path
              d={cloud(size.w, size.h, 22)}
              fill="none"
              stroke="var(--signal)"
              strokeWidth={1.4}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: seen && !fixed ? 1 : 0 }}
              transition={{ duration: fixed ? 0.7 : 1.6, ease: [0.65, 0, 0.35, 1] }}
            />
          </svg>
        )}
        <div className="flex items-start gap-3">
          <AnimatePresence mode="wait" initial={false}>
            {fixed ? (
              <motion.span key="ok" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid h-[27px] w-[30px] flex-none place-items-center" style={{ background: "var(--chalk)", color: "var(--ink)" }}>
                <Check size={16} strokeWidth={3} aria-hidden />
              </motion.span>
            ) : (
              <motion.span key="d" exit={{ opacity: 0 }}>
                <Delta n={3} className={s.delta} />
              </motion.span>
            )}
          </AnimatePresence>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className={s.display} style={{ fontSize: 28, lineHeight: 1 }}>
                {fixed ? "Fixed. Rehearsal passes" : "Rehearsal caught a problem"}
              </span>
              <span className={`${s.tiny} ${s.pencil}`}>Rehearsal 3 of 12</span>
            </div>
            <p className={`${s.body} mt-2`} aria-live="polite">
              {fixed
                ? choice === "gate"
                  ? "Settlement now asks before every payment. Saved as save point #16. No credits used."
                  : "Payments under $500 go straight through. Saved as save point #16. 12 credits used."
                : "Settlement tried to issue a $1,640 payment without asking. Claim CLM-20935, step 4 of 6."}
            </p>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {!fixed && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="pt-5">
                <RedlineMini />
                <div className={`${s.tiny} ${s.cyan} mt-5 mb-2`} id="dt-fix-label">
                  Choose a fix
                </div>
                <div role="radiogroup" aria-labelledby="dt-fix-label" className="flex flex-col gap-2" onKeyDown={onKey}>
                  {options.map((o) => (
                    <button key={o.k} type="button" role="radio" aria-checked={choice === o.k} tabIndex={choice === o.k ? 0 : -1} className={s.option} onClick={() => setChoice(o.k)}>
                      <span className={s.radio} aria-hidden />
                      <span className="min-w-0">
                        <span className="block" style={{ fontSize: 13, fontWeight: 600, fontStretch: "90%" }}>
                          {o.title}
                        </span>
                        <span className={`${s.pencil} mt-1 block`} style={{ fontSize: 11.5, lineHeight: 1.55, fontStretch: "88%" }}>
                          {o.body}
                        </span>
                      </span>
                      {o.tag}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          {fixed ? (
            <button type="button" className={s.btnLine} onClick={() => setFixed(false)}>
              <RotateCcw size={13} aria-hidden /> Replay rehearsal
            </button>
          ) : (
            <>
              <button type="button" className={s.btnLine} style={{ background: "var(--chalk)", color: "var(--ink)" }} onClick={() => setFixed(true)}>
                <Check size={14} strokeWidth={2.6} aria-hidden /> Apply fix
              </button>
              <span className={`${s.tiny} ${s.pencil}`}>Nothing changes until you pick one</span>
            </>
          )}
        </div>
      </div>
      <Detail n={4} name="Repair alert" note="Revision cloud marks the change" />
    </div>
  );
}

/** Tiny redline: the agent reaching Stripe with no gate, marked with an X. */
function RedlineMini() {
  return (
    <svg viewBox="0 0 420 70" className="block h-auto w-full max-w-[460px]" aria-hidden>
      <circle cx="30" cy="35" r="17" fill="none" stroke="var(--chalk)" strokeWidth="1.3" />
      <text x="30" y="41" textAnchor="middle" style={{ fontFamily: "var(--stencil)", fontWeight: 800, fontSize: 17, fill: "var(--chalk)" }}>
        S
      </text>
      <path d="M50 35H340" stroke="var(--cyan)" strokeWidth="1.1" fill="none" />
      <path d="M340 24V46M50 24V46M336 39l8-8M46 39l8-8" stroke="var(--cyan)" strokeWidth="0.9" fill="none" />
      <text x="195" y="27" textAnchor="middle" className={s.svgSub} style={{ fontSize: 10 }}>
        ISSUE PAYMENT · $1,640
      </text>
      <text x="354" y="39" className={s.svgSub} style={{ fontSize: 10, fill: "var(--chalk)" }}>
        STRIPE
      </text>
      <g transform="translate(195 35)">
        <circle r="13" fill="none" stroke="var(--signal)" strokeWidth="1.4" strokeDasharray="3 3" />
        <path d="M-6 -6L6 6M6 -6L-6 6" stroke="var(--signal)" strokeWidth="2" />
      </g>
      <text x="195" y="64" textAnchor="middle" className={s.svgSub} style={{ fontSize: 9.5, fill: "var(--signal-hi)" }}>
        NO GATE ON AN ACTION THAT CAN&apos;T BE UNDONE
      </text>
    </svg>
  );
}

/* -------------------------------------------------------------- save points */

const POINTS = [
  { n: 16, label: "Ask first on Issue payment", fix: true, when: "2 min ago" },
  { n: 15, label: "Added SLA risk column", fix: false, when: "18 min ago" },
  { n: 14, label: "Weekly report to Slack", fix: false, when: "1 h ago" },
  { n: 13, label: "First build from the blueprint", fix: false, when: "Yesterday" },
];

function SavePoints() {
  const [current, setCurrent] = useState(16);
  return (
    <div className="flex h-full flex-col">
      <div className={`${s.part} flex-1 p-5 sm:p-6`}>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <span className={s.display} style={{ fontSize: 28, lineHeight: 1 }}>
            Save points
          </span>
          <span className={`${s.tiny} ${s.pencil}`}>Every change, kept</span>
        </div>
        <table className={s.revTable}>
          <thead>
            <tr className={`${s.tiny} ${s.cyan}`}>
              <th scope="col">Rev</th>
              <th scope="col">Change</th>
              <th scope="col" className="text-right">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {POINTS.map((p) => {
              const on = p.n === current;
              return (
                <tr key={p.n} data-current={on ? "" : undefined}>
                  <td style={{ width: 44 }}>
                    <span className={s.revNo}>{p.n}</span>
                  </td>
                  <td>
                    <span className="block" style={{ fontSize: 12.5, fontStretch: "90%" }}>
                      {p.label}
                    </span>
                    <span className={`${s.tiny} ${s.pencil} mt-1 flex flex-wrap items-center gap-2`}>
                      {p.when}
                      {p.fix && (
                        <span className={s.ourFix} style={{ padding: "1px 5px", fontSize: 8 }}>
                          Our fix
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="text-right" style={{ width: 96 }}>
                    {on ? (
                      <motion.span layoutId="dt-current" className={s.current} transition={{ type: "spring", stiffness: 480, damping: 34 }}>
                        Current
                      </motion.span>
                    ) : (
                      <button type="button" className={s.restore} onClick={() => setCurrent(p.n)}>
                        Restore
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className={`${s.tiny} ${s.pencil} mt-4`} aria-live="polite" style={{ lineHeight: 1.6 }}>
          {current === 16 ? "You are on the latest save point." : `Back at #${current}. Your previous state was kept as a save point.`}
        </p>
        <div className="mt-6 pt-5" style={{ borderTop: "1px dashed var(--line-faint)" }}>
          <div className="flex items-baseline justify-between gap-3">
            <span className={`${s.tiny} ${s.cyan}`}>Compare #15 to #16</span>
            <span className={`${s.tiny} ${s.pencil}`}>2 files · +14 −3</span>
          </div>
          <div className="mt-3 flex items-center gap-2" aria-hidden>
            <span className={s.revNo} style={{ transform: "scale(0.8)" }}>15</span>
            <span className={s.progress} style={{ flex: 1 }}>
              <span />
            </span>
            <span className={s.revNo} style={{ transform: "scale(0.8)" }}>16</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["settlement.agent.ts", "gates.ts"].map((f) => (
              <span key={f} className={s.fileChip} style={{ margin: 0 }}>
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
      <Detail n={5} name="Save point" note="Revision table · restore anytime" />
    </div>
  );
}


export function Parts() {
  return (
    <section id="parts" className={s.section} aria-labelledby="dt-parts">
      <SectionHead n={2} sheet="A-201" id="dt-parts" title="The product, in this language" note="Real parts of the studio, redrawn. Every one of them works: click, toggle, approve." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-14 lg:grid-cols-12">
        <div className="lg:col-span-12" data-reveal>
          <TabBar />
        </div>
        <div className="lg:col-span-5" data-reveal>
          <WorkOrder />
        </div>
        <div className="lg:col-span-7" data-reveal style={{ ["--rd" as string]: "0.1s" }}>
          <AgentCard />
        </div>
        <div className="lg:col-span-7" data-reveal>
          <RepairAlert />
        </div>
        <div className="lg:col-span-5" data-reveal style={{ ["--rd" as string]: "0.1s" }}>
          <SavePoints />
        </div>
      </div>
    </section>
  );
}
