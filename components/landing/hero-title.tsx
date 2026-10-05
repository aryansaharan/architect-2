import { EntryOnce } from "@/components/motion/entry-once";
import { PencilArrow } from "@/components/landing/sketches";
import motion from "@/components/motion/entry-motion.module.css";

/** A wavy pencil line, a little uneven, the way a hand draws it. Fixed, so server and browser agree. */
const WAVE = (() => {
  const amp = [3.8, 4.5, 3.4, 4.2, 4.7, 3.6, 4.4, 3.3, 4.6, 4, 3.5, 4.4, 3.8, 4.7, 3.6, 4.2, 4.5, 3.4, 4, 4.4, 3.6, 4.6, 3.8, 4.2, 3.4, 4];
  const step = 98 / amp.length;
  let d = "M1 5";
  amp.forEach((a, i) => {
    const x = 1 + step * i;
    d += `Q${(x + step / 2).toFixed(2)} ${(i % 2 ? 5 + a : 5 - a).toFixed(2)} ${(x + step).toFixed(2)} 5`;
  });
  return d;
})();

/**
 * The landing headline, written once: "Sketch your app." is written on like a pen moving, the wavy
 * line under "Sketch" is drawn, then "Get a production app." is inked over its pencil. The words are
 * in the server HTML from the first paint; the motion is CSS only and plays once per session.
 */
export function HeroTitle() {
  return (
    <EntryOnce id="landing-hero">
      <h1 className="text-balance font-pencil text-[46px] sm:text-hero">
        <span className={motion.heroWrite}>
          <span className="relative inline-block">
            Sketch
            <svg aria-hidden viewBox="0 0 100 10" preserveAspectRatio="none" className={`pointer-events-none absolute inset-x-0 -bottom-[0.06em] h-[0.18em] w-full overflow-visible ${motion.heroUnderline}`}>
              <path d={WAVE} fill="none" stroke="var(--brand)" strokeOpacity={0.55} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
          </span>{" "}
          your app.
        </span>
        <br />
        <span className={motion.heroInkLine} data-pencil="Get a production app.">
          <em className={motion.heroInk}>Get a production app.</em>
        </span>
      </h1>
    </EntryOnce>
  );
}

/** The note in the margin beside the writing sheet, written after the headline, its arrow drawn to the sheet. */
export function MarginNote() {
  return (
    <EntryOnce id="landing-hero">
      <p className={`font-pencil text-note leading-tight text-muted-foreground ${motion.marginNote}`}>no forms, no tech words. just write.</p>
      <PencilArrow className={`-ml-6 mt-1 w-28 ${motion.marginArrow}`} />
    </EntryOnce>
  );
}
