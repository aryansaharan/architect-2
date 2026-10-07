"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Manifest } from "@/lib/code-apps/schema";
import { cn } from "@/lib/utils";

/**
 * The host side of a code app's sandbox (docs/CODE-APPS.md, "The SDK"). The app runs in an iframe of
 * /run/p/[projectId] (the studio's test version) or /run/live/[slug] (the published app). That page has an
 * opaque origin, so it can reach Prod AI only by postMessage, and only through this component:
 *
 * - Messages are accepted only from this iframe's own window (event.source), never from anything else.
 * - prod:init tells the app who is using it once the frame loads; prod:ready and prod:error are reported up.
 * - Requests: data.* is kept in memory here for a test version (per frame session: it resets when the frame
 *   reloads) or forwarded to the live data API; ai.ask goes to the preview or live AI API, where the server
 *   checks who is asking, the price and the limits. The host never decides anything the server enforces.
 */

export type FrameUser = { role: "owner" | "member" | "visitor" | "preview"; name: string };
export type FrameError = { message: string; stack?: string; source?: string; file?: string; line?: number; column?: number; started?: boolean };
export type FrameState = "waiting" | "ready" | "failed" | "slow";

type Method = "data.list" | "data.add" | "data.update" | "data.remove" | "ai.ask" | "user";
const METHODS = new Set<Method>(["data.list", "data.add", "data.update", "data.remove", "ai.ask", "user"]);

/** The same sandbox the page asks for in its own Content-Security-Policy: scripts, never the parent's origin. */
const SANDBOX = "allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock";

/** Limits mirrored from the server (lib/code-apps/data.ts), so a test version fails the same way the live app would. */
const LIMITS = { bytes: 4_000, keyChars: 40, keys: 60, depth: 4, listItems: 200, listMax: 200, listDefault: 50, records: 2_000 } as const;
const PROMPT_MAX = 4_000;
/** A runaway test version can't run up the owner's credits: the server meters each call, this stops a loop early. */
const AI_CALLS_PER_SESSION = 40;
const RESERVED = new Set(["id", "createdAt", "__proto__", "constructor", "prototype"]);

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type Rec = { [k: string]: Json } & { id: string; createdAt: string };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

