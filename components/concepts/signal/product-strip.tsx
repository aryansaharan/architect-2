"use client";

import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import s from "./signal.module.css";
import { Arrow } from "./glyphs";
import { useReducedMotionPref } from "./hooks";

const TABS = [
  { id: "plan", label: "Plan", note: "The Blueprint: every screen, agent, data store and connection, in plain words." },
  { id: "preview", label: "Preview", note: "The app as your users will see it, running on rehearsal data." },
  { id: "agents", label: "Agents", note: "Who does what, what each one may touch, and when it has to ask you." },
  { id: "code", label: "Code", note: "The same objects as real TypeScript. Edit either side, the other follows." },
  { id: "ship", label: "Ship", note: "Rehearsals passed, save point taken, one click to go live." },
];

function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotionPref();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function ProductStrip() {
  const [tab, setTab] = useState(0);
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = (tab + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
      setTab(next);
      document.getElementById(`sig-tab-${TABS[next].id}`)?.focus();
    }
  };
  return (
    <section id="sig-product" className={s.section} aria-labelledby="sig-product-title">
      <div className={s.sectionHead}>
        <span className={s.sectionIndex} aria-hidden="true">
          02
        </span>
        <h2 id="sig-product-title" className={s.sectionTitle}>
          The product, in this language
        </h2>
        <p className={s.sectionLede}>
          Real surfaces from the builder, restyled. Radium only ever means one of two things: this is live, or this needs you. Everything else is said
          with shape: a hollow ring reads, a solid dot changes, hatching can&apos;t be undone.
        </p>
        <div className={s.ruler} aria-hidden="true" />
      </div>

      <Reveal className={s.workspace}>
        <div className={s.tabbar} role="tablist" aria-label="Project views" onKeyDown={onTabKey}>
          {TABS.map((t, i) => (
            <button
              key={t.id}
              id={`sig-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={tab === i}
              aria-controls="sig-tabpanel"
              tabIndex={tab === i ? 0 : -1}
              className={s.tab}
              onClick={() => setTab(i)}
            >
              <span className={s.tabNum}>{String(i + 1).padStart(2, "0")}</span>
              {t.label}
              {tab === i && <motion.span layoutId="sig-tab-line" className={s.tabLine} transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
            </button>
          ))}
          <span className={`${s.tab} ${s.tabSpacer}`} aria-hidden="true" />
          <span className={s.tabStatus}>
            <span className={s.micro}>Inbox Harbor</span>
            <span className={s.badge}>Saved 14:32</span>
          </span>
        </div>
        <div id="sig-tabpanel" role="tabpanel" aria-labelledby={`sig-tab-${TABS[tab].id}`} className={s.cell} style={{ paddingBlock: 12, borderBottom: "1px solid var(--rule)" }}>
          <span className={s.micro}>
            <span className={s.sigText}>{String(tab + 1).padStart(2, "0")}</span> · {TABS[tab].note}
          </span>
        </div>

        <div className={s.bento}>
          <div className={`${s.cell} ${s.cellWo}`}>
            <WorkOrder />
          </div>
          <div className={`${s.cell} ${s.cellAgent}`}>
            <AgentCard />
          </div>
          <div className={`${s.cell} ${s.cellRepair}`}>
            <RepairAlert />
          </div>
          <div className={`${s.cell} ${s.cellSaves}`}>
            <SavePoints />
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------ work order */

function WorkOrder() {
  const [state, setState] = useState<"draft" | "approved">("draft");
  return (
    <>
      <div className={s.cellHead}>
        <span className={s.micro}>Work order</span>
        <span className={s.badge}>{state === "draft" ? "WO-0427 · Awaiting you" : "WO-0427 · Running"}</span>
      </div>
      <div className={`${s.woCard} ${s.brackets}`}>
        <div className={s.woTop}>
          <h3 className={s.cellTitle}>Build Inbox Harbor</h3>
          <p className={s.cellSub}>4 screens · 3 agents · 3 connections</p>
        </div>
        <div className={s.woRows}>
          <div className={s.woRow}>
            <span>Time</span>
            <span className={s.woVal}>≈ 7 min</span>
            <span className={s.woAside}>build + rehearse</span>
          </div>
          <div className={s.woRow}>
            <span>Credits</span>
            <span className={s.woVal}>1,550</span>
            <span className={s.woAside}>≈ $15.50</span>
          </div>
          <div className={s.woRow}>
            <span>Files</span>
            <span className={s.woVal}>29</span>
            <span className={s.woAside}>29 new · 0 changed</span>
          </div>
        </div>
        <div className={s.woAsk}>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" style={{ marginTop: 3 }}>
            <path d="M6 1 11 10H1Z" fill="#d4ff3f" />
          </svg>
          <strong>2 actions ask first</strong>
          <ul>
            <li>Refunds over $50 through Stripe</li>
            <li>Posting the weekly report to #ops</li>
          </ul>
        </div>
        <div className={`${s.traj} ${state === "approved" ? s.trajRun : ""}`} aria-hidden="true">
          {["Plan", "Build", "Rehearse", "Ship"].map((l) => (
            <div key={l}>
              <span>{l}</span>
            </div>
          ))}
        </div>
        <div className={s.woActions} style={{ marginTop: 14 }}>
          {state === "draft" ? (
            <button type="button" className={s.cta} onClick={() => setState("approved")}>
              Approve <Arrow className={s.ctaArrow} />
            </button>
          ) : (
            <span className={s.approved} role="status">
              <i className={s.lockDot} /> Approved · building
            </span>
          )}
          <button type="button" className={s.ghost} onClick={() => setState("draft")}>
            {state === "draft" ? "Adjust plan" : "Undo"}
          </button>
        </div>
        <p className={s.woFine}>Nothing runs until you approve. You pay for what the plan says, never more.</p>
      </div>
    </>
  );
}

/* ------------------------------------------------------------ agent card */

const FACES = ["Plain", "Spec", "Code"] as const;

function AgentCard() {
  const [face, setFace] = useState<(typeof FACES)[number]>("Plain");
  return (
    <>
      <div className={s.cellHead}>
        <span className={s.micro}>Agent · AG·02</span>
        <span className={s.badge}>
          <i className={s.lockDot} style={{ width: 5, height: 5 }} /> Live
        </span>
      </div>
      <div className={s.agentCard}>
        <div className={s.agentTop}>
          <OrbitIcon />
          <div>
            <h3 className={s.cellTitle}>Refund agent</h3>
            <p className={s.cellSub}>Watches the inbox for refund requests</p>
          </div>
        </div>
        <div className={s.faces} role="tablist" aria-label="Agent faces">
          {FACES.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={face === f} className={s.face} onClick={() => setFace(f)}>
              {f}
            </button>
          ))}
        </div>
        <div className={s.facePanel} role="tabpanel">
          {face === "Plain" && <p className={s.plain}>Refunds anything under $50 on its own. Anything bigger waits for your yes, with the order and the email attached.</p>}
          {face === "Spec" && (
            <pre className={s.code}>
              <b>agent</b> refund-agent{"\n"}
              <b>when</b> email is tagged &quot;refund&quot;{"\n"}
              <b>reads</b> gmail.messages, shop.orders{"\n"}
              <b>changes</b> gmail.drafts{"\n"}
              <b>ask first</b> <i>stripe.refund &gt; $50</i>
            </pre>
          )}
          {face === "Code" && (
            <pre className={s.code}>
              <b>export const</b> refundAgent = agent({"{"}
              {"\n"}  reads: [gmail.messages, shop.orders],{"\n"}  changes: [gmail.drafts],{"\n"}  askFirst: [<i>stripe.refunds.over(50)</i>],{"\n"}
              {"}"});
            </pre>
          )}
        </div>
        <div className={s.perms}>
          <span className={s.micro}>Permissions</span>
          <div className={s.permRow}>
            <span className={`${s.perm} ${s.permRead}`}>
              <i className={s.permGlyph} /> Read
            </span>
            <span>Gmail, Orders</span>
          </div>
          <div className={s.permRow}>
            <span className={`${s.perm} ${s.permChange}`}>
              <i className={s.permGlyph} /> Change
            </span>
            <span>Drafts, refund notes</span>
          </div>
          <div className={s.permRow}>
            <span className={`${s.perm} ${s.permAsk}`}>
              <i className={s.permGlyph} /> Can&apos;t undo · Ask first
            </span>
            <span>Stripe refunds</span>
          </div>
        </div>
        <div className={s.agentFoot}>
          <span className={s.micro}>Rehearsals 5/5 passed</span>
          <button type="button" className={s.linkBtn}>
            Replay last run <Arrow className={s.ctaArrow} />
          </button>
        </div>
      </div>
    </>
  );
}

function OrbitIcon() {
  return (
    <svg className={s.orbitIcon} viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <circle cx="28" cy="28" r="27" stroke="#2e3440" />
      <ellipse cx="28" cy="28" rx="22" ry="9" stroke="#707886" strokeDasharray="1 3" />
      <circle cx="28" cy="28" r="3" fill="#f1f4ea" />
      <g className={s.orbitSpin}>
        <circle cx="0" cy="0" r="3.2" fill="#d4ff3f" />
        <circle cx="0" cy="0" r="7" stroke="#d4ff3f" strokeOpacity="0.6" strokeDasharray="1.5 2" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------ repair */

function RepairAlert() {
  const [pick, setPick] = useState<0 | 1>(0);
  const [done, setDone] = useState(false);
  return (
    <>
      <div className={s.cellHead}>
        <span className={s.micro}>Repair</span>
        <span className={s.badge}>Rehearsal 3 of 5</span>
      </div>
      <div className={s.repair} role="group" aria-label="Repair alert">
        <div className={s.repairBand}>
          <span>{done ? "Fixed · rehearsal passed" : "Rehearsal caught a problem"}</span>
          <small>{done ? "5/5" : "R-03"}</small>
        </div>
        <div className={s.repairBody}>
          <p className={s.plain} style={{ fontSize: 15 }}>
            {done ? "Refunds over $50 now stop and ask you. We ran all five rehearsals again and they pass." : "A $120 refund went through without asking you. The Work Order said it would ask first."}
          </p>
          <div className={s.trace} aria-label="Rehearsal results">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} data-bad={!done && n === 3}>
                {!done && n === 3 ? "FAIL" : `R-0${n}`}
              </div>
            ))}
          </div>
        </div>
        {!done && (
          <>
            <div className={s.fixes} role="radiogroup" aria-label="Fix options">
              <button type="button" role="radio" aria-checked={pick === 0} className={s.fix} onClick={() => setPick(0)}>
                <span className={s.radio} />
                <span className={`${s.fixKicker} ${s.fixKickerSig}`}>Our fix · free</span>
                <p>Add an Ask first step before any Stripe refund over $50.</p>
              </button>
              <button type="button" role="radio" aria-checked={pick === 1} className={s.fix} onClick={() => setPick(1)}>
                <span className={s.radio} />
                <span className={s.fixKicker}>Your way · ≈ 40 credits</span>
                <p>Pause all refunds until I rewrite the rules myself.</p>
              </button>
            </div>
            <div className={s.repairActions}>
              <button type="button" className={s.cta} onClick={() => setDone(true)}>
                Apply fix <Arrow className={s.ctaArrow} />
              </button>
              <button type="button" className={s.linkBtn}>
                Replay the failing run
              </button>
            </div>
          </>
        )}
        {done && (
          <div className={s.repairActions} style={{ paddingTop: 12 }}>
            <button type="button" className={s.ghost} onClick={() => setDone(false)}>
              See the problem again
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ save points */

const SAVES = [
  { n: "07", time: "14:32", title: "Weekly report now posts to Slack", diff: ["+1 agent", "+1 connection"], current: true },
  { n: "06", time: "14:18", title: "Refunds over $50 now ask first", diff: ["+1 approval", "2 files"], current: false },
  { n: "05", time: "13:57", title: "First rehearsal passed", diff: ["5/5 rehearsals", "0 changes"], current: false },
];

function SavePoints() {
  const [current, setCurrent] = useState("07");
  return (
    <>
      <div className={s.cellHead}>
        <span className={s.micro}>Save points</span>
        <span className={s.badge}>Every change can be undone</span>
      </div>
      <ol className={s.saves}>
        {SAVES.map((sv) => {
          const isCur = sv.n === current;
          return (
            <li key={sv.n} className={`${s.save} ${isCur ? s.saveCurrent : ""}`}>
              <span className={s.saveNode} aria-hidden="true" />
              <div>
                <div className={s.saveMeta}>
                  <span className={isCur ? s.sigText : undefined}>SP·{sv.n}</span>
                  <span>Today {sv.time}</span>
                  {isCur && <span>Current</span>}
                </div>
                <p className={s.saveTitle}>{sv.title}</p>
                <div className={s.saveDiff}>
                  {sv.diff.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div className={s.saveActions}>
                  {!isCur && (
                    <button type="button" className={s.linkBtn} onClick={() => setCurrent(sv.n)}>
                      Restore
                    </button>
                  )}
                  <button type="button" className={s.linkBtn}>
                    Replay <Arrow className={s.ctaArrow} />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
