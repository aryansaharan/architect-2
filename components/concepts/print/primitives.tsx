import type { CSSProperties, ReactNode } from "react";
import type { ScreenKind } from "./engine";

/** SVG filters: rough rubber-stamp edges with mottled ink. */
export function InkDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <filter id="pr-stamp" x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="warped" />
          <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="1" seed="11" result="speck" />
          <feColorMatrix in="speck" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -7 0 0 0 4.7" result="mask" />
          <feComposite in="warped" in2="mask" operator="in" />
        </filter>
        <filter id="pr-stamp-lite" x="-6%" y="-6%" width="112%" height="112%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="3" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="1.3" xChannelSelector="R" yChannelSelector="G" result="warped" />
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="5" result="speck" />
          <feColorMatrix in="speck" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -12 0 0 0 9.2" result="mask" />
          <feComposite in="warped" in2="mask" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}

/** A printer's colour control strip. */
export function ColorBar() {
  const dots = (c: string, d: number) => ({
    backgroundImage: `radial-gradient(circle, ${c} ${d}px, transparent ${d + 0.4}px)`,
    backgroundSize: "4px 4px",
  });
  const cells: CSSProperties[] = [
    { background: "var(--pink)" },
    dots("var(--pink)", 1.2),
    { background: "var(--blue)" },
    dots("var(--blue)", 1.2),
    { background: "var(--yellow)" },
    dots("var(--yellow)", 1.4),
    { background: "var(--red)" },
    { background: "var(--navy)" },
    { background: "var(--green)" },
    { background: "var(--ink)" },
    dots("var(--ink)", 0.8),
    { background: "var(--paper)" },
  ];
  return (
    <div className="pr-colorbar" aria-hidden="true">
      {[...cells, ...cells, ...cells].map((s, i) => (
        <i key={i} style={s} />
      ))}
    </div>
  );
}

export function RegMark({ size = 22, className = "pr-reg" }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
      <path d="M12 0v24M0 12h24" />
    </svg>
  );
}

export function CropMarks() {
  return (
    <div className="pr-crop" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

/** Two-plate text that drifts out of register on hover and snaps back. */
export function Misreg({
  children,
  a = "var(--blue)",
  b = "var(--pink)",
  dots = false,
  className = "",
  style,
  loose,
  label,
}: {
  children: ReactNode;
  a?: string;
  b?: string;
  dots?: boolean;
  className?: string;
  style?: CSSProperties;
  loose?: boolean;
  label?: string;
}) {
  return (
    <span
      className={`pr-mis ${className}`}
      data-loose={loose ? "true" : undefined}
      style={{ ["--mis-a" as string]: a, ["--mis-b" as string]: b, ["--dot" as string]: b, ...style }}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      <span className={`pr-mis__b${dots ? " is-dots" : ""}`} aria-hidden="true">
        {children}
      </span>
      <span className="pr-mis__a" aria-hidden={label ? true : undefined}>
        {children}
      </span>
    </span>
  );
}

/** A barcode whose bars come from the proof's hash. */
export function Barcode({ seed, className = "pr-barcode" }: { seed: number; className?: string }) {
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  let s = seed;
  for (let i = 0; i < 38 && x < 140; i++) {
    const w = 1 + (s % 3);
    const gap = 1 + ((s >> 2) % 3);
    bars.push({ x, w });
    x += w + gap;
    s = Math.floor(s / 3) + ((s * 7) % 997) + i * 131;
  }
  return (
    <svg className={className} viewBox={`0 0 ${x} 40`} preserveAspectRatio="none" aria-hidden="true">
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y="0" width={b.w} height="40" fill="currentColor" />
      ))}
    </svg>
  );
}

