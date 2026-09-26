"use client";
import { useEffect, useRef } from "react";

/**
 * A field of fireflies that learn to flash together.
 *
 * Each light has its own rhythm. They are coupled with the Kuramoto model
 * (the standard model of how real synchronous fireflies fall into step):
 *   dθᵢ/dt = ωᵢ + K·r·sin(ψ − θᵢ)
 * where r·e^{iψ} is the mean phase of the swarm. Below a critical coupling
 * they blink at random; above it they lock into one rhythm. "Harmony" (0..1)
 * drives K, so the page can bring the swarm into sync as a plan comes
 * together: many small agents, one rhythm.
 *
 * Events (window):
 *   ww:harmony  detail: number 0..1   target coupling
 *   ww:gather   detail: { x, y }      client point the lights rush toward
 * Honours prefers-reduced-motion (one still frame), pauses off screen.
 */

type Fly = { x: number; y: number; z: number; heading: number; speed: number; theta: number; omega: number; hue: number; seed: number };

const HUES: [number, number, number][] = [
  [223, 255, 79], // firefly
  [255, 242, 166], // candle
  [141, 255, 158], // glow
  [63, 224, 197], // lagoon
];
const HUE_WEIGHTS = [0.5, 0.26, 0.14, 0.1];
const MEAN_OMEGA = (2 * Math.PI) / 2.4; // one flash every ~2.4 s
const SPREAD = 0.4; // rad/s, half-width of natural frequencies (critical K ≈ 0.5)

function pickHue() {
  let r = Math.random();
  for (let i = 0; i < HUE_WEIGHTS.length; i++) {
    if ((r -= HUE_WEIGHTS[i]) <= 0) return i;
  }
  return 0;
}

function sprite([r, g, b]: [number, number, number]) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(255,255,240,1)`);
  grad.addColorStop(0.08, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.28, `rgba(${r},${g},${b},0.32)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  return c;
}

