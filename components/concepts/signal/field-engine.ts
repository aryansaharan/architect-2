/**
 * Deep Field / Signal: the living field behind the hero.
 *
 * Two stacked canvases:
 *  - WebGL (raw): a background pass (deep field, interference, radar sweep,
 *    keystroke ripples) and an additive particle pass.
 *  - Canvas 2D: the crisp instrumentation (graticule, orbits, frames,
 *    signal lines, catalog labels).
 *
 * Particles live in fixed slot ranges. A slot bound to a Blueprint element
 * pulls its particles out of the ambient field (they spiral in and
 * condense); an unbound slot releases them back into the flow.
 */

import { rng, type Blueprint, type Perm, type ScreenKind } from "./derive";

const WHITE: [number, number, number] = [0.945, 0.957, 0.918]; // #F1F4EA
const SIGNAL: [number, number, number] = [0.831, 1.0, 0.247]; // #D4FF3F
const SIG = "212,255,63";
const LUM = "241,244,234";
const TAU = Math.PI * 2;

type Kind = "core" | "ring" | "agent" | "frame" | "link";

interface Slot {
  kind: Kind;
  start: number;
  count: number;
  id: string | null;
  index: number; // index in the blueprint array
  born: number;
}

interface Pt {
  x: number;
  y: number;
  s: number;
  z: number;
}

export interface FieldOptions {
  container: HTMLElement;
  glCanvas: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  stage: HTMLElement;
  origin?: HTMLElement | null;
  scope?: HTMLCanvasElement | null;
  reducedMotion: boolean;
  monoFamily: string;
  displayFamily: string;
  onStats?: (s: { fps: number; particles: number; kps: number; energy: number; gl: boolean }) => void;
  onEnergy?: (e: number) => void;
}

/* --------------------------------------------------------------- shaders */

const BG_VS = `attribute vec2 aP; void main(){ gl_Position = vec4(aP, 0.0, 1.0); }`;
const BG_FS = `precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec3 uStage; uniform float uTilt;
uniform float uSweep; uniform float uEnergy; uniform float uDpr; uniform vec4 uRip[6];
uniform vec3 uSig; uniform float uGr; uniform float uLimit;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.0; float w = 0.5; for (int i = 0; i < 4; i++) { a += w * vn(p); p = p * 2.03 + 17.1; w *= 0.5; } return a; }
void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 d = (p - uStage.xy) / uStage.z;
  float r = length(d);
  vec3 base = vec3(0.020, 0.024, 0.039);
  // below the instrument on narrow screens: plain deep field, skip the work
  if (p.y > uLimit) { gl_FragColor = vec4(base + (h(gl_FragCoord.xy) - 0.5) / 180.0, 1.0); return; }
  vec3 col = base;
  col += vec3(0.012, 0.020, 0.024) * exp(-r * r * 0.7);
  col += vec3(0.010, 0.014, 0.010) * exp(-r * r * 3.5);
  // deep field: slow dust lanes, barely there
  vec2 np = p / uStage.z * 1.1;
  float n = fbm(np + vec2(uTime * 0.012, -uTime * 0.008));
  float n2 = fbm(np * 2.4 - vec2(uTime * 0.02, 0.0) + n * 1.5);
  float dust = smoothstep(0.45, 0.95, n * 0.6 + n2 * 0.55);
  col += mix(vec3(0.020, 0.028, 0.034), uSig * 0.05, 0.35) * dust * (0.6 + 0.4 * exp(-r * r * 0.5));
  vec2 q = vec2(d.x, d.y / uTilt);
  float pr = length(q);
  // the orbital plane reads as a faint luminous disc
  col += vec3(0.020, 0.026, 0.028) * exp(-pr * pr * 1.6) + vec3(0.012, 0.016, 0.012) * smoothstep(uGr, uGr * 0.9, pr) * smoothstep(0.0, 1.0, pr);
  // ripple tank on the orbital plane: two sources, thin fringes, a moire lattice where they cross
  vec2 s1 = vec2(cos(uTime * 0.05), sin(uTime * 0.05)) * 0.36;
  float l1 = smoothstep(0.93, 1.0, cos(length(q - s1) * 46.0 - uTime * 0.8));
  float l2 = smoothstep(0.93, 1.0, cos(length(q + s1) * 46.0 - uTime * 0.8));
  float tank = (l1 * l2 * 1.0 + (l1 + l2) * 0.12) * smoothstep(uGr * 0.95, 0.15, pr);
  col += mix(vec3(0.5), uSig, 0.6) * tank * (0.028 + 0.05 * uEnergy);
  float ang = atan(q.y, q.x);
  float da = mod(uSweep - ang, 6.2831853);
  float wedge = exp(-da * 4.0) * smoothstep(uGr, uGr * 0.75, pr) * smoothstep(0.02, 0.12, pr);
  col += uSig * wedge * 0.055;
  float ringA = exp(-pow((pr - uGr) * 60.0, 2.0)) * 0.012;
  col += vec3(ringA);
  for (int i = 0; i < 6; i++) {
    vec4 rp = uRip[i];
    if (rp.w <= 0.0) continue;
    float rr = rp.z * 560.0 * uDpr;
    float dist = length(p - rp.xy);
    float x = (dist - rr) / (5.0 * uDpr + rp.z * 9.0 * uDpr);
    float ring = exp(-x * x) + 0.4 * exp(-pow((dist - rr * 0.86) / (3.0 * uDpr), 2.0));
    col += uSig * ring * rp.w * exp(-rp.z * 2.2) * 0.11;
  }
  vec2 uv = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - dot(uv, uv) * 0.55;
  col = mix(base, col, smoothstep(uLimit, uLimit - 140.0 * uDpr, p.y));
  col += (h(gl_FragCoord.xy + fract(uTime) * 71.0) - 0.5) / 180.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const PT_VS = `attribute vec2 aPos; attribute float aSize; attribute float aB; attribute float aT;
uniform vec2 uView; uniform float uDpr; varying float vB; varying float vT;
void main(){
  vec2 c = aPos / uView * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  float s = aSize * uDpr;
  gl_PointSize = max(s, 1.0);
  vB = aB * min(1.0, s);
  vT = aT;
}`;
const PT_FS = `precision mediump float; varying float vB; varying float vT; uniform vec3 uW; uniform vec3 uS;
void main(){
  vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float a = pow(1.0 - r, 2.0) + smoothstep(0.4, 0.0, r) * 0.5;
  vec3 c = mix(uW, uS, vT);
  gl_FragColor = vec4(c * a * vB, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) throw new Error("shader");
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "compile");
  return s;
}
function program(gl: WebGLRenderingContext, vs: string, fs: string) {
  const p = gl.createProgram();
  if (!p) throw new Error("program");
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  return p;
}

/* --------------------------------------------------------------- helpers */

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const GLYPHS = "0123456789ABCDEF#+/<>";

function decode(text: string, p: number, salt: number, t: number) {
  if (p >= 1) return text;
  const n = Math.floor(text.length * p);
  let out = text.slice(0, n);
  const tick = Math.floor(t * 24);
  for (let i = n; i < text.length; i++) {
    const c = text[i];
    out += c === " " ? " " : GLYPHS[(i * 7 + salt + tick * 13) % GLYPHS.length];
  }
  return out;
}

function kfmt(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n);
}

function permLine(perms: Perm[]) {
  if (perms.includes("ask")) return "ASK FIRST";
  return perms.map((p) => (p === "read" ? "READ" : "CHANGE")).join(" · ");
}

/* ---------------------------------------------------------------- engine */

export class FieldEngine {
  private o: FieldOptions;
  private gl: WebGLRenderingContext | null = null;
  private ctx: CanvasRenderingContext2D;
  private scopeCtx: CanvasRenderingContext2D | null = null;
  private bgProg: WebGLProgram | null = null;
  private ptProg: WebGLProgram | null = null;
  private quad: WebGLBuffer | null = null;
  private vbo: WebGLBuffer | null = null;
  private bgU: Record<string, WebGLUniformLocation | null> = {};
  private ptU: Record<string, WebGLUniformLocation | null> = {};
  private ptA: Record<string, number> = {};

  private W = 1;
  private H = 1;
  private dpr = 1;
  private glDpr = 1;
  private cx = 0;
  private cy = 0;
  private R = 200;
  private tiltB = 0.5;
  private gr = 1.34;
  private narrow = false;
  private labelBoxes: { x: number; y: number; w: number; h: number }[] = [];
  private labelSide = new Map<string, number>();
  private agentPhaseById = new Map<string, number>();
  private perfMs = 0;
  private ox = 0;
  private oy = 0;

  private N = 0;
  private nAmbientActive = 0;
  private px!: Float32Array;
  private py!: Float32Array;
  private vx!: Float32Array;
  private vy!: Float32Array;
  private r1!: Float32Array;
  private r2!: Float32Array;
  private r3!: Float32Array;
  private slotOf!: Int16Array;
  private assignT!: Float32Array;
  private buf!: Float32Array;
  private slots: Slot[] = [];

  private bp: Blueprint | null = null;
  private born = new Map<string, number>();
  private agentOrbit: { inc: number; node: number }[] = [];
  private screenPos: Pt[] = [];
  private screenFoot: Pt[] = [];
  private agentPos: Pt[] = [];
  private connPos: Pt[] = [];
  private ringR: number[] = [];