function cleanValue(v: unknown, depth: number): Json | undefined {
  if (v === null || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (depth >= LIMITS.depth) throw new Error(`A record can nest at most ${LIMITS.depth} levels deep.`);
  if (Array.isArray(v)) {
    if (v.length > LIMITS.listItems) throw new Error(`A list in a record can hold at most ${LIMITS.listItems} items.`);
    return v.map((x) => cleanValue(x, depth + 1) ?? null);
  }
  if (isPlainObject(v)) return cleanObject(v, depth + 1, false);
  throw new Error("A record can hold text, numbers, true or false, lists and plain objects only.");
}

function cleanObject(v: Record<string, unknown>, depth: number, top: boolean): { [k: string]: Json } {
  const entries = Object.entries(v);
  if (entries.length > LIMITS.keys) throw new Error(`A record can have at most ${LIMITS.keys} fields.`);
  const out: { [k: string]: Json } = {};
  for (const [k, x] of entries) {
    if (!k || (top && RESERVED.has(k)) || k === "__proto__") continue;
    if (k.length > LIMITS.keyChars) throw new Error(`A field name can be at most ${LIMITS.keyChars} characters ("${k.slice(0, 20)}...").`);
    const c = cleanValue(x, depth);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

const sizeOf = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/** A record's fields from the app, cleaned exactly as the live data API cleans them: plain JSON only, short keys, at most 4 KB. */
function cleanFields(raw: unknown): { [k: string]: Json } {
  if (!isPlainObject(raw)) throw new Error('Records are plain objects, like { name: "Ana", points: 42 }.');
  const values = cleanObject(raw, 0, true);
  const bytes = sizeOf(values);
  if (bytes > LIMITS.bytes) throw new Error(`That record is ${Math.ceil(bytes / 100) / 10} KB; a record can be at most 4 KB.`);
  return values;
}

export function CodeAppFrame({
  mode,
  projectId,
  hash,
  slug,
  manifest,
  user,
  onReady,
  onError,
  onStateChange,
  readyTimeoutMs = 30_000,
  title = "The app",
  className,
  overlayClassName,
}: {
  mode: "preview" | "live";
  /** Preview: the project whose latest build runs. */
  projectId?: string;
  /** The build's hash: the frame's address carries it, so a new build always loads fresh. */
  hash?: string;
  /** Live: the published site. */
  slug?: string;
  /** Preview: which collections the app may use (the live API reads the published manifest itself). */
  manifest?: Pick<Manifest, "collections"> | null;
  user: FrameUser;
  onReady?: () => void;
  onError?: (e: FrameError) => void;
  onStateChange?: (s: FrameState) => void;
  /** How long to wait for the app's first render before saying it didn't start. */
  readyTimeoutMs?: number;
  title?: string;
  className?: string;
  /** The "Waiting for the app to start…" cover: the studio's paper in preview, neutral in live; a caller can restyle it. */
  overlayClassName?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const src =
    mode === "preview"
      ? `/run/p/${encodeURIComponent(projectId ?? "")}${hash ? `?b=${encodeURIComponent(hash)}` : ""}`
      : `/run/live/${encodeURIComponent(slug ?? "")}${hash ? `?b=${encodeURIComponent(hash)}` : ""}`;
  // A new address is a new session: waiting for the app to start again, with fresh records.
  const [session, setSession] = useState<{ src: string; state: FrameState }>({ src, state: "waiting" });
  const state: FrameState = session.src === src ? session.state : "waiting";
  // The test version's records and AI calls, for this frame session only.
  const store = useRef<{ src: string; records: Map<string, Rec[]>; aiCalls: number }>({ src, records: new Map(), aiCalls: 0 });
  const sessionStore = () => {
    if (store.current.src !== src) store.current = { src, records: new Map(), aiCalls: 0 };
    return store.current;
  };

  const move = useEffectEvent((s: FrameState) => {
    setSession({ src, state: s });
    onStateChange?.(s);
  });

  const timedOut = useEffectEvent(() => {
    if (state !== "waiting") return;
    move("slow");
    onError?.({ message: `The app didn't start within ${Math.round(readyTimeoutMs / 1000)} seconds.`, source: "start" });
  });

  useEffect(() => {
    if (state !== "waiting") return;
    const t = setTimeout(timedOut, readyTimeoutMs);
    return () => clearTimeout(t);
  }, [state, readyTimeoutMs, src]);

  const handle = useEffectEvent(async (method: Method, args: unknown[]): Promise<unknown> => {
    if (method === "user") return { role: user.role, name: user.name };
    if (method === "ai.ask") {
      const prompt = typeof args[0] === "string" ? args[0] : "";
      if (!prompt.trim()) throw new Error("prod.ai.ask needs a question");
      if (prompt.length > PROMPT_MAX) throw new Error(`A question can be at most ${PROMPT_MAX} characters`);
      if (mode === "preview" && ++sessionStore().aiCalls > AI_CALLS_PER_SESSION) throw new Error("This test version has asked the AI a lot. Reload it to ask more.");
      const url = mode === "preview" ? `/api/code-apps/p/${encodeURIComponent(projectId ?? "")}/ai` : `/api/code-apps/live/${encodeURIComponent(slug ?? "")}/ai`;
      const j = await post(url, { prompt });
      const answer = j.answer ?? j.text ?? j.result;
      if (typeof answer !== "string") throw new Error("The AI didn't answer. Try again.");
      return answer;
    }
    // data.*
    const collection = typeof args[0] === "string" ? args[0] : "";
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(collection)) throw new Error("A collection name is lowercase letters, digits and _");
    const op = method.slice(5) as "list" | "add" | "update" | "remove";
    if (mode === "live") {
      const body: Record<string, unknown> = { op, collection };
      if (op === "list") body.limit = limitOf(args[1]);
      if (op === "add") body.fields = args[1];
      if (op === "update") Object.assign(body, { id: args[1], fields: args[2] });
      if (op === "remove") body.id = args[1];
      const j = await post(`/api/code-apps/live/${encodeURIComponent(slug ?? "")}/data`, body);
      return "result" in j ? j.result : (j.records ?? j.record ?? j.ok ?? null);
    }
    // The test version: in memory, with the same rules the live app has.
    const known = manifest?.collections?.find((c) => c.name === collection);
    if (manifest && !known) throw new Error(`This app has no collection called "${collection}". It keeps: ${manifest.collections.map((c) => c.name).join(", ") || "nothing"}.`);
    const records = sessionStore().records;
    const list = records.get(collection) ?? [];
    const idOf = (v: unknown) => {
      if (typeof v !== "string" || !v) throw new Error("That needs the record's id.");
      return v;
    };
    switch (op) {
      case "list":
        return list.slice(0, limitOf(args[1])).map((r) => structuredClone(r));
      case "add": {
        const total = [...records.values()].reduce((n, l) => n + l.length, 0);
        if (total >= LIMITS.records) throw new Error(`This app keeps the most records it can (${LIMITS.records}). Remove some first.`);
        const rec: Rec = { ...cleanFields(args[1]), id: crypto.randomUUID(), createdAt: new Date().toISOString() };
        records.set(collection, [rec, ...list]);
        return structuredClone(rec);
      }
      case "update": {
        const id = idOf(args[1]);
        const at = list.findIndex((r) => r.id === id);
        if (at === -1) throw new Error("That record isn't there any more.");
        const values = cleanFields(args[2]);
        if (!Object.keys(values).length) throw new Error("Nothing to change.");
        // null clears a field; the whole record still has to fit in 4 KB.
        const { id: _id, createdAt, ...fields } = list[at];
        const merged: { [k: string]: Json } = { ...fields };
        for (const [k, v] of Object.entries(values)) {
          if (v === null) delete merged[k];
          else merged[k] = v;
        }
        if (sizeOf(merged) > LIMITS.bytes) throw new Error("With that change the record would be over 4 KB.");
        const next: Rec = { ...merged, id: _id, createdAt };
        records.set(collection, list.map((r, i) => (i === at ? next : r)));
        return structuredClone(next);
      }
      case "remove": {
        const id = idOf(args[1]);
        if (!list.some((r) => r.id === id)) throw new Error("That record isn't there any more.");
        records.set(collection, list.filter((r) => r.id !== id));
        return { ok: true, id };
      }
    }
  });

  const onMessage = useEffectEvent((e: MessageEvent) => {
    const win = frame.current?.contentWindow;
    // Only this frame's own window: no other page, frame or extension can speak for the app.
    if (!win || e.source !== win) return;
    const d = e.data as unknown;
    if (!isPlainObject(d) || typeof d.type !== "string") return;
    if (d.type === "prod:ready") {
      if (state !== "ready") {
        move("ready");
        onReady?.();
      }
      return;
    }
    if (d.type === "prod:error") {
      const message = typeof d.message === "string" && d.message.trim() ? d.message.slice(0, 2000) : "The app hit an error";
      if (state === "waiting" || state === "slow") move("failed");
      const num = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 && v < 1e6 ? v : undefined);
      onError?.({
        message,
        stack: typeof d.stack === "string" ? d.stack.slice(0, 4000) : undefined,
        source: typeof d.source === "string" ? d.source.slice(0, 200) : undefined,
        file: typeof d.file === "string" ? d.file.slice(0, 200) : undefined,
        line: num(d.line),
        column: num(d.column),
        started: d.started === true,
      });
      return;
    }
    if (d.type === "prod:req") {
      const id = d.id;
      if (typeof id !== "string" && typeof id !== "number") return;
      const reply = (msg: { ok: true; result: unknown } | { ok: false; error: string }) => win.postMessage({ type: "prod:res", id, ...msg }, "*");
      const method = d.method as Method;
      if (!METHODS.has(method) || !Array.isArray(d.args)) return reply({ ok: false, error: "Prod AI doesn't know that request" });
      handle(method, d.args.slice(0, 4)).then(
        (result) => reply({ ok: true, result: result ?? null }),
        (err: unknown) => reply({ ok: false, error: err instanceof Error ? err.message : "That didn't work" }),
      );
    }
  });

  useEffect(() => {
    const listen = (e: MessageEvent) => onMessage(e);
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, []);

  return (
    <div className={cn("relative h-full w-full", className)}>
      <iframe
        ref={frame}
        key={src}
        src={src}
        title={title}
        sandbox={SANDBOX}
        referrerPolicy="no-referrer"
        // The app learns who is using it, and whether its data is kept, once its page has loaded.
        onLoad={() => frame.current?.contentWindow?.postMessage({ type: "prod:init", user: { role: user.role, name: user.name }, mode }, "*")}
        className="block h-full w-full border-0 bg-raised"
      />
      {(state === "waiting" || state === "slow") &&
        (mode === "preview" ? (
          // The studio: the paper's own words while it starts.
          <div role="status" className={cn("absolute inset-0 grid place-items-center bg-raised px-6 text-center", overlayClassName)}>
            <div>
              <p className="font-pencil text-note text-muted-foreground">{state === "slow" ? "The app hasn't started." : "Waiting for the app to start…"}</p>
              {state === "slow" && <p className="mt-1 text-meta text-muted-foreground">It may still be loading its packages. It shows here the moment it starts.</p>}
            </div>
          </div>
        ) : (
          // A published app: neutral, so nothing of the studio flashes before the app's own look.
          <div role="status" className={cn("absolute inset-0 grid place-items-center bg-white px-6 text-center font-sans text-sm text-slate-500", overlayClassName)}>
            <p>{state === "slow" ? "Still loading. It shows here the moment it starts." : "Loading…"}</p>
          </div>
        ))}
    </div>
  );
}

function limitOf(v: unknown): number {
  const n = isPlainObject(v) && typeof v.limit === "number" && Number.isFinite(v.limit) ? Math.floor(v.limit) : LIMITS.listDefault;
  return Math.max(1, Math.min(LIMITS.listMax, n));
}

async function post(url: string, body: unknown): Promise<Record<string, unknown>> {
  let r: Response;
  try {
    r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Couldn't reach Prod AI. Check the connection and try again.");
  }
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok || j.ok === false) throw new Error(typeof j.error === "string" ? j.error : "That didn't work. Try again.");
  return j;
}
