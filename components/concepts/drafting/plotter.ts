/**
 * A pen plotter for SVG.
 *
 * Parts register themselves when they mount ("arm"): their outlines are hidden
 * with a dash offset before first paint. The plotter then works through the
 * queue in drawing order, moving a visible pen head along each outline while
 * the dash offset follows it. Secondary linework, hatching and labels are
 * revealed by CSS once a part is flagged `data-plotted`.
 *
 * Only stroke-dashoffset and transforms change per frame, and nothing goes
 * through React state, so it stays at 60fps while you type.
 */

interface Job {
  el: SVGGElement;
  prio: number;
  seq: number;
}

interface Attach {
  svg: SVGSVGElement;
  pen: SVGGElement;
  gantry: SVGGElement;
  readout: SVGTextElement | null;
  status: HTMLElement | null;
  park: { x: number; y: number };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const easePen = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class Plotter {
  private queue: Job[] = [];
  private seq = 0;
  private running = false;
  private dead = false;
  private gen = 0;
  private io: Attach | null = null;
  private pos = { x: 0, y: 0 };
  private done = 0;
  private total = 0;
  private ink = 0;
  private reducedCache: boolean | null = null;

  private get reduced() {
    if (this.reducedCache === null) {
      this.reducedCache = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return this.reducedCache;
  }

  attach(io: Attach) {
    this.io = io;
    this.dead = false;
    this.pos = { ...io.park };
    this.place(io.park.x, io.park.y);
    if (this.queue.length) this.kick();
    else this.status();
  }

  setPark(x: number, y: number) {
    if (!this.io) return;
    this.io.park = { x, y };
    if (!this.running) this.place(x, y);
  }

  detach() {
    this.gen++;
    this.dead = true;
    this.running = false;
    this.io = null;
  }

  /** Called from a layout effect, before the part is painted. Idempotent. */
  arm(el: SVGGElement, prio: number) {
    if (el.hasAttribute("data-armed")) return;
    if (this.reduced) {
      el.setAttribute("data-armed", "");
      el.setAttribute("data-plotted", "");
      return;
    }
    el.querySelectorAll<SVGGeometryElement>("[data-pen]").forEach((p) => {
      const len = p.getTotalLength();
      p.dataset.len = String(len);
      p.style.strokeDasharray = `${len} ${len}`;
      p.style.strokeDashoffset = `${len}`;
    });
    el.setAttribute("data-armed", "");
    this.queue.push({ el, prio, seq: this.seq++ });
    this.total++;
    this.kick();
  }

  private kick() {
    if (this.running || this.dead || !this.io) return;
    this.running = true;
    const g = this.gen;
    requestAnimationFrame(() => void this.run(g));
  }

  private live(g: number) {
    return !this.dead && g === this.gen;
  }

  private async run(g: number) {
    if (!this.live(g)) return;
    this.io?.svg.setAttribute("data-active", "");
    while (this.live(g)) {
      if (!this.queue.length) {
        await this.park();
        if (!this.queue.length || !this.live(g)) break;
      }
      this.queue.sort((a, b) => a.prio - b.prio || a.seq - b.seq);
      const job = this.queue.shift()!;
      if (!job.el.isConnected || job.el.hasAttribute("data-gone")) {
        this.total = Math.max(0, this.total - 1);
        continue;
      }
      this.status();
      await this.plot(job);
      this.done++;
    }
    if (g !== this.gen) return;
    this.running = false;
    this.done = 0;
    this.total = 0;
    this.io?.svg.removeAttribute("data-active");
    this.status();
  }

  private async plot({ el }: Job) {
    const paths = Array.from(el.querySelectorAll<SVGGeometryElement>("[data-pen]"));
    const rush = 1 + Math.min(3, this.queue.length * 0.2);
    const speed = Number(el.dataset.speed || 1);
    el.setAttribute("data-plotting", "");
    if (!paths.length) await this.wait(90 / rush);
    for (const p of paths) {
      if (this.dead || !p.isConnected) break;
      const len = Number(p.dataset.len) || p.getTotalLength();
      await this.travel(this.point(p, 0), rush);
      const ms = clamp(len / (1.35 * rush * speed), 60, 560);
      await this.tween(ms, (t) => {
        const e = easePen(t);
        p.style.strokeDashoffset = `${len * (1 - e)}`;
        const pt = this.point(p, len * e);
        this.place(pt.x, pt.y);
      });
      p.style.strokeDasharray = "";
      p.style.strokeDashoffset = "";
      this.ink += len;
    }
    el.removeAttribute("data-plotting");
    el.setAttribute("data-plotted", "");
  }

  /** Point along a path, in the root SVG's coordinates (follows moving parents). */
  private point(p: SVGGeometryElement, at: number) {
    const svg = this.io?.svg;
    const local = p.getPointAtLength(at);
    const a = svg?.getScreenCTM();
    const b = p.getScreenCTM();
    if (!a || !b) return { x: local.x, y: local.y };
    const m = a.inverse().multiply(b);
    return { x: m.a * local.x + m.c * local.y + m.e, y: m.b * local.x + m.d * local.y + m.f };
  }

  private async travel(to: { x: number; y: number }, rush: number) {
    const from = { ...this.pos };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    if (dist < 1) return;
    this.io?.pen.setAttribute("data-up", "");
    await this.tween(clamp(dist / (2.2 * rush), 50, 260), (t) => {
      const e = easePen(t);
      this.place(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    });
    this.io?.pen.removeAttribute("data-up");
  }

  private async park() {
    if (!this.io) return;
    const { x, y } = this.io.park;
    const from = { ...this.pos };
    this.io.pen.setAttribute("data-up", "");
    await this.tween(420, (t) => {
      const e = easePen(t);
      this.place(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    }, () => this.queue.length > 0);
  }

  private place(x: number, y: number) {
    this.pos = { x, y };
    const io = this.io;
    if (!io) return;
    io.pen.style.transform = `translate(${x}px, ${y}px)`;
    io.gantry.style.transform = `translate(0px, ${y}px)`;
    if (io.readout) io.readout.textContent = `X ${x.toFixed(1).padStart(5, "0")}  Y ${y.toFixed(1).padStart(5, "0")}`;
  }

  private status() {
    const el = this.io?.status;
    if (!el) return;
    const ink = `INK ${(this.ink / 1000).toFixed(2)} M`;
    el.textContent = this.running && this.total ? `PLOTTING ${Math.min(this.done + 1, this.total)}/${this.total}  ·  ${ink}` : `PEN PARKED  ·  ${ink}`;
  }

  private wait(ms: number) {
    return this.tween(ms, () => {});
  }

  private tween(ms: number, fn: (t: number) => void, abort?: () => boolean) {
    const g = this.gen;
    return new Promise<void>((resolve) => {
      const t0 = performance.now();
      const step = (now: number) => {
        if (!this.live(g) || abort?.()) return resolve();
        const t = Math.min(1, (now - t0) / ms);
        fn(t);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }
}