  private t = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private visible = true;
  private energy = 0;
  private sweep = 0;
  private yawDrift = 0;
  private keys: number[] = [];
  private ripples: { x: number; y: number; t0: number; s: number }[] = [];
  private pointer = { x: -9999, y: -9999, nx: 0, ny: 0, sx: 0, sy: 0 };
  private scope = new Float32Array(160);
  private scopeHead = 0;
  private impulse = 0;
  private frames = 0;
  private fpsAcc = 0;
  private fpsT = 0;
  private slowFrames = 0;
  private quality = 2;
  private lastEnergyOut = -1;
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;

  constructor(o: FieldOptions) {
    this.o = o;
    const ctx = o.overlay.getContext("2d");
    if (!ctx) throw new Error("2d");
    this.ctx = ctx;
    this.scopeCtx = o.scope?.getContext("2d") ?? null;
    this.initGL();
    this.measure();
    this.allocate();
    this.ro = new ResizeObserver(() => {
      this.measure();
      if (this.o.reducedMotion) this.renderStill();
    });
    this.ro.observe(o.container);
    this.ro.observe(o.stage);
    this.io = new IntersectionObserver((e) => {
      this.visible = e[0]?.isIntersecting ?? true;
      if (this.visible) this.start();
    });
    this.io.observe(o.container);
    o.glCanvas.addEventListener("webglcontextlost", this.onLost);
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.gl = null;
    this.o.glCanvas.style.opacity = "0";
  };