/** Tiny wireframes, drawn in ink on index cards. */
export function Wire({ kind }: { kind: ScreenKind }) {
  const s = "var(--blue-deep)";
  const common = { fill: "none", stroke: s, strokeWidth: 2, strokeLinecap: "round" as const };
  const body: Record<ScreenKind, ReactNode> = {
    list: (
      <>
        {[8, 22, 36, 50].map((y, i) => (
          <g key={y}>
            <circle cx="8" cy={y} r="4" fill={i === 0 ? "var(--pink)" : "none"} stroke={s} strokeWidth="1.6" />
            <path d={`M17 ${y}h${60 - i * 9}`} {...common} />
          </g>
        ))}
      </>
    ),
    approve: (
      <>
        {[10, 34].map((y) => (
          <g key={y}>
            <path d={`M4 ${y}h44`} {...common} />
            <path d={`M4 ${y + 9}h28`} {...common} strokeWidth={1.4} />
            <rect x="60" y={y - 5} width="16" height="16" rx="2" fill="var(--yellow)" stroke={s} strokeWidth="1.6" />
            <rect x="80" y={y - 5} width="16" height="16" rx="2" fill="var(--pink)" stroke={s} strokeWidth="1.6" />
          </g>
        ))}
      </>
    ),
    pay: (
      <>
        <text x="4" y="30" fontSize="28" fontWeight="900" fill={s} style={{ fontStretch: "70%" }}>
          $48.00
        </text>
        <path d="M4 40h60" {...common} strokeWidth={1.4} />
        <rect x="4" y="46" width="52" height="12" rx="2" fill="var(--pink)" stroke={s} strokeWidth="1.6" />
      </>
    ),
    form: (
      <>
        {[6, 24].map((y) => (
          <rect key={y} x="4" y={y} width="92" height="12" rx="2" {...common} strokeWidth={1.6} />
        ))}
        <rect x="4" y="44" width="40" height="13" rx="2" fill="var(--yellow)" stroke={s} strokeWidth="1.6" />
      </>
    ),
    chat: (
      <>
        <rect x="4" y="4" width="54" height="14" rx="7" {...common} strokeWidth={1.6} />
        <rect x="38" y="24" width="58" height="14" rx="7" fill="var(--pink)" stroke={s} strokeWidth="1.6" />
        <rect x="4" y="44" width="40" height="14" rx="7" {...common} strokeWidth={1.6} />
      </>
    ),
    dash: (
      <>
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={6 + i * 18} y={56 - (14 + i * 8)} width="12" height={14 + i * 8} fill={i === 4 ? "var(--pink)" : "none"} stroke={s} strokeWidth="1.6" />
        ))}
        <path d="M4 58h92" {...common} />
      </>
    ),
    report: (
      <>
        <circle cx="18" cy="22" r="14" fill="var(--yellow)" stroke={s} strokeWidth="1.6" />
        <path d="M18 22V8a14 14 0 0 1 13 19z" fill="var(--pink)" stroke={s} strokeWidth="1.6" />
        {[10, 22, 34].map((y) => (
          <path key={y} d={`M42 ${y}h${50 - y / 2}`} {...common} />
        ))}
        <path d="M4 50h88M4 58h60" {...common} strokeWidth={1.4} />
      </>
    ),
    cal: (
      <>
        {Array.from({ length: 12 }).map((_, i) => (
          <rect key={i} x={4 + (i % 6) * 15.5} y={8 + Math.floor(i / 6) * 22} width="12" height="17" rx="1.5" fill={i === 8 ? "var(--pink)" : i === 3 ? "var(--yellow)" : "none"} stroke={s} strokeWidth="1.4" />
        ))}
      </>
    ),
    table: (
      <>
        <rect x="4" y="4" width="92" height="12" fill="var(--yellow)" stroke={s} strokeWidth="1.6" />
        {[26, 38, 50].map((y) => (
          <path key={y} d={`M4 ${y}h92`} {...common} strokeWidth={1.4} />
        ))}
        <path d="M36 4v52M68 4v52" {...common} strokeWidth={1.2} />
      </>
    ),
    home: (
      <>
        <rect x="4" y="4" width="92" height="26" rx="2" fill="var(--pink)" stroke={s} strokeWidth="1.6" />
        <rect x="4" y="36" width="44" height="20" rx="2" {...common} strokeWidth={1.6} />
        <rect x="52" y="36" width="44" height="20" rx="2" {...common} strokeWidth={1.6} />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 100 62" aria-hidden="true" style={{ mixBlendMode: "multiply" }}>
      {body[kind]}
    </svg>
  );
}

export function CancelMark({ className = "pr-post__cancel" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 46 30" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      {[6, 13, 20, 27].map((y) => (
        <path key={y} d={`M0 ${y}c5-4 10 4 15 0s10 4 15 0 10 4 16 0`} />
      ))}
    </svg>
  );
}

export function Scissors() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="3.5" cy="3.5" r="2.5" />
      <circle cx="3.5" cy="10.5" r="2.5" />
      <path d="M5.5 5 17 12M5.5 9 17 2" />
    </svg>
  );
}

/** The pressman's sign-off: "OK to print". */
export function Seal({ className = "pr-seal" }: { className?: string }) {
  const ring = "PROOF · WORKING NAME · PRINTED IN THREE INKS · CONCEPT NO. 01 · ";
  return (
    <svg className={className} viewBox="0 0 220 220" role="img" aria-label="OK to print">
      <defs>
        <path id="pr-seal-ring" d="M110,110 m-84,0 a84,84 0 1,1 168,0 a84,84 0 1,1 -168,0" />
      </defs>
      <g className="pr-seal__spin">
        <text fontFamily="var(--pr-mono)" fontWeight="700" fontSize="12.5" letterSpacing="2.2" fill="currentColor">
          <textPath href="#pr-seal-ring" textLength="524">
            {ring}
          </textPath>
        </text>
      </g>
      <circle cx="110" cy="110" r="104" fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="110" cy="110" r="68" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="110" y="131" textAnchor="middle" fontWeight="900" fontSize="54" fill="currentColor" style={{ fontStretch: "70%" }}>
        OK
      </text>
      <text x="110" y="152" textAnchor="middle" fontFamily="var(--pr-mono)" fontWeight="700" fontSize="12" letterSpacing="2.5" fill="currentColor">
        TO PRINT
      </text>
      <text x="110" y="76" textAnchor="middle" fontFamily="var(--pr-mono)" fontWeight="700" fontSize="10" letterSpacing="1.5" fill="currentColor">
        26 · 09 · 2026
      </text>
    </svg>
  );
}
