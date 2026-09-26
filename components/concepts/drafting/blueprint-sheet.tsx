"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import s from "./drafting.module.css";
import type { Agent, Blueprint, Conn, DataSet, Screen } from "./model";
import { plan, type ConnPos, type Dot, type Frame, type Level, type Route } from "./layout";
import { arc, circle, f, rect, ticks, wireframe } from "./geometry";
import { Plotter } from "./plotter";

const PlotCtx = createContext<Plotter | null>(null);
const SNAP = { type: "spring", stiffness: 380, damping: 28, mass: 0.9 } as const;
const PRIO = { level: 0, dim: 0.5, screen: 1, linkSA: 2, agent: 3, linkAD: 4, data: 5, connHead: 5.4, connLink: 5.5, conn: 6 };
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/** A plotted part. Registers with the plotter on mount, glides (snaps) when the layout moves it. */
function Part({ prio, x = 0, y = 0, speed, children }: { prio: number; x?: number; y?: number; speed?: number; children: ReactNode }) {
  const plotter = useContext(PlotCtx);
  const ref = useRef<SVGGElement>(null);
  const present = useIsPresent();
  useLayoutEffect(() => {
    if (ref.current && plotter) plotter.arm(ref.current, prio);
  }, [plotter, prio]);
  useEffect(() => {
    if (!present) ref.current?.setAttribute("data-gone", "");
  }, [present]);
  return (
    <motion.g
      ref={ref}
      className={s.node}
      data-speed={speed}
      initial={false}
      animate={{ x, y }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      transition={SNAP}
    >
      {children}
    </motion.g>
  );
}

function LevelPart({ lv, index, count, W, portrait }: { lv: Level; index: number; count: number; W: number; portrait: boolean }) {
  const gx = portrait ? 16 : 26;
  const r = portrait ? 5 : 7;
  return (
    <Part prio={PRIO.level} y={lv.y}>
      <path className={s.datum} d={`M${gx + r + 4} 0H${W - 8}`} />
      <path data-pen className={s.ink} d={circle(gx, 0, r, 180)} />
      <path className={s.fill} d={`M${gx} 0H${gx + r}A${r} ${r} 0 0 1 ${gx} ${r}ZM${gx} 0H${gx - r}A${r} ${r} 0 0 1 ${gx} ${-r}Z`} />
      {portrait ? (
        <>
          <text className={cx(s.svgLevel, s.txt)} x={gx} y={-r - 5} textAnchor="middle" style={{ fontSize: 12 }}>
            L{index + 1}
          </text>
          <g transform={`translate(${gx - 3} ${r + 8}) rotate(90)`}>
            <text className={cx(s.svgSub, s.txt)}>{lv.label}</text>
          </g>
        </>
      ) : (
        <>
          <text className={cx(s.svgLevel, s.txt)} x={gx + r + 6} y={-6}>
            L{index + 1}
          </text>
          <text className={cx(s.svgSub, s.txt)} x={gx + r + 6} y={15}>
            {lv.label} · {count}
          </text>
        </>
      )}
    </Part>
  );
}

function DimPart({ x0, x1, y, to, label }: { x0: number; x1: number; y: number; to: number; label: string }) {
  return (
    <Part prio={PRIO.dim}>
      <path className={s.wire} pathLength={1} d={`M${f(x0)} ${y - 5}V${to - 5}M${f(x1)} ${y - 5}V${to - 5}`} />
      <g className={s.dimLine}>
        <path className={s.inkCyan} d={`M${f(x0)} ${y}H${f(x1)}`} />
      </g>
      <path className={s.wire} pathLength={1} d={`M${f(x0 - 4)} ${y + 4}L${f(x0 + 4)} ${y - 4}M${f(x1 - 4)} ${y + 4}L${f(x1 + 4)} ${y - 4}`} />
      <text className={cx(s.svgSub, s.txt)} x={f((x0 + x1) / 2)} y={y - 6} textAnchor="middle">
        {label}
      </text>
    </Part>
  );
}

function ScreenPart({ sc, fr, index, hatch }: { sc: Screen; fr: Frame; index: number; hatch: string }) {
  const wf = useMemo(() => wireframe(sc.kind, fr.w, fr.h), [sc.kind, fr.w, fr.h]);
  return (
    <Part prio={PRIO.screen} x={fr.x} y={fr.y}>
      <path className={s.wire} pathLength={1} d="M-12 0H-4M0 -12V-4" />
      <path data-pen className={s.ink} d={rect(0, 0, fr.w, fr.h)} />
      <path className={s.wire} pathLength={1} d={wf.wire} />
      {wf.hatch.map((h, i) => (
        <rect key={i} className={s.hatch} x={f(h.x)} y={f(h.y)} width={f(Math.max(0, h.w))} height={f(Math.max(0, h.h))} fill={`url(#${hatch})`} />
      ))}
      {wf.accent && <path className={s.wireSignal} pathLength={1} d={wf.accent} />}
      <text className={cx(s.svgName, s.txt)} x={0} y={fr.h + 17}>
        <tspan className={s.svgTag}>S{index + 1} </tspan>
        {sc.name}
      </text>
    </Part>
  );
}

const PERMS: { k: "read" | "change" | "undo"; l: string }[] = [
  { k: "read", l: "R" },
  { k: "change", l: "C" },
  { k: "undo", l: "U" },
];

function AgentPart({ ag, dot, portrait }: { ag: Agent; dot: Dot; portrait: boolean }) {
  const { r } = dot;
  const sp = ag.spin;
  const leg = ((sp + 60) * Math.PI) / 180;
  const g45 = (-45 * Math.PI) / 180;
  const rr = r + 15;
  return (
    <Part prio={PRIO.agent} x={dot.x} y={dot.y}>
      <path className={s.wire} pathLength={1} d={ticks(0, 0, r + 3, r + 5, 30, sp)} />
      <path data-pen className={s.ink} d={circle(0, 0, r, sp)} />
      <path data-pen className={s.inkCyan} d={arc(0, 0, r + 9, sp + 15, sp + 105)} />
      <path
        className={s.wire}
        pathLength={1}
        d={`M${f(r * 0.62 * Math.cos(leg))} ${f(r * 0.62 * Math.sin(leg))}L${f(r * Math.cos(leg))} ${f(r * Math.sin(leg))}M${-r - 15} 0H${-r - 6}M${r + 6} 0H${r + 15}`}
      />
      <text className={cx(s.svgInitial, s.txt)} y={portrait ? 8 : 9} textAnchor="middle" style={portrait ? { fontSize: 22 } : undefined}>
        {ag.name[0]}
      </text>
      <text className={cx(s.svgName, s.txt)} y={r + 17} textAnchor="middle" style={portrait ? { fontSize: 11.5, letterSpacing: "0.04em" } : undefined}>
        {ag.name}
      </text>
      <g className={s.txt}>
        {PERMS.map((p, i) => {
          const on = ag.perms.includes(p.k);
          const x = -21 + i * 15;
          return (
            <g key={p.k} opacity={on ? 1 : 0.35}>
              <rect
                x={x}
                y={r + 23}
                width={12}
                height={11}
                fill={on && p.k !== "undo" ? "var(--cyan)" : "none"}
                stroke="var(--cyan)"
                strokeWidth={0.8}
                strokeDasharray={p.k === "undo" || !on ? "2 1.5" : undefined}
              />
              <text x={x + 6} y={r + 31.5} textAnchor="middle" className={s.svgSub} style={{ fontSize: 8, fontWeight: 700, fill: on && p.k !== "undo" ? "var(--ink)" : "var(--cyan)", letterSpacing: 0 }}>
                {p.l}
              </text>
            </g>
          );
        })}
      </g>
      {ag.gate && (
        <g>
          <circle className={s.ring} r={rr} />
          {portrait ? (
            <g className={s.stampTag}>
              <rect x={f(rr * Math.cos(g45)) - 7} y={f(rr * Math.sin(g45)) - 7} width={14} height={14} transform={`rotate(45 ${f(rr * Math.cos(g45))} ${f(rr * Math.sin(g45))})`} className={s.fillSignal} />
              <text x={f(rr * Math.cos(g45))} y={f(rr * Math.sin(g45)) + 3.5} textAnchor="middle" className={s.svgStamp} style={{ fontSize: 10 }}>
                !
              </text>
            </g>
          ) : (
            <>
              <path className={s.wireSignal} pathLength={1} d={`M${f(rr * Math.cos(g45))} ${f(rr * Math.sin(g45))}L${r + 22} ${-r - 16}H${r + 30}`} />
              <g className={s.stampTag}>
                <rect x={r + 30} y={-r - 25} width={64} height={17} className={s.fillSignal} />
                <text x={r + 62} y={-r - 13.5} textAnchor="middle" className={s.svgStamp}>
                  ASK FIRST
                </text>
              </g>
            </>
          )}
        </g>
      )}
    </Part>
  );
}

function DataPart({ d, fr, hatch, portrait }: { d: DataSet; fr: Frame; hatch: string; portrait: boolean }) {
  const { w, h } = fr;
  const back = `M5 -5H${w + 5}V${h - 5}H${w}M5 -5V0M10 -10H${w + 10}V${h - 10}H${w + 5}M10 -10V-5`;
  const table = `M${w - 12} 0V12H${w}M0 14H${w}M0 25H${w}M0 36H${w}M${f(w * 0.36)} 14V${h}M${f(w * 0.68)} 14V${h}`;
  return (
    <Part prio={PRIO.data} x={fr.x} y={fr.y}>
      <path className={s.wire} pathLength={1} d={back} />
      <path data-pen className={s.ink} d={`M0 0H${w - 12}L${w} 12V${h}H0Z`} />
      <path className={s.wire} pathLength={1} d={table} />
      <rect className={s.hatch} x={1} y={1} width={w - 14} height={12} fill={`url(#${hatch})`} />
      <text className={cx(s.svgName, s.txt)} x={w / 2} y={h + 18} textAnchor="middle">
        {d.name}
      </text>
      <text className={cx(s.svgSub, s.txt)} x={w / 2} y={h + 31} textAnchor="middle">
        {portrait ? `${d.fields} fields` : `Table · ${d.fields} fields`}
      </text>
    </Part>
  );
}

function ConnPart({ c, p, portrait }: { c: Conn; p: ConnPos; portrait: boolean }) {
  const { len } = p;
  const port = portrait ? len : 0;
  return (
    <Part prio={PRIO.conn} x={p.x} y={p.y}>
      <path className={s.wire} pathLength={1} d={`M0 -11V11M${len} -11V11`} />
      <path data-pen className={s.inkThin} d={`M0 0H${len}`} />
      <path className={s.wire} pathLength={1} d={`M-4 4L4 -4M${len - 4} 4L${len + 4} -4`} />
      <circle className={s.fillCyan} cx={port} cy={0} r={2.6} />
      <text className={cx(s.svgTitle, s.txt)} x={len / 2} y={-8} textAnchor="middle">
        {c.name.toUpperCase()}
      </text>
      <text className={cx(s.svgSub, s.txt)} x={len / 2} y={16} textAnchor="middle">
        {c.scope}
      </text>
    </Part>
  );
}

const ARROW = { down: "M-3.2 -7L0 0L3.2 -7Z", right: "M-7 -3.2L0 0L-7 3.2Z", left: "M7 -3.2L0 0L7 3.2Z" };

function RoutePart({ rt, prio }: { rt: Route; prio: number }) {
  return (
    <Part prio={prio} speed={1.7}>
      <motion.path data-pen className={s.inkCyan} initial={false} animate={{ d: rt.d }} transition={SNAP} />
      <motion.circle className={s.fillCyan} r={2.2} initial={false} animate={{ cx: rt.x0, cy: rt.y0 }} transition={SNAP} />
      <motion.path className={s.fillCyan} d={ARROW[rt.dir]} initial={false} animate={{ x: rt.x1, y: rt.y1 }} transition={SNAP} />
    </Part>
  );
}

function NorthArrow({ x, y, k = 1 }: { x: number; y: number; k?: number }) {
  return (
    <Part prio={PRIO.level} x={x} y={y}>
      <g transform={`scale(${k})`}>
        <path data-pen className={s.inkThin} d={circle(0, 0, 13, -90)} />
        <path className={s.fill} d="M0 -11L4 6L0 3Z" />
        <path className={s.wire} pathLength={1} d="M0 -11L-4 6L0 3" />
        <text className={cx(s.svgSub, s.txt)} y={-17} textAnchor="middle" style={{ fill: "var(--chalk)", fontWeight: 700 }}>
          N
        </text>
      </g>
    </Part>
  );
}

function EmptyPart({ W, H }: { W: number; H: number }) {
  const w = Math.min(420, W - 80);
  const h = Math.min(220, H - 120);
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  return (
    <Part prio={0}>
      <path data-pen className={s.inkCyan} d={rect(x, y, w, h)} />
      <path className={s.wire} pathLength={1} d={`M${x - 14} ${y}H${x - 4}M${x} ${y - 14}V${y - 4}M${x + w + 4} ${y + h}H${x + w + 14}M${x + w} ${y + h + 4}V${y + h + 14}`} />
      <text className={cx(s.svgTitle, s.txt)} x={W / 2} y={H / 2 - 4} textAnchor="middle">
        SHEET AWAITING BRIEF
      </text>
      <text className={cx(s.svgSub, s.txt)} x={W / 2} y={H / 2 + 18} textAnchor="middle">
        Describe your app. It is drafted here.
      </text>
    </Part>
  );
}

export function BlueprintSheet({ bp, portrait, status }: { bp: Blueprint; portrait: boolean; status: RefObject<HTMLSpanElement | null> }) {
  const [plotter] = useState(() => new Plotter());
  const L = useMemo(() => plan(bp, portrait), [bp, portrait]);
  const svg = useRef<SVGSVGElement>(null);
  const pen = useRef<SVGGElement>(null);
  const gantry = useRef<SVGGElement>(null);
  const readout = useRef<SVGTextElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const hatchA = `dt-ha-${uid}`;
  const hatchB = `dt-hb-${uid}`;

  useEffect(() => {
    if (!svg.current || !pen.current || !gantry.current) return;
    plotter.attach({ svg: svg.current, pen: pen.current, gantry: gantry.current, readout: readout.current, status: status.current, park: { x: 14, y: 14 } });
    return () => plotter.detach();
  }, [plotter, status]);

  const counts = [bp.screens.length, bp.agents.length, bp.data.length];
  const summary = bp.empty
    ? "Empty drawing sheet, waiting for a description."
    : `Blueprint of ${bp.name}: ${bp.screens.map((x) => x.name).join(", ")} screens; ${bp.agents.map((a) => a.name).join(", ")} agents; ${bp.data.map((d) => d.name).join(", ")} data; ${bp.conns.length ? bp.conns.map((c) => c.name).join(", ") : "no"} connections.`;

  const saRoutes = bp.links.filter((l) => l.from.startsWith("screen:") && L.routes[l.id]);
  const adRoutes = bp.links.filter((l) => l.from.startsWith("agent:") && L.routes[l.id]);

  return (
    <PlotCtx.Provider value={plotter}>
      <svg ref={svg} className={s.drawing} viewBox={`0 0 ${L.W} ${L.H}`} role="img" aria-label={summary}>
        <defs>
          <pattern id={hatchA} patternUnits="userSpaceOnUse" width="4.5" height="4.5" patternTransform="rotate(45)">
            <path d="M0 0V4.5" stroke="var(--cyan)" strokeWidth="0.9" opacity="0.75" />
          </pattern>
          <pattern id={hatchB} patternUnits="userSpaceOnUse" width="4.5" height="4.5" patternTransform="rotate(-45)">
            <path d="M0 0V4.5" stroke="var(--cyan)" strokeWidth="0.9" opacity="0.75" />
          </pattern>
        </defs>

        <NorthArrow key={`n-${portrait}`} x={L.W - (portrait ? 20 : 28)} y={portrait ? 24 : 30} k={portrait ? 0.8 : 1} />

        {bp.empty && <EmptyPart key={`empty-${portrait}`} W={L.W} H={L.H} />}

        <AnimatePresence>
          {L.levels.map((lv, i) => (
            <LevelPart key={`${lv.key}-${portrait}`} lv={lv} index={i} count={counts[i]} W={L.W} portrait={portrait} />
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {L.dim && (
            <DimPart
              key={`dim-${bp.screens.length}-${portrait}`}
              x0={L.dim.x0}
              x1={L.dim.x1}
              y={L.dim.y}
              to={portrait ? 50 : 58}
              label={`${bp.screens.length} screen${bp.screens.length === 1 ? "" : "s"} · 1:1`}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {bp.screens.map((sc, i) => (
            <ScreenPart key={sc.id} sc={sc} fr={L.screens[sc.id]} index={i} hatch={sc.hatch > 0 ? hatchA : hatchB} />
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {saRoutes.map((l) => (
            <RoutePart key={l.id} rt={L.routes[l.id]} prio={PRIO.linkSA} />
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {bp.agents.map((a) => (
            <AgentPart key={a.id} ag={a} dot={L.agents[a.id]} portrait={portrait} />
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {adRoutes.map((l) => (
            <RoutePart key={l.id} rt={L.routes[l.id]} prio={PRIO.linkAD} />
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {bp.data.map((d, i) => (
            <DataPart key={d.id} d={d} fr={L.data[d.id]} hatch={i % 2 ? hatchB : hatchA} portrait={portrait} />
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {L.connHead && (
            <Part key={`ch-${portrait}`} prio={PRIO.connHead} x={L.connHead.x} y={L.connHead.y}>
              <text className={cx(s.svgLevel, s.txt)} textAnchor="middle" style={{ fontSize: 13 }}>
                L4 · CONNECTIONS · {bp.conns.length}
              </text>
              <path className={s.wire} pathLength={1} d="M-60 7H60" />
            </Part>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {bp.conns.map((c) =>
            L.routes[c.id] ? <RoutePart key={`r-${c.id}`} rt={L.routes[c.id]} prio={PRIO.connLink} /> : null,
          )}
        </AnimatePresence>

        <AnimatePresence>
          {bp.conns.map((c) => (
            <ConnPart key={c.id} c={c} p={L.conns[c.id]} portrait={portrait} />
          ))}
        </AnimatePresence>

        <g ref={gantry} className={s.gantry} aria-hidden>
          <path d={`M0 0H${L.W}`} />
          <rect x={-2} y={-4} width={4} height={8} />
          <rect x={L.W - 2} y={-4} width={4} height={8} />
        </g>
        <g ref={pen} className={s.pen} aria-hidden>
          <circle className={s.penHalo} r={12} />
          <circle className={s.penRing} r={4.5} />
          <path d="M-10 0H-6M6 0H10M0 -10V-6M0 6V10" stroke="var(--chalk)" strokeWidth={1} />
          <circle className={s.penTip} r={1.4} />
          <text ref={readout} className={s.penXY} x={11} y={-9} />
        </g>
      </svg>
    </PlotCtx.Provider>
  );
}