  private initGL() {
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = this.o.glCanvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    } catch {
      gl = null;
    }
    if (!gl) {
      this.o.glCanvas.style.opacity = "0";
      return;
    }
    try {
      this.bgProg = program(gl, BG_VS, BG_FS);
      this.ptProg = program(gl, PT_VS, PT_FS);
    } catch (err) {
      console.warn("[signal] WebGL unavailable, using canvas 2D", err);
      this.o.glCanvas.style.opacity = "0";
      return;
    }
    this.gl = gl;
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    for (const n of ["uRes", "uTime", "uStage", "uTilt", "uSweep", "uEnergy", "uDpr", "uRip", "uSig", "uGr", "uLimit"]) this.bgU[n] = gl.getUniformLocation(this.bgProg, n);
    for (const n of ["uView", "uDpr", "uW", "uS"]) this.ptU[n] = gl.getUniformLocation(this.ptProg, n);
    for (const n of ["aPos", "aSize", "aB", "aT"]) this.ptA[n] = gl.getAttribLocation(this.ptProg, n);
    this.vbo = gl.createBuffer();
  }

  /* ------------------------------------------------------------ layout */

  private measure() {
    const c = this.o.container.getBoundingClientRect();
    const s = this.o.stage.getBoundingClientRect();
    this.W = Math.max(1, c.width);
    this.H = Math.max(1, c.height);
    this.narrow = s.width < 640;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = this.quality === 0 ? 1 : dpr;
    this.glDpr = this.quality < 2 ? 1 : Math.min(dpr, this.narrow ? 1.5 : 1.75);
    const sx = s.left - c.left;
    const sy = s.top - c.top;
    this.cx = sx + s.width / 2;
    // Fit the whole system (back frames to front stations) inside the stage.
    // top extent: back frames and their labels; bottom: front stations and their labels
    if (this.narrow) {
      this.tiltB = 0.6;
      this.gr = 1.16;
      this.R = Math.max(80, Math.min(s.width / 2.4, (s.height - 60) / 1.95));
      this.cy = sy + 1.05 * this.R + 22;
    } else {
      this.tiltB = 0.5;
      this.gr = 1.34;
      this.R = Math.max(120, Math.min(s.width / 3.0, (s.height - 70) / 1.76));
      this.cy = sy + 0.95 * this.R + 34;
    }
    const ov = this.o.overlay;
    ov.width = Math.round(this.W * this.dpr);
    ov.height = Math.round(this.H * this.dpr);
    const gc = this.o.glCanvas;
    gc.width = Math.round(this.W * this.glDpr);
    gc.height = Math.round(this.H * this.glDpr);
    this.measureOrigin();
    if (this.o.scope) {
      const r = this.o.scope.getBoundingClientRect();
      this.o.scope.width = Math.round(r.width * dpr);
      this.o.scope.height = Math.round(r.height * dpr);
    }
  }

  private measureOrigin() {
    const c = this.o.container.getBoundingClientRect();
    const el = this.o.origin;
    if (el) {
      const r = el.getBoundingClientRect();
      this.ox = r.left - c.left + Math.min(r.width * 0.5, 160);
      this.oy = r.top - c.top + 18;
    } else {
      this.ox = this.cx;
      this.oy = this.cy;
    }
  }

  private allocate() {
    const q = this.narrow ? 0.55 : 1;
    const plan: [Kind, number, number][] = [
      ["core", 1, Math.round(200 * q)],
      ["ring", 4, Math.round(320 * q)],
      ["agent", 5, Math.round(250 * q)],
      ["frame", 6, Math.round(150 * q)],
      ["link", 14, Math.round(44 * q)],
    ];
    let n = 0;
    this.slots = [];
    for (const [kind, k, count] of plan) {
      for (let i = 0; i < k; i++) {
        this.slots.push({ kind, start: n, count, id: null, index: -1, born: 0 });
        n += count;
      }
    }
    const ambient = Math.round(3000 * q);
    this.N = n + ambient;
    this.nAmbientActive = this.N;
    const N = this.N;
    this.px = new Float32Array(N);
    this.py = new Float32Array(N);
    this.vx = new Float32Array(N);
    this.vy = new Float32Array(N);
    this.r1 = new Float32Array(N);
    this.r2 = new Float32Array(N);
    this.r3 = new Float32Array(N);
    this.slotOf = new Int16Array(N).fill(-1);
    this.assignT = new Float32Array(N);
    this.buf = new Float32Array(N * 5);
    const r = rng(0x5eed);
    for (let i = 0; i < N; i++) {
      this.px[i] = r() * this.W;
      this.py[i] = r() * this.H;
      this.r1[i] = r();
      this.r2[i] = r();
      this.r3[i] = r();
    }
    this.slots.forEach((s, si) => {
      for (let i = s.start; i < s.start + s.count; i++) this.slotOf[i] = si;
    });
  }

  /* -------------------------------------------------------- blueprint */

  setBlueprint(bp: Blueprint) {
    const first = this.bp === null;
    this.bp = bp;
    const lists: Record<Kind, string[]> = {
      core: ["core"],
      ring: bp.data.map((d) => d.id),
      agent: bp.agents.map((a) => a.id),
      frame: bp.screens.map((s) => s.id),
      link: bp.wires.map((w) => w.id),
    };
    let added = 0;
    (Object.keys(lists) as Kind[]).forEach((kind) => {
      const ids = lists[kind];
      const slots = this.slots.filter((s) => s.kind === kind);
      for (const s of slots) {
        if (s.id && !ids.includes(s.id)) this.release(s);
      }
      for (const id of ids) {
        let s = slots.find((x) => x.id === id);
        if (!s) {
          s = slots.find((x) => x.id === null);
          if (!s) continue;
          s.id = id;
          s.born = this.t;
          this.bind(s, first);
          if (!this.born.has(id)) this.born.set(id, this.t + (first ? 0.25 + added * 0.12 : 0));
          added++;
        }
        s.index = ids.indexOf(id);
      }
    });
    for (const id of [...this.born.keys()]) {
      if (!Object.values(lists).some((l) => l.includes(id))) this.born.delete(id);
    }
    this.agentOrbit = bp.agents.map((a, i) => {
      const r = rng(bp.seed ^ (i * 7919) ^ a.id.length * 31);
      const h = Array.from(a.id).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
      return { inc: ((h % 1000) / 1000 - 0.5) * 0.42, node: (((h >>> 10) % 1000) / 1000) * TAU + r() * 0.01 };
    });
    bp.agents.forEach((a, i) => {
      if (!this.agentPhaseById.has(a.id)) {
        // spread bodies evenly around the sky (in world angle, so undo each orbit's node)
        const want = first ? (i / Math.max(1, bp.agents.length)) * TAU + 0.5 : (a.id.length * 1.7 + i * 2.2) % TAU;
        this.agentPhaseById.set(a.id, want + (this.agentOrbit[i]?.node ?? 0));
      }
    });
    if (!first && added > 0 && !this.o.reducedMotion) this.ripple(this.cx, this.cy, 0.9);
    if (this.o.reducedMotion) this.renderStill();
  }

  private bind(s: Slot, first: boolean) {
    for (let i = s.start; i < s.start + s.count; i++) {
      this.assignT[i] = this.t + (first ? 0.2 : 0) + this.r3[i] * (first ? 1.4 : 0.55);
    }
  }

  private release(s: Slot) {
    for (let i = s.start; i < s.start + s.count; i++) {
      const a = this.r1[i] * TAU;
      const sp = 1.5 + this.r2[i] * 3.5;
      this.vx[i] += Math.cos(a) * sp;
      this.vy[i] += Math.sin(a) * sp;
    }
    s.id = null;
    s.index = -1;
  }

  /* ------------------------------------------------------------ input */

  keystroke(kind: "char" | "delete" = "char") {
    const now = performance.now() / 1000;
    this.keys.push(now);
    if (this.keys.length > 24) this.keys.shift();
    this.impulse = Math.min(1.6, this.impulse + (kind === "delete" ? 0.6 : 1));
    if (this.o.reducedMotion) return;
    this.measureOrigin();
    this.ripple(this.ox + (Math.random() - 0.5) * 30, this.oy, kind === "delete" ? 0.5 : 0.8);
  }

  private ripple(x: number, y: number, s: number) {
    this.ripples.push({ x, y, t0: this.t, s });
    if (this.ripples.length > 6) this.ripples.shift();
  }

  setPointer(clientX: number, clientY: number) {
    const c = this.o.container.getBoundingClientRect();
    this.pointer.x = clientX - c.left;
    this.pointer.y = clientY - c.top;
    this.pointer.nx = clamp((this.pointer.x - this.W / 2) / (this.W / 2), -1, 1);
    this.pointer.ny = clamp((this.pointer.y - this.H / 2) / (this.H / 2), -1, 1);
  }
  clearPointer() {
    this.pointer.x = -9999;
    this.pointer.y = -9999;
    this.pointer.nx = 0;
    this.pointer.ny = 0;
  }

  /* ------------------------------------------------------------- loop */

  start() {
    if (this.o.reducedMotion) {
      this.renderStill();
      return;
    }
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    this.ro?.disconnect();
    this.io?.disconnect();
    this.o.glCanvas.removeEventListener("webglcontextlost", this.onLost);
    // Free GPU objects but keep the context: the canvas may be re-used by a remount.
    const gl = this.gl;
    if (gl) {
      gl.deleteBuffer(this.quad);
      gl.deleteBuffer(this.vbo);
      gl.deleteProgram(this.bgProg);
      gl.deleteProgram(this.ptProg);
    }
    this.gl = null;
  }

  private loop = (now: number) => {
    if (!this.running) return;
    if (!this.visible || document.hidden) {
      this.running = false;
      return;
    }
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t0 = performance.now();
    this.step(dt);
    this.draw();
    this.perfMs += (performance.now() - t0 - this.perfMs) * 0.05;
    this.stats(dt);
    this.raf = requestAnimationFrame(this.loop);
  };

  private stats(dt: number) {
    this.frames++;
    this.fpsAcc += dt;
    if (dt > 0.026) this.slowFrames++;
    if (this.fpsAcc >= 0.5) {
      const fps = this.frames / this.fpsAcc;
      this.fpsT += this.fpsAcc;
      // Adaptive quality: after warm-up, sustained slow frames shed load.
      if (this.fpsT > 2.5 && this.slowFrames > this.frames * 0.5 && this.quality > 0) {
        this.quality--;
        this.nAmbientActive = Math.round(this.N - (this.N - this.slots.reduce((a, s) => a + s.count, 0)) * (this.quality === 1 ? 0.45 : 0.75));
        this.measure();
      }
      this.o.onStats?.({ fps, particles: this.nAmbientActive, kps: this.kps(), energy: this.energy, gl: !!this.gl });
      this.o.container.dataset.cpuMs = this.perfMs.toFixed(2);
      this.frames = 0;
      this.fpsAcc = 0;
      this.slowFrames = 0;
    }
  }

  private kps() {
    const now = performance.now() / 1000;
    let n = 0;
    for (const k of this.keys) if (now - k < 1.6) n++;
    return n / 1.6;
  }

  /* ------------------------------------------------------ projection */

  private yaw = 0;
  private tiltNow = 0.5;

  private project(x: number, y: number, z: number, out: Pt) {
    const A = this.yaw;
    const B = this.tiltNow;
    const ca = Math.cos(A);
    const sa = Math.sin(A);
    const x1 = x * ca + z * sa;
    const z1 = -x * sa + z * ca;
    const cb = Math.cos(B);
    const sb = Math.sin(B);
    const y2 = y * cb + z1 * sb;
    const z2 = -y * sb + z1 * cb;
    const D = 5;
    const s = D / (D + z2);
    out.x = this.cx + x1 * s * this.R;
    out.y = this.cy - y2 * s * this.R;
    out.s = s;
    out.z = z2;
    return out;
  }

  private agentWorld(i: number, theta: number, a: number): [number, number, number] {
    const orb = this.agentOrbit[i] ?? { inc: 0, node: 0 };
    const x0 = a * Math.cos(theta);
    const zp = a * Math.sin(theta);
    const y0 = zp * Math.sin(orb.inc);
    const z0 = zp * Math.cos(orb.inc);
    const cn = Math.cos(orb.node);
    const sn = Math.sin(orb.node);
    return [x0 * cn + z0 * sn, y0, -x0 * sn + z0 * cn];
  }

  private agentA(i: number) {
    return 0.4 + i * 0.15;
  }
  private ringRad(j: number) {
    return 0.22 + j * 0.12;
  }

  private layout(dt: number) {
    const bp = this.bp;
    if (!bp) return;
    // gentle sway plus pointer parallax
    this.yawDrift += dt * 0.04;
    const p = this.pointer;
    p.sx += (p.nx - p.sx) * Math.min(1, dt * 2.5);
    p.sy += (p.ny - p.sy) * Math.min(1, dt * 2.5);
    this.yaw = Math.sin(this.yawDrift) * 0.22 + p.sx * 0.12;
    this.tiltNow = this.tiltB + p.sy * 0.05;
    const speed = 1 + this.energy * 0.9;
    this.agentPos = bp.agents.map((ag, i) => {
      const a = this.agentA(i);
      const ph = (this.agentPhaseById.get(ag.id) ?? 0) + dt * speed * (0.1 / Math.pow(a, 1.5));
      this.agentPhaseById.set(ag.id, ph);
      const [x, y, z] = this.agentWorld(i, ph, a);
      return this.project(x, y, z, { x: 0, y: 0, s: 1, z: 0 });
    });
    this.ringR = bp.data.map((_, j) => this.ringRad(j));
    const n = bp.screens.length;
    const rad = this.narrow ? 0.95 : 1.2;
    const step = n > 1 ? Math.min(this.narrow ? Math.PI / 4.2 : Math.PI / 3, (this.narrow ? Math.PI * 0.9 : Math.PI * 1.22) / (n - 1)) : 0;
    this.screenPos = [];
    this.screenFoot = [];
    for (let k = 0; k < n; k++) {
      const ang = Math.PI / 2 + (k - (n - 1) / 2) * step;
      const x = rad * Math.cos(ang);
      const z = rad * Math.sin(ang);
      // side frames float higher than back ones (depth already lifts those); a second tier once the sky gets busy
      const tier = n >= 4 && k % 2 === 1 ? 1 : 0;
      const elev = (this.narrow ? 0.34 : 0.3) + 0.3 * Math.abs(Math.cos(ang)) + tier * (this.narrow ? 0.2 : 0.16);
      this.screenPos.push(this.project(x, elev, z, { x: 0, y: 0, s: 1, z: 0 }));
      this.screenFoot.push(this.project(x, 0, z, { x: 0, y: 0, s: 1, z: 0 }));
    }
    const m = bp.conns.length;
    const crad = this.narrow ? 1.06 : 1.24;
    const cstep = m > 1 ? Math.min(this.narrow ? Math.PI / 4.5 : Math.PI / 4, (Math.PI * 0.95) / (m - 1)) : 0;
    this.connPos = [];
    for (let k = 0; k < m; k++) {
      const ang = -Math.PI / 2 + (k - (m - 1) / 2) * cstep;
      this.connPos.push(this.project(crad * Math.cos(ang), -0.05, crad * Math.sin(ang), { x: 0, y: 0, s: 1, z: 0 }));
    }
  }

  private frameSize(s: number) {
    const w = (this.narrow ? 0.42 : 0.36) * this.R * s;
    return { w, h: w * 0.66 };
  }

  private nodePos(ref: Blueprint["wires"][number]["from"], end: "from" | "to"): Pt | null {
    if (ref.t === "core") return { x: this.cx, y: this.cy, s: 1, z: 0 };
    if (ref.t === "agent") return this.agentPos[ref.i] ?? null;
    if (ref.t === "conn") return this.connPos[ref.i] ?? null;
    const sp = this.screenPos[ref.i];
    if (!sp) return null;
    const f = this.frameSize(sp.s);
    return { x: sp.x, y: sp.y + (end === "to" ? f.h / 2 : 0), s: sp.s, z: sp.z };
  }

  private wireCurve(i: number) {
    const bp = this.bp;
    if (!bp) return null;
    const w = bp.wires[i];
    if (!w) return null;
    const a = this.nodePos(w.from, "from");
    const b = this.nodePos(w.to, "to");
    if (!a || !b) return null;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = w.from.t === "core" ? 0.12 : 0.22;
    // bend away from the core so lines arc around the system
    let nx = -dy / len;
    let ny = dx / len;
    if ((mx - this.cx) * nx + (my - this.cy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y, qx: mx + nx * len * bend, qy: my + ny * len * bend, kind: w.to.t, ask: w.to.t === "screen" && w.from.t === "agent" };
  }

  /* ------------------------------------------------------------- step */

  private step(dt: number) {
    this.t += dt;
    const t = this.t;
    // typing energy
    const target = clamp(this.kps() / 6.5, 0, 1.4);
    this.energy += (target - this.energy) * (1 - Math.exp(-dt * (target > this.energy ? 5 : 1.6)));
    this.impulse *= Math.exp(-dt * 7);
    this.sweep = (this.sweep + dt * (0.55 + this.energy * 1.2)) % TAU;
    if (this.o.onEnergy && Math.abs(this.energy - this.lastEnergyOut) > 0.01) {
      this.lastEnergyOut = this.energy;
      this.o.onEnergy(this.energy);
    }
    // scope trace
    const sv = this.impulse * (0.6 + 0.4 * Math.sin(t * 90)) + Math.sin(t * 7) * 0.05 * (0.3 + this.energy) + (Math.random() - 0.5) * 0.03;
    this.scope[this.scopeHead] = sv;
    this.scopeHead = (this.scopeHead + 1) % this.scope.length;

    this.layout(dt);
    this.simulate(dt);
    this.ripples = this.ripples.filter((r) => t - r.t0 < 1.8);
  }

  private simulate(dt: number) {
    const bp = this.bp;
    const t = this.t;
    const f = dt * 60;
    const W = this.W;
    const H = this.H;
    const cx = this.cx;
    const cy = this.cy;
    const R = this.R;
    const sb = Math.sin(this.tiltNow);
    const e = this.energy;
    const buf = this.buf;
    const tmp: Pt = { x: 0, y: 0, s: 1, z: 0 };
    const rip = this.ripples.map((r) => ({ x: r.x, y: r.y, rr: (t - r.t0) * 560, s: r.s * Math.exp(-(t - r.t0) * 1.3) }));
    const ambSpeed = 0.28 * (1 + e * 2.4);
    const curves = bp ? bp.wires.map((_, i) => this.wireCurve(i)) : [];
    const coreBorn = this.born.get("core") ?? 0;

    for (let i = 0; i < this.N; i++) {
      const si = this.slotOf[i];
      const slot = si >= 0 ? this.slots[si] : null;
      let px = this.px[i];
      let py = this.py[i];
      let vx = this.vx[i];
      let vy = this.vy[i];
      const a1 = this.r1[i];
      const a2 = this.r2[i];
      const a3 = this.r3[i];
      let size = 1.2;
      let bright = 0.4;
      let tint = 0;
      let bound = false;
      let tx = 0;
      let ty = 0;

      if (slot && slot.id && bp) {
        bound = true;
        const k = slot.index;
        switch (slot.kind) {
          case "core": {
            const rr = Math.pow(a1, 2.2) * 0.07;
            const th = a2 * TAU + t * 0.6;
            const ph = Math.acos(2 * a3 - 1);
            this.project(rr * Math.sin(ph) * Math.cos(th), rr * Math.cos(ph), rr * Math.sin(ph) * Math.sin(th), tmp);
            tx = tmp.x;
            ty = tmp.y;
            size = 1.4 + (1 - a1) * 1.8;
            bright = 0.55 + (1 - a1) * 0.5;
            tint = 0.35;
            if (a1 < 0.03) {
              // a few wide, faint points act as bloom around the nucleus
              size = 26 + a2 * 16;
              bright = 0.07;
            }
            if (t < coreBorn) bound = false;
            break;
          }
          case "ring": {
            const r = this.ringR[k] ?? 0.3;
            const band = a3 < 0.72 ? (a2 - 0.5) * 0.022 : 0.035 + (a2 - 0.5) * 0.01;
            const th = a1 * TAU + t * (0.07 / (1 + k * 0.4)) * (1 + e * 0.6);
            this.project((r + band) * Math.cos(th), 0, (r + band) * Math.sin(th), tmp);
            tx = tmp.x;
            ty = tmp.y;
            size = (0.9 + a2 * 1.1) * tmp.s;
            bright = (0.3 + a3 * 0.4) * (0.55 + 0.45 * tmp.s);
            break;
          }
          case "agent": {
            const ap = this.agentPos[k];
            if (!ap) {
              bound = false;
              break;
            }
            const br = 0.05;
            const rr = br * Math.pow(a1, 1.7) * 1.5;
            const th = a2 * TAU + t * (0.8 + a3);
            const ph = Math.acos(2 * a3 - 1);
            const lx = rr * Math.sin(ph) * Math.cos(th);
            const ly = rr * Math.cos(ph);
            tx = ap.x + lx * R * ap.s;
            ty = ap.y - ly * R * ap.s + rr * Math.sin(ph) * Math.sin(th) * R * ap.s * 0.3;
            size = (1.3 + (1 - a1) * 2.4) * ap.s;
            bright = 0.5 + (1 - a1) * 0.6;
            tint = bp.agents[k]?.perms.includes("ask") ? 0.55 : 0.12;
            if (a1 < 0.025) {
              size = (18 + a2 * 12) * ap.s;
              bright = 0.08;
            }
            break;
          }
          case "frame": {
            const sp = this.screenPos[k];
            if (!sp) {
              bound = false;
              break;
            }
            const fs = this.frameSize(sp.s);
            const born = this.born.get(slot.id) ?? 0;
            const rev = ease((t - born) / 1.1);
            const u = (a1 + t * 0.012 * (a3 < 0.2 ? 4 : 1)) % 1;
            const per = 2 * (fs.w + fs.h);
            let d = u * per * rev;
            let ox: number;
            let oy: number;
            if (d < fs.w) {
              ox = d;
              oy = 0;
            } else if ((d -= fs.w) < fs.h) {
              ox = fs.w;
              oy = d;
            } else if ((d -= fs.h) < fs.w) {
              ox = fs.w - d;
              oy = fs.h;
            } else {
              d -= fs.w;
              ox = 0;
              oy = fs.h - d;
            }
            tx = sp.x - fs.w / 2 + ox + (a2 - 0.5) * 1.2;
            ty = sp.y - fs.h / 2 + oy + (a3 - 0.5) * 1.2;
            size = 1 + a2 * 1.1;
            bright = 0.45 + a2 * 0.35;
            break;
          }
          case "link": {
            const c = curves[k];
            if (!c) {
              bound = false;
              break;
            }
            const packet = Math.floor(a1 * 3);
            const trail = a2 * 0.06;
            const sp = c.kind === "screen" && !c.ask ? 0.16 : 0.26;
            const u = (((packet / 3 + t * sp * (1 + e * 0.8) - trail) % 1) + 1) % 1;
            const iu = 1 - u;
            tx = iu * iu * c.ax + 2 * iu * u * c.qx + u * u * c.bx;
            ty = iu * iu * c.ay + 2 * iu * u * c.qy + u * u * c.by;
            const fade = Math.sin(u * Math.PI);
            size = 1.1 + (1 - a2) * 1.8;
            bright = (0.25 + (1 - a2) * 0.9) * fade;
            tint = c.kind === "screen" && !c.ask ? 0.1 : 1;
            break;
          }
        }
      }

      if (bound && t >= this.assignT[i]) {
        const ramp = clamp((t - this.assignT[i]) / 0.7, 0, 1);
        const k = 0.11 * ramp * ramp;
        const dx = tx - px;
        const dy = ty - py;
        vx += (dx * k - dy * 0.02 * (1 - ramp)) * f;
        vy += (dy * k + dx * 0.02 * (1 - ramp)) * f;
        const damp = Math.pow(0.74, f);
        vx *= damp;
        vy *= damp;
        // in transit particles glow brighter, like matter heating as it falls in
        if (ramp < 1) {
          bright = Math.max(bright, 0.5);
          size *= 1.1;
        }
      } else {
        if (i >= this.nAmbientActive) {
          buf[i * 5 + 3] = 0;
          continue;
        }
        // curl noise: the velocity is the curl of a drifting potential, so the
        // flow is divergence free and dust never piles up into streaks
        const nu = px * 0.0024;
        const nv = py * 0.0024;
        const p1 = nu + t * 0.07;
        const p2 = nv * 1.3 - t * 0.05;
        const p3 = (nu + nv) * 0.7 + 1.7;
        const c3 = 0.35 * Math.cos(p3);
        const dPdu = Math.cos(p1) * Math.cos(p2) + c3;
        const dPdv = -1.3 * Math.sin(p1) * Math.sin(p2) + c3;
        const sp = ambSpeed * (0.45 + a2 * 0.55) * 0.8;
        let fx = dPdv * sp;
        let fy = -dPdu * sp;
        const dxc = (px - cx) / R;
        const dyc = (py - cy) / (R * sb);
        const dd = dxc * dxc + dyc * dyc;
        const sw = (0.9 * (1 + e)) / (0.5 + dd);
        const dl = Math.sqrt(dd) || 1;
        fx += (-dyc / dl) * sw * 0.7;
        fy += (dxc / dl) * sw * 0.7 * sb;
        const mix = 1 - Math.pow(0.94, f);
        vx += (fx - vx) * mix;
        vy += (fy - vy) * mix;
        const tw = 0.5 + 0.5 * Math.sin(t * (0.6 + a1 * 1.8) + a2 * 40);
        size = 0.8 + a1 * a1 * 1.9;
        bright = (0.12 + a3 * 0.32) * (0.55 + tw * 0.45) * (1 + e * 0.5);
        tint = a2 > 0.965 ? 1 : 0;
        if (tint) bright *= 1.8;
      }

      for (let r = 0; r < rip.length; r++) {
        const q = rip[r];
        const dx = px - q.x;
        const dy = py - q.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
        const off = Math.abs(d - q.rr);
        if (off < 46) {
          const push = q.s * (1 - off / 46) * (bound ? 1.1 : 2.2) * f;
          vx += (dx / d) * push;
          vy += (dy / d) * push;
          bright += q.s * (1 - off / 46) * 0.5;
        }
      }

      px += vx * f;
      py += vy * f;
      if (!bound) {
        if (px < -20) px += W + 40;
        else if (px > W + 20) px -= W + 40;
        if (py < -20) py += H + 40;
        else if (py > H + 20) py -= H + 40;
      }
      this.px[i] = px;
      this.py[i] = py;
      this.vx[i] = vx;
      this.vy[i] = vy;
      const o = i * 5;
      buf[o] = px;
      buf[o + 1] = py;
      buf[o + 2] = size;
      buf[o + 3] = bright;
      buf[o + 4] = tint;
    }
  }

  /* ------------------------------------------------------------- draw */

  private draw() {
    if (this.gl) this.drawGL();
    this.drawOverlay();
    this.drawScope();
  }

  private drawGL() {
    const gl = this.gl;
    if (!gl || !this.bgProg || !this.ptProg) return;
    const gd = this.glDpr;
    gl.viewport(0, 0, this.o.glCanvas.width, this.o.glCanvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.bgProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    const aP = gl.getAttribLocation(this.bgProg, "aP");
    gl.enableVertexAttribArray(aP);
    gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
    const u = this.bgU;
    gl.uniform2f(u.uRes, this.o.glCanvas.width, this.o.glCanvas.height);
    gl.uniform1f(u.uTime, this.t);
    gl.uniform3f(u.uStage, this.cx * gd, this.cy * gd, this.R * gd);
    gl.uniform1f(u.uTilt, Math.sin(this.tiltNow));
    // match the sweep to the overlay (plane angle, flipped for screen y)
    gl.uniform1f(u.uSweep, this.sweepScreenAngle());
    gl.uniform1f(u.uEnergy, this.energy);
    gl.uniform1f(u.uDpr, gd);
    gl.uniform3f(u.uSig, SIGNAL[0], SIGNAL[1], SIGNAL[2]);
    gl.uniform1f(u.uGr, this.gr);
    gl.uniform1f(u.uLimit, (this.narrow ? this.cy + this.R * 1.25 : this.H + 400) * gd);
    const rip = new Float32Array(24);
    this.ripples.forEach((r, i) => {
      rip[i * 4] = r.x * gd;
      rip[i * 4 + 1] = r.y * gd;
      rip[i * 4 + 2] = this.t - r.t0;
      rip[i * 4 + 3] = r.s;
    });
    gl.uniform4fv(u.uRip, rip);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(aP);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.ptProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.buf, gl.DYNAMIC_DRAW);
    const A = this.ptA;
    const stride = 20;
    gl.enableVertexAttribArray(A.aPos);
    gl.vertexAttribPointer(A.aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(A.aSize);
    gl.vertexAttribPointer(A.aSize, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(A.aB);
    gl.vertexAttribPointer(A.aB, 1, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(A.aT);
    gl.vertexAttribPointer(A.aT, 1, gl.FLOAT, false, stride, 16);
    gl.uniform2f(this.ptU.uView, this.W, this.H);
    gl.uniform1f(this.ptU.uDpr, gd);
    gl.uniform3f(this.ptU.uW, WHITE[0], WHITE[1], WHITE[2]);
    gl.uniform3f(this.ptU.uS, SIGNAL[0], SIGNAL[1], SIGNAL[2]);
    gl.drawArrays(gl.POINTS, 0, this.N);
    for (const k of ["aPos", "aSize", "aB", "aT"]) gl.disableVertexAttribArray(A[k]);
  }

  /** The sweep in plane angle, expressed as the angle the shader sees in its (x, y/tilt) space. */
  private sweepScreenAngle() {
    const a = this.sweep;
    const p0: Pt = { x: 0, y: 0, s: 1, z: 0 };
    const p1: Pt = { x: 0, y: 0, s: 1, z: 0 };
    this.project(0, 0, 0, p0);
    this.project(Math.cos(a), 0, Math.sin(a), p1);
    const sb = Math.sin(this.tiltNow);
    return Math.atan2((p1.y - p0.y) / sb, p1.x - p0.x);
  }

  private font(size: number, weight = 400, family: "mono" | "display" = "mono") {
    return `${weight} ${size}px ${family === "mono" ? this.o.monoFamily : this.o.displayFamily}`;
  }

  private free(x: number, y: number, w: number, h: number) {
    if (x < 2 || x + w > this.W - 2) return false;
    for (const b of this.labelBoxes) {
      if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) return false;
    }
    return true;
  }

  private drawOverlay() {
    const ctx = this.ctx;
    const bp = this.bp;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.o.overlay.width, this.o.overlay.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.gl) this.drawParticles2D();
    if (!bp) return;
    this.labelBoxes = [];
    const t = this.t;
    const R = this.R;
    const G = this.gr;
    const tmp: Pt = { x: 0, y: 0, s: 1, z: 0 };
    const small = this.narrow;
    const coreRev = ease((t - (this.born.get("core") ?? 0)) / 1.4);
    const f1 = small ? 7.5 : 8.5;
    const f2 = small ? 7 : 7.5;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 1;

    /* graticule: range rings, bearings, axes */
    const ring = (r: number, y = 0) => {
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * TAU;
        this.project(r * Math.cos(a), y, r * Math.sin(a), tmp);
        if (i === 0) ctx.moveTo(tmp.x, tmp.y);
        else ctx.lineTo(tmp.x, tmp.y);
      }
    };
    ctx.globalAlpha = coreRev;
    ctx.strokeStyle = `rgba(${LUM},0.08)`;
    ctx.setLineDash([1, 5]);
    ring(G * 0.75);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(${LUM},0.14)`;
    ring(G);
    ctx.stroke();
    ctx.beginPath();
    for (let d = 0; d < 360; d += 5) {
      const a = (d * Math.PI) / 180;
      const len = d % 30 === 0 ? 0.055 : d % 10 === 0 ? 0.035 : 0.02;
      this.project(G * Math.cos(a), 0, G * Math.sin(a), tmp);
      const x0 = tmp.x;
      const y0 = tmp.y;
      this.project((G + len) * Math.cos(a), 0, (G + len) * Math.sin(a), tmp);
      ctx.moveTo(x0, y0);
      ctx.lineTo(tmp.x, tmp.y);
    }
    ctx.stroke();
    ctx.textBaseline = "middle";
    ctx.strokeStyle = `rgba(${LUM},0.055)`;
    ctx.beginPath();
    this.project(-G, 0, 0, tmp);
    ctx.moveTo(tmp.x, tmp.y);
    this.project(G, 0, 0, tmp);
    ctx.lineTo(tmp.x, tmp.y);
    this.project(0, 0, -G, tmp);
    ctx.moveTo(tmp.x, tmp.y);
    this.project(0, 0, G, tmp);
    ctx.lineTo(tmp.x, tmp.y);
    ctx.stroke();

    /* radar sweep */
    this.project(0, 0, 0, tmp);
    const sx0 = tmp.x;
    const sy0 = tmp.y;
    this.project(G * Math.cos(this.sweep), 0, G * Math.sin(this.sweep), tmp);
    const grad = ctx.createLinearGradient(sx0, sy0, tmp.x, tmp.y);
    grad.addColorStop(0, `rgba(${SIG},0)`);
    grad.addColorStop(1, `rgba(${SIG},0.6)`);
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.moveTo(sx0, sy0);
    ctx.lineTo(tmp.x, tmp.y);
    ctx.stroke();
    ctx.fillStyle = `rgba(${SIG},0.95)`;
    ctx.beginPath();
    ctx.arc(tmp.x, tmp.y, 1.8, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* data rings */
    bp.data.forEach((d, j) => {
      const rev = ease((t - (this.born.get(d.id) ?? 0)) / 1.2);
      if (rev <= 0) return;
      const r = this.ringR[j] ?? 0.3;
      ctx.globalAlpha = rev;
      ctx.strokeStyle = `rgba(${LUM},0.15)`;
      ctx.beginPath();
      const segs = Math.max(2, Math.floor(120 * rev));
      for (let i = 0; i <= segs; i++) {
        const a = (i / 120) * TAU + t * 0.05;
        this.project(r * Math.cos(a), 0, r * Math.sin(a), tmp);
        if (i === 0) ctx.moveTo(tmp.x, tmp.y);
        else ctx.lineTo(tmp.x, tmp.y);
      }
      ctx.stroke();
      ctx.strokeStyle = `rgba(${LUM},0.2)`;
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU + t * (0.07 / (1 + j * 0.4));
        this.project((r - 0.012) * Math.cos(a), 0, (r - 0.012) * Math.sin(a), tmp);
        const x0 = tmp.x;
        const y0 = tmp.y;
        this.project((r + 0.012) * Math.cos(a), 0, (r + 0.012) * Math.sin(a), tmp);
        ctx.moveTo(x0, y0);
        ctx.lineTo(tmp.x, tmp.y);
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    /* agent orbits and trails */
    bp.agents.forEach((ag, i) => {
      const rev = ease((t - (this.born.get(ag.id) ?? 0)) / 1.2);
      if (rev <= 0) return;
      const a = this.agentA(i);
      ctx.globalAlpha = rev;
      ctx.strokeStyle = `rgba(${LUM},0.07)`;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      for (let s = 0; s <= 96; s++) {
        const th = (s / 96) * TAU;
        const [x, y, z] = this.agentWorld(i, th, a);
        this.project(x, y, z, tmp);
        if (s === 0) ctx.moveTo(tmp.x, tmp.y);
        else ctx.lineTo(tmp.x, tmp.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const col = ag.perms.includes("ask") ? SIG : LUM;
      const ph = this.agentPhaseById.get(ag.id) ?? 0;
      let px0 = 0;
      let py0 = 0;
      for (let s = 0; s <= 22; s++) {
        const th = ph - (s / 22) * 1.1;
        const [x, y, z] = this.agentWorld(i, th, a);
        this.project(x, y, z, tmp);
        if (s > 0) {
          ctx.strokeStyle = `rgba(${col},${0.5 * (1 - s / 22)})`;
          ctx.lineWidth = 1.4 * (1 - s / 22) + 0.3;
          ctx.beginPath();
          ctx.moveTo(px0, py0);
          ctx.lineTo(tmp.x, tmp.y);
          ctx.stroke();
        }
        px0 = tmp.x;
        py0 = tmp.y;
      }
      ctx.lineWidth = 1;
    });
    ctx.globalAlpha = 1;

    /* signal lines */
    bp.wires.forEach((w, i) => {
      const c = this.wireCurve(i);
      if (!c) return;
      const rev = ease((t - (this.born.get(w.id) ?? 0) - 0.4) / 1.0);
      if (rev <= 0) return;
      ctx.globalAlpha = rev;
      const toScreen = c.kind === "screen" && !c.ask;
      ctx.strokeStyle = toScreen ? `rgba(${LUM},0.1)` : `rgba(${SIG},${c.ask ? 0.35 : 0.2})`;
      ctx.setLineDash(c.ask ? [3, 4] : toScreen ? [1, 3] : []);
      ctx.beginPath();
      ctx.moveTo(c.ax, c.ay);
      ctx.quadraticCurveTo(c.qx, c.qy, c.bx, c.by);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    ctx.globalAlpha = 1;

    /* screens: luminous frames, far first */
    const order = bp.screens.map((_, k) => k).sort((a, b) => (this.screenPos[b]?.z ?? 0) - (this.screenPos[a]?.z ?? 0));
    for (const k of order) this.drawFrame(k);

    /* core: the Blueprint */
    this.project(0, 0, 0, tmp);
    const coreX = tmp.x;
    const coreY = tmp.y;
    ctx.globalAlpha = coreRev;
    ctx.strokeStyle = `rgba(${LUM},0.5)`;
    ctx.beginPath();
    const cr = 0.1 * R;
    ctx.arc(coreX, coreY, cr * 0.5, 0, TAU);
    ctx.moveTo(coreX - cr, coreY);
    ctx.lineTo(coreX - cr * 0.62, coreY);
    ctx.moveTo(coreX + cr * 0.62, coreY);
    ctx.lineTo(coreX + cr, coreY);
    ctx.moveTo(coreX, coreY - cr);
    ctx.lineTo(coreX, coreY - cr * 0.62);
    ctx.moveTo(coreX, coreY + cr * 0.62);
    ctx.lineTo(coreX, coreY + cr);
    ctx.stroke();
    {
      const name = decode(bp.name.toUpperCase(), coreRev, 3, t);
      ctx.font = this.font(small ? 9 : 11, 600, "display");
      try {
        ctx.fontStretch = "expanded";
      } catch {
        /* older engines */
      }
      const nw = ctx.measureText(name).width;
      const ny = coreY + cr + (small ? 20 : 24);
      ctx.fillStyle = "rgba(5,6,10,0.72)";
      ctx.fillRect(coreX - nw / 2 - 6, ny - 17, nw + 12, small ? 28 : 31);
      ctx.fillStyle = `rgba(${LUM},0.98)`;
      ctx.textAlign = "center";
      ctx.fillText(name, coreX, ny);
      try {
        ctx.fontStretch = "normal";
      } catch {
        /* older engines */
      }
      ctx.font = this.font(f2, 500);
      ctx.fillStyle = `rgba(${LUM},0.45)`;
      ctx.fillText("BLUEPRINT", coreX, ny - 11);
      this.labelBoxes.push({ x: coreX - nw / 2 - 6, y: ny - 17, w: nw + 12, h: 31 });
      this.labelBoxes.push({ x: coreX - cr, y: coreY - cr, w: cr * 2, h: cr * 2 });
    }
    ctx.globalAlpha = 1;

    /* connections: stations on the horizon */
    bp.conns.forEach((c, k) => {
      const p = this.connPos[k];
      if (!p) return;
      const rev = ease((t - (this.born.get(c.id) ?? 0) - 0.2) / 1.0);
      if (rev <= 0) return;
      ctx.globalAlpha = rev;
      const r = 4.5;
      ctx.strokeStyle = `rgba(${LUM},0.8)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.moveTo(p.x - r - 5, p.y);
      ctx.lineTo(p.x - r - 1.5, p.y);
      ctx.moveTo(p.x + r + 1.5, p.y);
      ctx.lineTo(p.x + r + 5, p.y);
      ctx.moveTo(p.x, p.y - r - 5);
      ctx.lineTo(p.x, p.y - r - 1.5);
      ctx.moveTo(p.x, p.y + r + 1.5);
      ctx.lineTo(p.x, p.y + r + 5);
      ctx.stroke();
      const pulse = (t * 0.7 + k * 0.37) % 1;
      ctx.strokeStyle = `rgba(${SIG},${0.5 * (1 - pulse)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + pulse * 14, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = `rgba(${SIG},1)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.4, 0, TAU);
      ctx.fill();
      ctx.textAlign = "center";
      const name = decode(c.name.toUpperCase(), rev, k * 3, t);
      ctx.font = this.font(f1, 500);
      const w = ctx.measureText(name).width;
      ctx.fillStyle = `rgba(${LUM},0.42)`;
      ctx.font = this.font(f2, 500);
      ctx.fillText(`CX·${String(k + 1).padStart(2, "0")}`, p.x, p.y + r + 13);
      ctx.font = this.font(f1, 500);
      ctx.fillStyle = `rgba(${LUM},0.9)`;
      ctx.fillText(name, p.x, p.y + r + 25);
      this.labelBoxes.push({ x: p.x - w / 2 - 2, y: p.y - r - 6, w: w + 4, h: r * 2 + 38 });
    });
    ctx.globalAlpha = 1;

    /* data callouts: a stacked column, like annotations on a drawing */
    ctx.textAlign = "left";
    bp.data.forEach((d, j) => {
      const rev = ease((t - (this.born.get(d.id) ?? 0)) / 1.2);
      if (rev <= 0) return;
      const r = this.ringR[j] ?? 0.3;
      const la = -0.16 - j * 0.07;
      this.project(r * Math.cos(la), 0, r * Math.sin(la), tmp);
      const lx = this.cx + R * (small ? 0.5 : 0.72);
      let ly = this.cy + R * (small ? 0.16 : 0.1) + j * (small ? 12 : 15);
      const code = `DS·${String(j + 1).padStart(2, "0")} `;
      const label = small ? d.name.toUpperCase() : `${d.name.toUpperCase()}  ${kfmt(d.rows)}`;
      ctx.font = this.font(f1, 500);
      const w = ctx.measureText(code + label).width;
      for (let tries = 0; tries < 4 && !this.free(lx, ly - 6, w, 12); tries++) ly += small ? 12 : 15;
      this.labelBoxes.push({ x: lx, y: ly - 6, w, h: 12 });
      ctx.globalAlpha = rev;
      ctx.strokeStyle = `rgba(${LUM},0.22)`;
      ctx.beginPath();
      ctx.moveTo(tmp.x, tmp.y);
      ctx.lineTo(lx - 10, ly);
      ctx.lineTo(lx - 3, ly);
      ctx.stroke();
      ctx.fillStyle = `rgba(${LUM},0.85)`;
      ctx.beginPath();
      ctx.arc(tmp.x, tmp.y, 1.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(${LUM},0.42)`;
      ctx.fillText(code, lx, ly);
      ctx.fillStyle = `rgba(${LUM},0.86)`;
      ctx.fillText(decode(label, rev, j * 5, t), lx + ctx.measureText(code).width, ly);
    });
    ctx.globalAlpha = 1;

    /* agents: halos and catalog labels that dodge each other */
    const agentOrder = bp.agents.map((_, i) => i).sort((a, b) => (this.agentPos[a]?.y ?? 0) - (this.agentPos[b]?.y ?? 0));
    for (const i of agentOrder) {
      const ag = bp.agents[i];
      const p = this.agentPos[i];
      if (!p) continue;
      const rev = ease((t - (this.born.get(ag.id) ?? 0) - 0.5) / 1.0);
      if (rev <= 0) continue;
      ctx.globalAlpha = rev;
      const ask = ag.perms.includes("ask");
      const hr = 0.05 * R * p.s * 2.1;
      ctx.strokeStyle = ask ? `rgba(${SIG},0.8)` : `rgba(${LUM},0.35)`;
      if (ask) {
        ctx.setLineDash([2.5, 3.5]);
        ctx.lineDashOffset = -t * 10;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, hr, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      if (ask) {
        const pr = (t * 0.9 + i * 0.2) % 1;
        ctx.strokeStyle = `rgba(${SIG},${0.45 * (1 - pr)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, hr + pr * 12, 0, TAU);
        ctx.stroke();
      }
      const hover = Math.hypot(this.pointer.x - p.x, this.pointer.y - p.y) < hr + 18;
      const code = `AG·${String(i + 1).padStart(2, "0")} `;
      const name = decode(ag.name.toUpperCase(), rev, i * 11, t);
      const sub = hover ? ag.job.toUpperCase() : permLine(ag.perms);
      ctx.font = this.font(f1, 500);
      const w1 = ctx.measureText(code + name).width;
      ctx.font = this.font(f2, 400);
      const w2 = ctx.measureText(sub).width;
      const wmax = Math.max(w1, w2);
      const lh = small ? 10 : 12;
      const pref = p.x >= this.cx - R * 0.1 ? 1 : -1;
      const cands: [number, number][] = [
        [pref, -1],
        [pref, 1],
        [-pref, -1],
        [-pref, 1],
      ];
      const prev = this.labelSide.get(ag.id);
      if (prev !== undefined) cands.unshift(cands.splice(prev, 1)[0]);
      let pick = cands[0];
      let ok = false;
      for (const c of cands) {
        const ey = p.y + c[1] * (hr + 10) + (c[1] > 0 ? 4 : 0);
        const tx = p.x + c[0] * (hr + 24);
        const bx = c[0] > 0 ? tx : tx - wmax;
        if (this.free(bx - 2, ey - 7, wmax + 4, lh + 12)) {
          pick = c;
          ok = true;
          break;
        }
      }
      const base: [number, number][] = [
        [pref, -1],
        [pref, 1],
        [-pref, -1],
        [-pref, 1],
      ];
      this.labelSide.set(ag.id, Math.max(0, base.findIndex((c) => c[0] === pick[0] && c[1] === pick[1])));
      const [side, vert] = pick;
      const ex = p.x + side * (hr + 10);
      const ey = p.y + vert * (hr + 10) + (vert > 0 ? 4 : 0);
      const tx = ex + side * 14;
      const bx = side > 0 ? tx : tx - wmax;
      this.labelBoxes.push({ x: bx - 2, y: ey - 7, w: wmax + 4, h: lh + 12 });
      ctx.globalAlpha = rev * (ok || hover ? 1 : 0.35);
      ctx.strokeStyle = `rgba(${LUM},0.35)`;
      ctx.beginPath();
      ctx.moveTo(p.x + side * hr * 0.72, p.y + vert * hr * 0.72);
      ctx.lineTo(ex, ey);
      ctx.lineTo(ex + side * 10, ey);
      ctx.stroke();
      ctx.textAlign = side > 0 ? "left" : "right";
      ctx.font = this.font(f1, 500);
      if (side > 0) {
        ctx.fillStyle = `rgba(${LUM},0.42)`;
        ctx.fillText(code, tx, ey);
        ctx.fillStyle = `rgba(${LUM},0.96)`;
        ctx.fillText(name, tx + ctx.measureText(code).width, ey);
      } else {
        ctx.fillStyle = `rgba(${LUM},0.96)`;
        ctx.fillText(name, tx, ey);
        ctx.fillStyle = `rgba(${LUM},0.42)`;
        ctx.fillText(code, tx - ctx.measureText(name).width, ey);
      }
      ctx.font = this.font(f2, 400);
      ctx.fillStyle = ask ? `rgba(${SIG},0.95)` : `rgba(${LUM},0.5)`;
      ctx.fillText(sub, tx, ey + lh);
    }
    ctx.globalAlpha = 1;

    /* pointer reticle: bearing and range on the orbital plane */
    const ptx = this.pointer.x;
    const pty = this.pointer.y;
    if (ptx > 0 && pty > 0 && ptx < this.W && pty < this.H && !this.o.reducedMotion) {
      const dx = (ptx - this.cx) / R;
      const dy = (pty - this.cy) / (R * Math.sin(this.tiltNow));
      const rng = Math.hypot(dx, dy);
      const brg = ((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360;
      ctx.strokeStyle = `rgba(${SIG},0.75)`;
      ctx.beginPath();
      ctx.moveTo(ptx - 16, pty);
      ctx.lineTo(ptx - 7, pty);
      ctx.moveTo(ptx + 7, pty);
      ctx.lineTo(ptx + 16, pty);
      ctx.moveTo(ptx, pty - 16);
      ctx.lineTo(ptx, pty - 7);
      ctx.moveTo(ptx, pty + 7);
      ctx.lineTo(ptx, pty + 16);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${LUM},0.25)`;
      ctx.beginPath();
      ctx.arc(ptx, pty, 11, 0, TAU);
      ctx.stroke();
      ctx.font = this.font(f2, 400);
      ctx.textAlign = "left";
      ctx.fillStyle = `rgba(${LUM},0.6)`;
      ctx.fillText(`BRG ${brg.toFixed(0).padStart(3, "0")}°  RNG ${rng.toFixed(2)}`, ptx + 18, pty + 18);
    }

    /* bearing numerals last, and only where nothing else is speaking */
    ctx.font = this.font(small ? 7 : 8);
    ctx.fillStyle = `rgba(${LUM},0.3)`;
    ctx.textAlign = "center";
    ctx.globalAlpha = coreRev;
    for (let d = 0; d < 360; d += 30) {
      const a = (d * Math.PI) / 180;
      this.project((G + 0.11) * Math.cos(a), 0, (G + 0.11) * Math.sin(a), tmp);
      if (this.free(tmp.x - 10, tmp.y - 6, 20, 12)) ctx.fillText(String(d).padStart(3, "0"), tmp.x, tmp.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawFrame(k: number) {
    const bp = this.bp;
    const sp = this.screenPos[k];
    const foot = this.screenFoot[k];
    if (!bp || !sp || !foot) return;
    const scr = bp.screens[k];
    const ctx = this.ctx;
    const t = this.t;
    const rev = ease((t - (this.born.get(scr.id) ?? 0) - 0.15) / 1.1);
    if (rev <= 0) return;
    const { w, h } = this.frameSize(sp.s);
    const x = sp.x - w / 2;
    const y = sp.y - h / 2;
    const depth = clamp(0.55 + (sp.s - 0.85) * 1.6, 0.45, 1);
    ctx.globalAlpha = rev * depth;

    // drop line to the plane, like a star chart's elevation marker
    ctx.strokeStyle = `rgba(${LUM},0.18)`;
    ctx.setLineDash([1, 3]);
    ctx.beginPath();
    ctx.moveTo(sp.x, y + h);
    ctx.lineTo(foot.x, foot.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.ellipse(foot.x, foot.y, 4 * foot.s, 4 * foot.s * Math.sin(this.tiltNow), 0, 0, TAU);
    ctx.stroke();

    // body
    ctx.fillStyle = "rgba(10,13,18,0.72)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = `rgba(${LUM},0.025)`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = `rgba(${LUM},${0.1 + 0.25 * rev})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // corner brackets
    const b = Math.min(10, w * 0.12);
    ctx.strokeStyle = `rgba(${LUM},0.95)`;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(x - 2, y + b);
    ctx.lineTo(x - 2, y - 2);
    ctx.lineTo(x + b, y - 2);
    ctx.moveTo(x + w - b, y - 2);
    ctx.lineTo(x + w + 2, y - 2);
    ctx.lineTo(x + w + 2, y + b);
    ctx.moveTo(x + w + 2, y + h - b);
    ctx.lineTo(x + w + 2, y + h + 2);
    ctx.lineTo(x + w - b, y + h + 2);
    ctx.moveTo(x + b, y + h + 2);
    ctx.lineTo(x - 2, y + h + 2);
    ctx.lineTo(x - 2, y + h - b);
    ctx.stroke();
    ctx.lineWidth = 1;

    // interior sketch
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h * rev);
    ctx.clip();
    this.drawGlyph(scr.kind, x, y, w, h, k);
    // build scan
    const scan = (t * 0.35 + k * 0.23) % 1;
    const g = ctx.createLinearGradient(0, y + h * scan - 10, 0, y + h * scan);
    g.addColorStop(0, `rgba(${SIG},0)`);
    g.addColorStop(1, `rgba(${SIG},0.16)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y + h * scan - 10, w, 10);
    ctx.restore();

    // label
    ctx.textAlign = "left";
    const small = this.narrow;
    ctx.font = this.font(small ? 7 : 8, 500);
    const code = `SC·${String(k + 1).padStart(2, "0")} `;
    ctx.fillStyle = `rgba(${LUM},0.42)`;
    ctx.fillText(code, x - 2, y - 10);
    ctx.fillStyle = `rgba(${LUM},0.92)`;
    const nm = decode(scr.name.toUpperCase(), rev, k * 9, t);
    const cw = ctx.measureText(code).width;
    ctx.fillText(nm, x - 2 + cw, y - 10);
    this.labelBoxes.push({ x: x - 4, y: y - 18, w: Math.max(w + 8, cw + ctx.measureText(nm).width + 4), h: h + 22 });
    ctx.globalAlpha = 1;
  }

  private drawGlyph(kind: ScreenKind, x: number, y: number, w: number, h: number, k: number) {
    const ctx = this.ctx;
    const t = this.t;
    const p = Math.max(4, w * 0.08);
    const ix = x + p;
    const iy = y + p * 1.6;
    const iw = w - p * 2;
    const ih = h - p * 2.4;
    // title strip
    ctx.fillStyle = `rgba(${LUM},0.5)`;
    ctx.fillRect(ix, y + p * 0.7, iw * 0.28, 1.5);
    ctx.fillStyle = `rgba(${LUM},0.18)`;
    ctx.fillRect(ix + iw * 0.82, y + p * 0.7, iw * 0.18, 1.5);
    const line = (lx: number, ly: number, lw: number, a = 0.28, th = 1.5) => {
      ctx.fillStyle = `rgba(${LUM},${a})`;
      ctx.fillRect(lx, ly, lw, th);
    };
    const r = rng(k * 131 + kind.length);
    switch (kind) {
      case "inbox": {
        const rows = 4;
        for (let i = 0; i < rows; i++) {
          const ry = iy + (i + 0.5) * (ih / rows);
          const hot = i === Math.floor((t * 0.5) % rows);
          ctx.fillStyle = hot ? `rgba(${SIG},0.95)` : `rgba(${LUM},0.35)`;
          ctx.beginPath();
          ctx.arc(ix + 2, ry, 1.6, 0, TAU);
          ctx.fill();
          line(ix + 7, ry - 2, iw * (0.3 + r() * 0.2), 0.55);
          line(ix + 7, ry + 1.5, iw * (0.5 + r() * 0.3), 0.18, 1);
        }
        break;
      }
      case "approvals": {
        for (let i = 0; i < 2; i++) {
          const cy = iy + i * (ih / 2) + 1;
          const ch = ih / 2 - 3;
          ctx.strokeStyle = `rgba(${LUM},0.25)`;
          ctx.strokeRect(ix + 0.5, cy + 0.5, iw - 1, ch);
          line(ix + 4, cy + ch * 0.35, iw * 0.4, 0.5);
          ctx.fillStyle = i === 0 ? `rgba(${SIG},0.9)` : `rgba(${LUM},0.3)`;
          ctx.fillRect(ix + iw - iw * 0.22 - 3, cy + ch * 0.3, iw * 0.22, Math.max(3, ch * 0.4));
        }
        break;
      }
      case "payments": {
        line(ix, iy + 1, iw * 0.45, 0.8, Math.max(3, ih * 0.14));
        for (let i = 0; i < 3; i++) {
          const ry = iy + ih * 0.4 + i * (ih * 0.2);
          line(ix, ry, iw * 0.5, 0.25);
          line(ix + iw * 0.78, ry, iw * 0.22, 0.5);
        }
        break;
      }
      case "dashboard": {
        const bars = 7;
        const bw = iw / (bars * 1.6);
        for (let i = 0; i < bars; i++) {
          const bh = ih * 0.55 * (0.3 + 0.7 * Math.abs(Math.sin(i * 1.7 + k + t * 0.4)));
          ctx.fillStyle = i === bars - 1 ? `rgba(${SIG},0.9)` : `rgba(${LUM},0.35)`;
          ctx.fillRect(ix + i * bw * 1.6, iy + ih - bh, bw, bh);
        }
        ctx.strokeStyle = `rgba(${LUM},0.5)`;
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const lx = ix + (i / 12) * iw;
          const ly = iy + ih * 0.25 - Math.sin(i * 0.9 + t * 0.8) * ih * 0.1;
          if (i === 0) ctx.moveTo(lx, ly);
          else ctx.lineTo(lx, ly);
        }
        ctx.stroke();
        break;
      }
      case "form": {
        for (let i = 0; i < 3; i++) {
          const fy = iy + i * (ih * 0.27);
          line(ix, fy, iw * 0.25, 0.4, 1);
          ctx.strokeStyle = `rgba(${LUM},0.25)`;
          ctx.strokeRect(ix + 0.5, fy + 3.5, iw - 1, Math.max(4, ih * 0.13));
        }
        ctx.fillStyle = `rgba(${SIG},0.85)`;
        ctx.fillRect(ix, iy + ih - Math.max(4, ih * 0.14), iw * 0.34, Math.max(4, ih * 0.14));
        break;
      }
      case "chat": {
        for (let i = 0; i < 4; i++) {
          const mine = i % 2 === 1;
          const bw = iw * (0.35 + r() * 0.25);
          const by = iy + i * (ih / 4);
          ctx.fillStyle = mine ? `rgba(${LUM},0.4)` : `rgba(${LUM},0.14)`;
          ctx.fillRect(mine ? ix + iw - bw : ix, by, bw, Math.max(3, ih / 4 - 3));
        }
        break;
      }
      case "report": {
        line(ix, iy, iw * 0.6, 0.7, 2);
        for (let i = 0; i < 3; i++) line(ix, iy + 6 + i * 4, iw * (0.8 - i * 0.12), 0.22, 1);
        ctx.strokeStyle = `rgba(${SIG},0.8)`;
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
          const lx = ix + (i / 10) * iw;
          const ly = iy + ih - ih * 0.3 * (0.3 + 0.7 * (i / 10)) - Math.sin(i * 1.3) * ih * 0.06;
          if (i === 0) ctx.moveTo(lx, ly);
          else ctx.lineTo(lx, ly);
        }
        ctx.stroke();
        break;
      }
      case "calendar": {
        const cols = 7;
        const rows = 4;
        const cw = iw / cols;
        const rh = ih / rows;
        const hot = Math.floor((t * 0.3) % (cols * rows));
        for (let i = 0; i < cols * rows; i++) {
          ctx.fillStyle = i === hot ? `rgba(${SIG},0.9)` : `rgba(${LUM},${i % 5 === 0 ? 0.3 : 0.1})`;
          ctx.fillRect(ix + (i % cols) * cw + 1, iy + Math.floor(i / cols) * rh + 1, cw - 2, rh - 2);
        }
        break;
      }
      case "list": {
        for (let i = 0; i < 5; i++) {
          const ry = iy + i * (ih / 5) + 1;
          line(ix, ry, iw * 0.08, 0.4);
          line(ix + iw * 0.14, ry, iw * 0.36, 0.45);
          line(ix + iw * 0.58, ry, iw * 0.18, 0.2);
          ctx.fillStyle = i === 1 ? `rgba(${SIG},0.9)` : `rgba(${LUM},0.25)`;
          ctx.fillRect(ix + iw * 0.86, ry - 0.5, iw * 0.14, 2.5);
        }
        break;
      }
      default: {
        line(ix, iy, iw, 0.12, ih * 0.38);
        line(ix + 4, iy + ih * 0.14, iw * 0.4, 0.6, 2);
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = `rgba(${LUM},0.25)`;
          ctx.strokeRect(ix + i * (iw / 3) + 0.5, iy + ih * 0.52, iw / 3 - 3, ih * 0.44);
        }
      }
    }
  }

  private drawParticles2D() {
    const ctx = this.ctx;
    const buf = this.buf;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let tint = 0; tint < 2; tint++) {
      for (let lv = 1; lv <= 4; lv++) {
        ctx.fillStyle = tint ? `rgba(${SIG},${lv * 0.22})` : `rgba(${LUM},${lv * 0.18})`;
        ctx.beginPath();
        for (let i = 0; i < this.N; i++) {
          const o = i * 5;
          const b = buf[o + 3];
          if (b <= 0.02) continue;
          if ((buf[o + 4] > 0.5 ? 1 : 0) !== tint) continue;
          if (Math.min(4, Math.max(1, Math.ceil(b * 4))) !== lv) continue;
          const s = Math.max(1, buf[o + 2] * 0.8);
          ctx.rect(buf[o] - s / 2, buf[o + 1] - s / 2, s, s);
        }
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawScope() {
    const c = this.scopeCtx;
    const el = this.o.scope;
    if (!c || !el) return;
    const w = el.width;
    const h = el.height;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = "rgba(241,244,234,0.08)";
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 1; i < 8; i++) {
      c.moveTo((i / 8) * w, 0);
      c.lineTo((i / 8) * w, h);
    }
    c.moveTo(0, h / 2);
    c.lineTo(w, h / 2);
    c.stroke();
    const n = this.scope.length;
    c.strokeStyle = `rgba(${SIG},0.95)`;
    c.lineWidth = Math.max(1, w / 240);
    c.shadowColor = `rgba(${SIG},0.6)`;
    c.shadowBlur = 6;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const v = this.scope[(this.scopeHead + i) % n];
      const x = (i / (n - 1)) * w;
      const y = h / 2 - clamp(v, -1.2, 1.2) * h * 0.4;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    c.shadowBlur = 0;
  }

  /* ------------------------------------------------------- still mode */

  renderStill() {
    if (!this.bp) return;
    this.t = 9;
    this.born.forEach((_, id) => this.born.set(id, -10));
    this.slots.forEach((s) => (s.born = -10));
    this.assignT.fill(-10);
    this.energy = 0;
    this.ripples = [];
    this.sweep = 5.2;
    this.layout(0);
    // settle: many silent steps so every body sits on its mark
    for (let i = 0; i < 90; i++) this.simulate(1 / 60);
    this.draw();
    this.o.onStats?.({ fps: 0, particles: this.N, kps: 0, energy: 0, gl: !!this.gl });
  }
}
