import "server-only";
import { importMap, PACKAGES, TAILWIND_BROWSER } from "./packages";

/**
 * The page a code app runs in (/run/p/[projectId] and /run/live/[slug]). Its own Content-Security-Policy
 * starts with `sandbox`, so the page gets an opaque origin: it can't read Prod AI's cookies or storage,
 * can't call Prod AI's API as anyone, and can't touch the page around it. It talks to that page only by
 * postMessage, through the SDK below (window.prod, docs/CODE-APPS.md). Scripts come only from the page
 * itself (inline) and the two package CDNs; nothing else loads code.
 */

export const SANDBOX_CSP = [
  "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock",
  "default-src 'none'",
  "script-src 'unsafe-inline' https://esm.sh https://cdn.jsdelivr.net",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com data:",
  "img-src * data: blob:",
  "media-src * data: blob:",
  "connect-src https://esm.sh https://cdn.jsdelivr.net",
  "frame-ancestors 'self'",
].join("; ");

export type SandboxMode = "preview" | "live";

/**
 * The build (lib/code-apps/build.ts) ends its bundle with this comment and a table from the bundle's lines to
 * the app's files and lines, so a runtime error can say where it came from. Kept here so the sandbox pages
 * never load the bundler.
 */
export const LINE_TABLE_MARK = "\n//# prodLines=";

/** The headers every sandbox response carries, the page or its "not here" note. */
export function sandboxHeaders(mode: SandboxMode, extra?: Record<string, string>): Headers {
  return new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": SANDBOX_CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    // The test version changes with every build; a live build is checked again on every visit (its ETag is the build's hash).
    "Cache-Control": mode === "preview" ? "no-store" : "no-cache",
    ...extra,
  });
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
/** Inline script text can't end its own element early or open an HTML comment state. */
const inlineScript = (s: string) => s.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
const inlineStyle = (s: string) => s.replace(/<\/(style)/gi, "<\\/$1");
/** JSON that is safe inside a script element. */
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/**
 * The test version loads React's development builds (esm.sh's `dev`), so a runtime error reads in full
 * words for the person and for the repair loop, not as a minified error number.
 */
function devImportMap(): string {
  return JSON.stringify({ imports: Object.fromEntries(Object.entries(PACKAGES).map(([k, v]) => [k, `${v.url}${v.url.includes("?") ? "&" : "?"}dev`])) });
}

/**
 * The app's stylesheet, placed for Tailwind's browser build: web-font imports go in a plain style element;
 * a stylesheet that uses Tailwind's own at-rules (@apply, @theme, ...) is handed to Tailwind
 * (type="text/tailwindcss", after its import); anything else is plain CSS. The app's own
 * `@import "tailwindcss"` is dropped: Tailwind is already on the page.
 */
export function placeCss(css: string): { imports: string; css: string; tailwind: boolean } {
  const imports: string[] = [];
  let body = css.replace(/@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^"')\s;]+))\s*\)?[^;]*;/g, (rule, a?: string, b?: string, c?: string) => {
    const spec = a ?? b ?? c ?? "";
    if (/^tailwindcss(\/|$)/.test(spec)) return "";
    if (/^https:\/\//i.test(spec)) imports.push(rule);
    return "";
  });
  body = body.trim();
  const tailwind = /@(apply|theme|utility|variant|custom-variant|source|plugin|config|reference)\b/.test(body);
  return { imports: imports.join("\n"), css: body, tailwind };
}

/** The bundle without its line table, and the table (bundle line to file and line) for the SDK. */
function splitLines(js: string): { js: string; lines: { sources: string[]; table: number[][] } | null } {
  const at = js.lastIndexOf(LINE_TABLE_MARK);
  if (at < 0) return { js, lines: null };
  try {
    const lines = JSON.parse(js.slice(at + LINE_TABLE_MARK.length)) as { sources: string[]; table: number[][] };
    if (Array.isArray(lines.sources) && Array.isArray(lines.table)) return { js: js.slice(0, at), lines };
  } catch {
    // An unreadable table only costs file names in runtime errors.
  }
  return { js: js.slice(0, at), lines: null };
}