export function FireflyField({
  className,
  density = 1,
  variant = "field",
  initialHarmony = 0,
}: {
  className?: string;
  density?: number;
  /** "field": drifting ambient swarm. "rise": lights lift off, for celebrations. */
  variant?: "field" | "rise";
  initialHarmony?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sprites = HUES.map(sprite);

    let w = 0;
    let h = 0;
    let flies: Fly[] = [];
    let harmony = initialHarmony;
    let target = initialHarmony;
    let gather: { x: number; y: number; until: number } | null = null;
    const pointer = { x: -9999, y: -9999, active: false };
    let visible = true;
    let raf = 0;
    let last = performance.now();

    const spawn = (fresh: boolean): Fly => ({
      x: Math.random() * w,
      y: variant === "rise" && fresh ? h * (0.55 + Math.random() * 0.5) : Math.random() * h,
      z: 0.45 + Math.random() * 0.8,
      heading: Math.random() * Math.PI * 2,
      speed: 5 + Math.random() * 11,
      theta: Math.random() * Math.PI * 2,
      omega: MEAN_OMEGA + (Math.random() * 2 - 1) * SPREAD,
      hue: pickHue(),
      seed: Math.random() * 1000,
    });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(150, Math.max(36, (w * h) / 8200)) * density);
      if (flies.length === 0) flies = Array.from({ length: n }, () => spawn(true));
      else if (flies.length < n) flies.push(...Array.from({ length: n - flies.length }, () => spawn(false)));
      else flies.length = n;
    };

    const draw = (boost = 1) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const f of flies) {
        const flash = Math.pow(Math.max(0, Math.cos(f.theta)), 6);
        let b = 0.22 + 0.78 * flash;
        if (pointer.active) {
          const d = Math.hypot(f.x - pointer.x, f.y - pointer.y);
          if (d < 170) b = Math.min(1, b + 0.28 * (1 - d / 170));
        }
        b *= boost * (0.35 + 0.65 * Math.min(1, f.z));
        const size = (4.5 + 15 * flash) * f.z;
        ctx.globalAlpha = Math.min(1, b);
        ctx.drawImage(sprites[f.hue], f.x - size, f.y - size, size * 2, size * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      harmony += (target - harmony) * Math.min(1, dt * 1.4);

      // Kuramoto mean field
      let cx = 0;
      let cy = 0;
      for (const f of flies) {
        cx += Math.cos(f.theta);
        cy += Math.sin(f.theta);
      }
      const n = flies.length || 1;
      const r = Math.hypot(cx, cy) / n;
      const psi = Math.atan2(cy, cx);
      const K = 0.12 + harmony * 3.6;
      const tighten = harmony * 0.8;

      const gathering = gather && now < gather.until ? gather : null;
      for (const f of flies) {
        const omega = f.omega + (MEAN_OMEGA - f.omega) * tighten;
        f.theta += (omega + K * r * Math.sin(psi - f.theta)) * dt;
        if (f.theta > Math.PI * 2) f.theta -= Math.PI * 2;

        // wander: smooth steering plus a little noise
        f.heading += (Math.sin(t * 0.35 + f.seed) * 0.6 + (Math.random() - 0.5) * 1.2) * dt;
        let vx = Math.cos(f.heading) * f.speed * f.z;
        let vy = Math.sin(f.heading) * f.speed * f.z * 0.6 + Math.sin(t * 0.8 + f.seed) * 4;
        if (variant === "rise") vy -= 16 * f.z;

        if (pointer.active) {
          const dx = pointer.x - f.x;
          const dy = pointer.y - f.y;
          const d = Math.hypot(dx, dy);
          if (d < 190 && d > 1) {
            const pull = (1 - d / 190) * 26;
            vx += (dx / d) * pull - (dy / d) * pull * 0.6; // drift in, then orbit the lantern
            vy += (dy / d) * pull + (dx / d) * pull * 0.6;
          }
        }
        if (gathering) {
          const dx = gathering.x - f.x;
          const dy = gathering.y - f.y;
          const d = Math.hypot(dx, dy) || 1;
          vx += (dx / d) * Math.min(260, d * 2.2);
          vy += (dy / d) * Math.min(260, d * 2.2);
        }

        f.x += vx * dt;
        f.y += vy * dt;
        const m = 24;
        if (f.x < -m) f.x = w + m;
        if (f.x > w + m) f.x = -m;
        if (f.y < -m) {
          if (variant === "rise") Object.assign(f, spawn(false), { y: h + m * Math.random() });
          else f.y = h + m;
        }
        if (f.y > h + m) f.y = -m;
      }
      draw();
      if (visible) raf = requestAnimationFrame(step);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(step);
    };

    resize();
    if (reduce) {
      for (const f of flies) f.theta = Math.random() < 0.3 ? 0 : Math.PI;
      draw(0.8);
    } else {
      start();
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(0.8);
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && !document.hidden;
      if (visible && !reduce) start();
    });
    io.observe(canvas);
    const onVis = () => {
      visible = !document.hidden;
      if (visible && !reduce) start();
    };
    document.addEventListener("visibilitychange", onVis);

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= rect.width && pointer.y <= rect.height;
    };
    const onLeave = () => {
      pointer.active = false;
    };
    const onHarmony = (e: Event) => {
      const v = Number((e as CustomEvent).detail);
      if (Number.isFinite(v)) target = Math.max(0, Math.min(1, v));
    };
    const onGather = (e: Event) => {
      const d = (e as CustomEvent<{ x: number; y: number }>).detail;
      if (!d) return;
      const rect = canvas.getBoundingClientRect();
      gather = { x: d.x - rect.left, y: d.y - rect.top, until: performance.now() + 1600 };
      target = 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("ww:harmony", onHarmony);
    window.addEventListener("ww:gather", onGather);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("ww:harmony", onHarmony);
      window.removeEventListener("ww:gather", onGather);
    };
  }, [density, variant, initialHarmony]);

  return <canvas ref={ref} aria-hidden className={className ?? "pointer-events-none absolute inset-0 h-full w-full"} />;
}
