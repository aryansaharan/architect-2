import type { ReactNode } from "react";
import s from "./drafting.module.css";

export function SectionHead({ n, sheet, title, note, id }: { n: number; sheet: string; title: ReactNode; note: string; id: string }) {
  return (
    <div className={s.secHead} data-reveal>
      <span className={s.marker} aria-hidden>
        <b>{n}</b>
        <span>{sheet}</span>
      </span>
      <h2 id={id} className={`${s.display} ${s.secTitle}`}>
        {title}
      </h2>
      <p className={`${s.tiny} ${s.pencil} ml-auto max-w-[26ch] text-right max-md:hidden`} style={{ lineHeight: 1.6 }}>
        {note}
      </p>
    </div>
  );
}