/**
 * window.prod and the page's error reporting, inline and before anything else runs. Plain ES2020 so it
 * works in every browser that runs the app. CFG is { mode, lines }.
 */
const SDK = String.raw`(function () {
  "use strict";
  var CFG = __CFG__;
  var parentWin = window.parent && window.parent !== window ? window.parent : null;
  function post(msg) { if (!parentWin) return; try { parentWin.postMessage(msg, "*"); } catch (e) { /* the host is gone */ } }

  /* A sandboxed page has no storage of its own. Apps that keep things in localStorage get a stand-in
     that lasts while the page is open, instead of crashing. */
  function memoryStorage() {
    var m = new Map();
    return {
      get length() { return m.size; },
      key: function (i) { var k = Array.from(m.keys())[i]; return k === undefined ? null : k; },
      getItem: function (k) { k = String(k); return m.has(k) ? m.get(k) : null; },
      setItem: function (k, v) { m.set(String(k), String(v)); },
      removeItem: function (k) { m.delete(String(k)); },
      clear: function () { m.clear(); }
    };
  }
  ["localStorage", "sessionStorage"].forEach(function (name) {
    try { window[name].getItem("prod"); } catch (e) {
      try { Object.defineProperty(window, name, { value: memoryStorage(), configurable: true, enumerable: true }); } catch (e2) { /* left as it is */ }
    }
  });

  /* Requests to the host page: one id each, a timeout each, and a plain error when something is off. */
  var pending = new Map();
  var seq = 0;
  function fail(message) { var e = new Error(message); e.name = "ProdError"; return e; }
  function call(method, args) {
    if (!parentWin) return Promise.reject(fail("This app saves data and uses AI only inside Prod AI. Open it from its Prod AI link."));
    return new Promise(function (resolve, reject) {
      var id = "q" + (++seq) + "-" + Math.random().toString(36).slice(2, 10);
      var ms = method === "ai.ask" ? 90000 : 20000;
      var timer = setTimeout(function () {
        pending.delete(id);
        reject(fail(method === "ai.ask" ? "The AI took too long to answer. Try again." : "Prod AI didn't answer in time. Try again."));
      }, ms);
      pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      try { parentWin.postMessage({ type: "prod:req", id: id, method: method, args: args }, "*"); }
      catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        reject(fail("That can't be sent: use plain values (text, numbers, true or false, lists and objects)."));
      }
    });
  }
  var NAME = /^[a-z][a-z0-9_]{0,39}$/;
  function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function needCollection(c) { if (typeof c !== "string" || !NAME.test(c)) throw fail('A collection name is lowercase letters, digits and _, like "scores".'); }
  function needValues(v) { if (!isObject(v)) throw fail('Records are plain objects, like { name: "Ana", points: 42 }.'); }
  function needId(id) { if (typeof id !== "string" || !id) throw fail("That needs the record's id."); }
  function guarded(fn) { return function () { try { return fn.apply(null, arguments); } catch (e) { return Promise.reject(e); } }; }

  var user = CFG.mode === "live" ? { role: "visitor", name: "Visitor" } : { role: "preview", name: "You" };
  var ROLES = { owner: 1, member: 1, visitor: 1, preview: 1 };

  window.addEventListener("message", function (e) {
    if (!parentWin || e.source !== parentWin) return;
    var d = e.data;
    if (!isObject(d)) return;
    if (d.type === "prod:res" && pending.has(d.id)) {
      var p = pending.get(d.id);
      pending.delete(d.id);
      clearTimeout(p.timer);
      if (d.ok) p.resolve(d.result === undefined ? null : d.result);
      else p.reject(fail(typeof d.error === "string" && d.error ? d.error.slice(0, 500) : "That didn't work."));
    } else if (d.type === "prod:init" && isObject(d.user)) {
      if (ROLES[d.user.role] === 1) user = { role: d.user.role, name: typeof d.user.name === "string" ? d.user.name.slice(0, 80) : user.name };
    }
  });

  var prod = {
    data: Object.freeze({
      list: guarded(function (collection, opts) {
        needCollection(collection);
        var limit = isObject(opts) && typeof opts.limit === "number" ? Math.max(1, Math.min(200, Math.floor(opts.limit))) : 50;
        return call("data.list", [collection, { limit: limit }]);
      }),
      add: guarded(function (collection, values) { needCollection(collection); needValues(values); return call("data.add", [collection, values]); }),
      update: guarded(function (collection, id, values) { needCollection(collection); needId(id); needValues(values); return call("data.update", [collection, id, values]); }),
      remove: guarded(function (collection, id) { needCollection(collection); needId(id); return call("data.remove", [collection, id]); })
    }),
    ai: Object.freeze({
      ask: guarded(function (prompt) {
        if (typeof prompt !== "string" || !prompt.trim()) throw fail("prod.ai.ask needs a question, as text.");
        if (prompt.length > 4000) throw fail("A question can be at most 4,000 characters.");
        return call("ai.ask", [prompt]);
      })
    }),
    user: function () { return { role: user.role, name: user.name }; }
  };
  Object.defineProperty(window, "prod", { value: Object.freeze(prod), enumerable: true });

  /* Where a runtime error came from: the bundle's line (it runs as prod-app.js) mapped back to a file and line. */
  function locate(stack, where) {
    var m = typeof stack === "string" ? /prod-app\.js:(\d+):(\d+)/.exec(stack) : null;
    /* Without a stack, the error event's line counts only when the event says it came from the bundle. */
    var L = m ? Number(m[1]) : where && where.line && /prod-app\.js$/.test(where.file || "") ? where.line : 0;
    if (!L || !CFG.lines) return null;
    var t = CFG.lines.table, hit = null;
    for (var i = 0; i < t.length && t[i][0] <= L - 1; i++) hit = t[i];
    if (!hit || !CFG.lines.sources[hit[1]]) return null;
    /* The table maps lines, not columns: the bundle's column says nothing about the file's. */
    return { file: CFG.lines.sources[hit[1]], line: hit[2] + (L - 1 - hit[0]) + 1 };
  }

  var reported = 0, seen = new Set(), overlay = null, started = false;
  function text(v) { try { return typeof v === "string" ? v : v instanceof Error ? v.message : JSON.stringify(v); } catch (e) { return String(v); } }
  function report(err, where, extraStack) {
    var message = (err && err.message ? String(err.message) : text(err) || "Something went wrong").slice(0, 2000);
    if (err && err.name && err.name !== "Error" && message.indexOf(err.name) !== 0) message = err.name + ": " + message;
    var stack = err && typeof err.stack === "string" ? err.stack.slice(0, 4000) : undefined;
    if (extraStack) stack = ((stack || "") + "\nIn the component tree:" + String(extraStack).slice(0, 1500)).trim();
    var key = message + "|" + (stack || "").slice(0, 300);
    if (seen.has(key) || reported >= 20) return;
    seen.add(key);
    reported++;
    var loc = locate(stack, where);
    var msg = { type: "prod:error", message: message, stack: stack, started: started };
    if (loc) { msg.source = loc.file + ":" + loc.line; msg.file = loc.file; msg.line = loc.line; }
    post(msg);
    show(message, msg.source);
  }

  /* A small note in the corner with what went wrong, which anyone can dismiss. */
  function show(message, source) {
    if (!document.body) { document.addEventListener("DOMContentLoaded", function () { show(message, source); }); return; }
    if (overlay) overlay.remove();
    var box = document.createElement("div");
    box.setAttribute("role", "alert");
    box.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483647;max-width:min(440px,calc(100vw - 24px));background:#fff;color:#1f2937;border:1px solid #e5e7eb;border-left:4px solid #b91c1c;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:12px 14px;font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif";
    var title = document.createElement("div");
    title.style.cssText = "font-weight:600;margin-bottom:4px";
    title.textContent = CFG.mode === "live" ? "Something went wrong in this app" : "The app hit an error";
    var body = document.createElement("div");
    body.style.cssText = "white-space:pre-wrap;word-break:break-word;max-height:7.5em;overflow:auto";
    body.textContent = message.length > 400 ? message.slice(0, 400) + "..." : message;
    box.appendChild(title);
    box.appendChild(body);
    if (source && CFG.mode !== "live") {
      var where = document.createElement("div");
      where.style.cssText = "margin-top:4px;color:#6b7280;font:12px ui-monospace,SFMono-Regular,Menlo,monospace";
      where.textContent = source;
      box.appendChild(where);
    }
    var close = document.createElement("button");
    close.type = "button";
    close.textContent = "Dismiss";
    close.style.cssText = "margin-top:8px;background:none;border:1px solid #d1d5db;border-radius:6px;padding:2px 10px;font:inherit;cursor:pointer;color:inherit";
    close.onclick = function () { box.remove(); overlay = null; };
    box.appendChild(close);
    document.body.appendChild(box);
    overlay = box;
  }

  window.addEventListener("error", function (e) {
    var t = e.target;
    if (t && t !== window && t.nodeType === 1) {
      /* A file failed to load. Only the app's own code matters: a missing image isn't an error in the app. */
      if (t.tagName === "SCRIPT" && (t.id === "prod-app" || t.type === "module")) report(fail("The app couldn't load one of its packages. Check the connection and reload."), null);
      return;
    }
    report(e.error || fail(e.message || "Script error"), { line: e.lineno, file: e.filename });
  }, true);
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    report(r instanceof Error ? r : fail("A promise failed: " + text(r)), null);
  });

  Object.defineProperty(window, "__prodHost", {
    value: Object.freeze({
      mounted: function () { if (started) return; started = true; post({ type: "prod:ready" }); },
      reactError: function (error, componentStack) { report(error instanceof Error ? error : fail(text(error)), null, componentStack); }
    })
  });
})();`;

