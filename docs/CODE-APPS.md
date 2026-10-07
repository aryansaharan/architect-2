# Code apps: real code, real builds, a real sandbox

Prod AI makes two kinds of app:

- **Business apps** (as before): a Blueprint shown by the renderer, with records, AI helpers, approvals.
- **Code apps** (new): Claude writes real source files for any kind of web app (a game, a portfolio,
  a quiz, a tool), Prod AI really builds them, runs them in a sealed sandbox, repairs real errors, and
  publishes the build. Claude picks the kind; the person can switch it before planning.

Shared definitions: `lib/code-apps/schema.ts` (files, manifest, build result), `lib/code-apps/packages.ts`
(allowed packages and the import map), `lib/prices.ts` (`codeApp` 100, `codeChange` 20). Database:
`supabase/migrations/20261008000000_code_apps.sql` (`projects.kind/code/build`, `checkpoints.code`,
`live_sites.kind/build`).

## The app's shape

- Files: React 19 function components in `.jsx`/`.tsx` (and `.js`/`.ts`, `.css`, `.json`). Entry:
  `App.jsx` (or `App.tsx`) with a default export. Relative imports between files (`./components/Board`).
- Styling: Tailwind utility classes (the browser build of Tailwind is loaded in the sandbox) and plain CSS
  files imported from code.
- Packages: only those in `lib/code-apps/packages.ts`; anything else fails the build with a plain message.
- Manifest: `title`, `tagline`, `kind` ("a memory game"), `collections` (each with `read` and `write`:
  `public` or `team`), `usesAI`.
- Limits: 24 files, 60 KB a file, 300 KB total.

## Lifecycle and who owns what

1. **Kind.** `POST /api/questions` also returns `kind: "business" | "code"` (Claude decides with the fast
   model; a keyword fallback without a model). `/new` shows it ("Claude will write this as real code")
   with a switch. `POST /api/plan` takes `kind`.
2. **Write.** For `kind: "code"`, `/api/plan` streams the generation as NDJSON events (same transport as
   today's plan): `{t:"status"}`, `{t:"file", path, content}` (each file as it's finished, content may
   arrive in growing partials), `{t:"manifest", manifest}`, `{t:"done", projectId}`, `{t:"error"}`.
   Saves a project with `kind: "code"`, `code`, a first version (checkpoint with `code`), and charges
   `PRICE.codeApp` only when the save succeeds and the model didn't fail. Guests and people without
   credits: no model, so no code app; they're told plainly and offered a business starter instead.
3. **Build (real).** `POST /api/code-apps/[projectId]/build` (owner or team) runs `lib/code-apps/build.ts`:
   validate files, compile every file with esbuild (JSX, TS), resolve relative imports, refuse packages
   outside the list, bundle to one ES module plus CSS. Streams NDJSON steps
   `{t:"step", id, label, state: "running"|"done"|"failed", detail?}` and ends with
   `{t:"result", build: BuildResult}`. Saves `projects.build`. Free. Errors carry file, line, column.
4. **Run.** The studio shows the build in `<CodeAppFrame>` (an iframe to `/run/p/[projectId]?b=<hash>`).
   The sandbox page reports `prod:ready` after the first render, and `prod:error` for any runtime error.
   A build is "real" (the Sheet says "It's real.") only after it compiled AND started without errors.
5. **Repair.** A failed build or a runtime error shows a fix note with the real error. "Fix it" calls
   `POST /api/code-apps/[projectId]/repair` with the errors: Claude returns corrected files, saved as a
   new version labelled as Prod AI's fix, free (never charged), at most 3 in a row before it asks the
   person to describe what they want. Then it rebuilds.
6. **Change.** A note in the margin on a code app goes to Claude with the current files; the proposal is
   a set of whole-file replacements (and deletions) with a plain summary, priced `PRICE.codeChange`.
   Apply makes a new version (checkpoint with `code`) and rebuilds; Undo restores the previous files.
7. **Publish.** Allowed only when the latest build is ok and the app started. Publishing copies the build
   (js, css, manifest, hash) into `live_sites.build` with `kind: "code"`. `/live/[slug]` for a code app is
   a full-height frame of `/run/live/[slug]` with the small Prod AI footer (Built with Prod AI, Report).
8. **Download.** The Code tab exports a real Vite project (package.json, vite.config, index.html, `src/`
   with the files, a `prod` shim that stores data in localStorage), which runs with `npm install && npm run dev`.

## The sandbox

`/run/p/[projectId]` (latest build; owner and team only) and `/run/live/[slug]` (published build; anyone)
return an HTML page with its own Content-Security-Policy, and the site-wide CSP does not apply to `/run`:

```
sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock;
default-src 'none'; script-src 'unsafe-inline' https://esm.sh https://cdn.jsdelivr.net;
style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:;
img-src * data: blob:; media-src * data: blob:; connect-src https://esm.sh https://cdn.jsdelivr.net;
frame-ancestors 'self'
```

The `sandbox` directive gives the page an opaque origin: it can't read Prod AI's cookies, call Prod AI's
API with anyone's session, or touch the parent page. It can talk to the parent only with `postMessage`.

The page: the import map (`importMap()`), Tailwind's browser build, the app's CSS, the SDK below (inline),
and the app's bundle (inline module) mounted into `#root`. A tiny error overlay shows runtime errors.

## The SDK: `window.prod`

Inside the sandbox, the app uses:

```js
await prod.data.list("scores", { limit: 50 })      // → [{ id, createdAt, ...fields }]
await prod.data.add("scores", { name: "Ana", points: 42 })   // → { id, createdAt, ...fields }
await prod.data.update("scores", id, { points: 50 })
await prod.data.remove("scores", id)
await prod.ai.ask("Write a haiku about rain")       // → string (the owner's credits, 5 a call)
prod.user()                                          // → { role: "owner"|"member"|"visitor"|"preview", name }
```

Protocol (sandbox ↔ host page, `postMessage`, target `*` from the sandbox; the host checks
`event.source === iframe.contentWindow`):

- request: `{ type: "prod:req", id, method: "data.list"|"data.add"|"data.update"|"data.remove"|"ai.ask"|"user", args: [...] }`
- response: `{ type: "prod:res", id, ok: true, result } | { type: "prod:res", id, ok: false, error }`
- lifecycle: `{ type: "prod:ready" }`, `{ type: "prod:error", message, stack?, source? }`
- the host may send `{ type: "prod:init", user, mode: "preview"|"live" }` once the frame loads.

The host (`<CodeAppFrame>`):

- **Preview (studio):** data lives in memory in the host page (it resets on reload; the frame says
  "Test version: data isn't saved"); `ai.ask` calls `POST /api/code-apps/p/[projectId]/ai`.
- **Live:** `data.*` calls `/api/code-apps/live/[slug]/data` and `ai.ask` calls `/api/code-apps/live/[slug]/ai`.

The server enforces everything; the host only forwards:

- **Data:** collections and their `read` and `write` rules come from the published manifest. A visitor
  can read `public`-read collections and add to `public`-write ones; the team can do everything.
  Records are `app_records` rows (`entity_id` = collection name), values cleaned (strings, numbers,
  booleans, plain objects; 4 KB a record), rate-limited (visitors by network), under the 2,000-record cap.
- **AI:** costs the owner 5 credits a call from their monthly allowance; visitors may call it only when
  the owner allows it (`settings.app.publicHelpers`); rate-limited per caller; prompt up to 4,000
  characters; answers up to about 600 words; plain text.