/**
 * The full sandbox page for a build: the import map, the SDK, Tailwind's browser build, the app's CSS and
 * the bundle as an inline module mounted into #root. Nothing in it comes from the browser.
 */
export function sandboxPage(p: { js: string; css: string; title: string; mode: SandboxMode }): string {
  const { js, lines } = splitLines(p.js);
  const css = placeCss(p.css);
  const sdk = SDK.replace("__CFG__", () => scriptJson({ mode: p.mode, lines }));
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(p.title.slice(0, 80) || "App")}</title>`,
    `<script type="importmap">${inlineScript(p.mode === "preview" ? devImportMap() : importMap())}</script>`,
    `<script>${inlineScript(sdk)}</script>`,
    `<script src="${TAILWIND_BROWSER}"></script>`,
    "<style>html,body{min-height:100%}body{margin:0}</style>",
    css.imports ? `<style>${inlineStyle(css.imports)}</style>` : "",
    css.css ? (css.tailwind ? `<style type="text/tailwindcss">@import "tailwindcss";\n${inlineStyle(css.css)}</style>` : `<style>${inlineStyle(css.css)}</style>`) : "",
    "</head>",
    "<body>",
    '<div id="root"></div>',
    `<script type="module" id="prod-app">${inlineScript(js.trimEnd())}\n//# sourceURL=prod-app.js</script>`,
    "</body>",
    "</html>",
  ]
    .filter(Boolean)
    .join("\n");
}

/** A small page in the sandbox's place when there's nothing to run (not found, or no working build yet). */
export function sandboxNotice(message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Not here</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#4b5563;background:#fafaf9"><p style="padding:24px;text-align:center">${escapeHtml(message)}</p></body></html>`;
}
