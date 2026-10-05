# Prod AI

**Sketch your app. Get a production app.** Write what you want in plain words; Prod AI draws it in pencil first, then makes it a real app with AI helpers that ask before they do anything that can't be undone. One product for the people who don't code and the people who do.

*Why the name:* **prod** is what engineers call production, where software has to survive real users, real money and real mistakes. Every AI builder demos well on the first prompt; Prod AI is built for prod.

**[Try it](https://prod-ai-studio.vercel.app)** · **[Open a finished example (no account)](https://prod-ai-studio.vercel.app/demo)** · [Pricing](#pricing-and-free-credits) · [What's real today](#what-works-today-and-whats-simulated) · [Run it yourself](#run-it-yourself) · [Architecture](ARCHITECTURE.md) ([interactive](https://prod-ai-studio.vercel.app/architecture)) · [Product decisions](DECISIONS.md) · [Market research](RESEARCH.md)

---

## What it is

**Start from what the person needs, not from how builders look today.** Someone with an idea wants three things: to see what they'll get before paying for it, to change it without learning a tool, and to trust it once real customers and real data are involved. An engineer on the same team wants the code, the diff and a say in what ships. So Prod AI drops the layout almost every builder shares (chat on the left, preview on the right) and starts from something everyone already understands.

- **Paper and pencil.** A pencil sketch says "rough, cheap to change" without a word of copy, which is exactly the state a plan is in. So a project moves through the states a real design does: a **sketch** (the plan), **inking** (each screen turns from pencil into the real screen) and **"It's real."** (the working app, on the same sheet).
- **Notes in the margin, not a chat panel.** You mark up a draft by writing next to it. A note, or a note pinned to the part of the app you pointed at, gets a reply with the change in plain words and its price, then **Apply** or **Not now**, then "Applied · version N" with **Undo**. Every note is a saved thread, and each AI helper also has its own **Try it** chat.
- **One product for both audiences.** No builder mode and developer mode. The Sheet, AI helpers and Publish speak plain English. **Under the hood** holds the Plan map (every object with Plain, Settings and Code faces), Preview and tweak, Code and GitHub, and Handoffs.
- **Designed for turn three.** Nothing Claude does runs without a price, and a call that fails is never charged. Anything an AI helper does that can't be undone **asks a person first**. When a test run catches a problem, the fix for Prod AI's own mistake is **free** and labelled so.
- **Published apps really work.** A published app keeps real records with undo, team screens only you and the people you invite can open, and public pages that show only what they display.

## Try it

1. Open **[prod-ai-studio.vercel.app](https://prod-ai-studio.vercel.app)**, write what you want on the ruled sheet (or pick a starter such as *Claims desk*), and press **Make it**.
2. **Sign in** with Google or an email link to get 300 free credits a month, so Claude plans the app from your own words. Or **continue as a guest**: you start from the closest starter plan, and nothing costs credits.
3. Answer the few questions (or **Skip, use sensible defaults**) and watch the plan being drawn as a sketch.
4. On the **Sheet**, read your app as a pencil sketch: screen cards, AI helpers as sticky notes, and its connections. Press **Make it real** (free) and watch each screen ink in (**Skip to end** if you're in a hurry).
5. A test run catches a problem: pick one of the two free fixes in the note on the sheet. Then **"It's real."**: try the app, switch devices, or **Point and write a note**.
6. Write a note in the margin, e.g. *"Add a column for priority"*. Read the change and its price, **Apply** it, then **Undo** if you like.
7. **AI helpers** → pick one → **Try it**. Ask it to do something that can't be undone and it stops to ask you first. On the [example project](https://prod-ai-studio.vercel.app/demo), pick **Settlement** and send *"CLM-20935 for Grace Liu is approved at $1,640. Pay her by ACH."*
8. **Publish** → open the public `/live` link. Invite someone to the team screens, fill in a public form, or clear the sample data.

Short on time? **[/demo](https://prod-ai-studio.vercel.app/demo)** opens a finished, published example (a *Claims Triage Desk*) on its Sheet, as a guest.

## What works today, and what's simulated

| Flow | Where | Today |
| --- | --- | --- |
| Sign in with Google or an email link; guest sessions you can keep | `/login`, `/start` | **Real** (Supabase Auth). A guest who signs in keeps their work |
| Questions, then the plan drawn as a sketch | `/new` | **Real.** Claude plans from your words when you're signed in; guests, and anyone out of credits, start from the closest starter plan |
| Make it real: screens inking in, test runs, the fix note | Sheet `/p/:id` | **Simulated, and said so on the sheet.** The building step is an animation over the real plan: no generated code runs, and the app is rendered from its plan by a tested library of nine building blocks. The fix you pick really changes the plan, and versions are real |
| "It's real.": the app on the Sheet, device switch, point and write a note | Sheet | **Real** renderer over the real plan and sample data |
| Notes in the margin, a priced change, Apply, version N, Undo | Margin | **Real.** Claude returns typed edits that code checks and applies; rule-based when Claude isn't available |
| AI helpers: what each may do, and Try it with an approval gate | `/p/:id/agents` | **Real** (Claude with tool approval; approvals are signed by the server). Try it runs on sample data; guests get a scripted run that still asks first |
| Test runs, replay, audit log | AI helpers → Details for developers | A deterministic judge over the real plan; replays and the log are real records |
| The same helper as code in six frameworks (Lyzr ADK, LangGraph, CrewAI, OpenAI Agents SDK, Google ADK, Mastra) | AI helpers, Code and GitHub | **Real** generated code, shown and downloadable, not executed |
| Plan map with Plain · Settings · Code; Preview and tweak; file tree, diffs, `.zip` download | Under the hood | **Real** |
| Import a public repo: stack, agents and tools, House Rules, PR #1 in `prodai/` | `/new?mode=import` | **Real** GitHub reads, detection and parsing; mapping by Claude. PR #1 is proposed, not pushed |
| GitHub: connect, branch per change, pushes, pull requests, sync | Code and GitHub | **Simulated** (a sandbox, labelled) |
| Publish: what needs attention, versions, rollback | `/p/:id/ship` | **Real** public link on Prod Cloud. Vercel, your VPC and custom domains are **simulated** |
| A published app's records, forms and team screens | `/live/:slug` | **Real.** Up to 2,000 records per app with a change history and undo. Sample data on first publish, one click to clear. Team screens for you and the people you invite (by email, or a link to copy when email isn't set up). Public pages show only the fields they display and accept only their own forms |
| AI helpers inside a published app | `/live/:slug` | **Real.** They look up and change the app's real records (undoable) and send email only after a person says yes, to addresses in the app's records or its team. Email needs Resend; without it the helper says plainly that email isn't connected |
| Outside connections other than email (payments, Slack, CRMs and the rest) | Everywhere | **Simulated.** Test data in Try it; in a published app the helper says the connection isn't set up and nothing is sent |
| Handoffs: ask a teammate, the engineer's view, a plain-English answer | Under the hood → Handoffs | Real records; the teammate is simulated |
| Credits meter, per-project spending caps | Top bar, `/settings` | **Real** |

Anything simulated is labelled in the product.

## Pricing and free credits

Only work Claude does costs credits, and you see the price before it runs.

- **300 free credits a month** for each signed-in person, back on the 1st of every month (UTC).
- **Guests** don't have credits. They use the free starter plans, rule-based changes and scripted answers.
- **No payments yet.** Credits can't be bought, and they have no cash value.

| What | Credits |
| --- | --- |
| Planning an app with Claude | 40 |
| Importing a repo with Claude | 40 |
| Applying a change Claude wrote | 15 |
| A new AI helper Claude writes | 10 |
| Each AI helper message Claude answers (in a published app, the app's owner pays, visitors' messages included) | 5 |

**Free:** making it real, publishing, quotes, rule-based changes, starter plans and scripted answers. A call that fails is never charged. When your credits run out, Prod AI takes the free path and tells you so. You can also set a spending cap per project in Settings.

## How it's built

Next.js 16 (App Router, React 19), Tailwind v4 and shadcn/ui, TypeScript strict; Supabase Auth (Google, email link, guests you can keep) and Postgres with row-level security on every table; Claude through the Vercel AI SDK (structured outputs, streaming, tool approval). It runs on free tiers: Vercel Hobby, Supabase Free and the Anthropic API ([docs/LAUNCH.md](docs/LAUNCH.md)).

- **One source of truth.** A project is a validated JSON *Blueprint* (screens, AI helpers, data, connections). The sketch, the real app on the Sheet, the published app, the generated code, the diffs and the build timeline are all derived from it ([`lib/blueprint/schema.ts`](lib/blueprint/schema.ts)).
- **The model decides; code lays out.** The planner asks Claude for the *decisions* (which helpers, which tools and how risky, which data), then expands them deterministically and validates every reference before saving ([`lib/llm`](lib/llm)). Prices are fixed in code ([`lib/prices.ts`](lib/prices.ts)), never set by the model.
- **Every model call has a free path.** No key, a timeout, an error, a rate limit, a spent daily budget or no credits left all fall back to starter plans, rule-based changes and a scripted helper that still uses the real approval protocol.
- **Approval gates are real.** In Try it and in published apps they are AI SDK tool approvals, signed by the server so a browser can't forge an "Allow". In generated code they compile to each framework's own mechanism: LangGraph `interrupt()`, OpenAI Agents `needs_approval`, ADK tool confirmation, CrewAI hooks, Mastra `requireApproval`.
- **Security.**
  - People's own writes go through their session and row-level security. The server has one admin connection (`SUPABASE_SECRET_KEY`, [`lib/supabase/admin.ts`](lib/supabase/admin.ts)), used only for rows people must not write themselves: the spend meter, rate limits, budget holds, published sites, abuse reports and published apps' records, always after checking who is asking.
  - Every model call passes a rate limit and holds its worst-case cost against the person's and the whole site's 24-hour budgets ([`lib/llm/guard.ts`](lib/llm/guard.ts)). Failed calls are metered too. Guests have no model budget.
  - Signed AI helper approvals and signed import reports; a Content Security Policy and security headers; published pages are kept out of search engines and carry a "Report this page" link.
  - Size limits on every row, project caps (5 for a guest, 25 signed in), and a daily job that removes guests who haven't been back for a week.
- **Design.** One Paper & Pencil system for every screen ([docs/DESIGN.md](docs/DESIGN.md)).

**Where it's going.** [ARCHITECTURE.md](ARCHITECTURE.md) is the design for running Prod AI at scale, drawn at [/architecture](https://prod-ai-studio.vercel.app/architecture) ([PNG](public/docs/architecture-diagram.png) · [PDF](public/docs/architecture.pdf)): one Firecracker microVM per project, an agent harness with credit, step and time budgets, a model gateway that routes and fails over between providers, a preview proxy, a GitHub App with two-way sync, and immutable releases to Prod Cloud, Vercel or your VPC. Most of it is designed, not built; [section 20](ARCHITECTURE.md#20-what-runs-today) says exactly what runs today.

![Prod AI production architecture](public/docs/architecture-diagram.png)

## Run it yourself

Requires Node 22+ and Docker (for the local Supabase stack).

```sh
npm install
npx supabase start            # local Postgres and Auth; applies supabase/migrations
cp .env.example .env.local    # fill in the values printed by `npx supabase status`
npm run dev                   # http://localhost:3000
```

[`.env.example`](.env.example) explains every variable. The main ones:

| Variable | What it's for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your Supabase project |
| `SUPABASE_SECRET_KEY` | The server's admin connection (server only, never `NEXT_PUBLIC_`). Without it nothing is metered, so no model call is made |
| `NEXT_PUBLIC_SITE_URL` | Your deployed address, for sign-in redirects and published links |
| `LLM_PROVIDER`, `LLM_MODEL`, `LLM_FAST_MODEL`, `ANTHROPIC_API_KEY` | Claude. `LLM_PROVIDER=none` runs everything on the free, scripted paths |
| `FREE_CREDITS_PER_MONTH` | Free credits per signed-in person a month (300) |
| `LLM_DAILY_USD_GUEST`, `LLM_DAILY_USD_MEMBER`, `LLM_DAILY_USD_SITE` | 24-hour model budgets in USD: per guest (0), per person, for the whole site |
| `CRON_SECRET`, `RATE_LIMIT_SALT`, `SIGNING_SECRET` | Long random strings: the daily cleanup job, hashed IP addresses, signed approvals and import reports |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional: invitations and AI helper email through Resend |
| `GITHUB_TOKEN` | Optional, no scopes: raises the import rate limit from 60 to 5,000 requests an hour |

**Hosting your own copy.** [docs/LAUNCH.md](docs/LAUNCH.md) is the checklist: an Anthropic spend limit, the database changes in [`supabase/migrations`](supabase/migrations) (on a new project, run every file in filename order), sign-in providers (Anonymous sign-ins and Manual linking for guests, Google, email) and the Vercel settings. The daily cleanup is a Vercel Cron job ([`vercel.json`](vercel.json)).

**Tests.** Playwright runs the main paths end to end (landing, plan map and inspector, tweak, Try it approval, a margin note to a new version, Publish and the live link, a new project through the fix note, import with House Rules, a handoff, and a visitor on a published app). Point it at a running server:

```sh
BASE_URL=http://localhost:3000 npx playwright test
```

<a id="screenshots"></a>

## Screenshots

New screenshots of the launched product are on the way. The earlier ones showed screens and prices that have since changed, so they were taken down. `node scripts/readme-shots.mjs <base-url> docs/screenshots` regenerates them.

## Project structure

```
ARCHITECTURE.md        the design for running at scale, and what runs today (section 20)
DECISIONS.md           the product calls, and what was rejected
RESEARCH.md            nine products compared, and the gaps Prod AI targets
docs/                  LAUNCH.md (going live on free tiers), DESIGN.md (Paper & Pencil rules), screenshots
public/docs            architecture diagram (PNG, PDF)
app/                   routes: landing, login, start, demo, home, new, settings, architecture, privacy, terms,
                       live/[slug], p/[id] (the Sheet) + p/[id]/{agents,ship,blueprint,preview,code,handoffs},
                       api/{plan,questions,chat,import,apps,report,cron}
components/landing     the landing page's writing sheet and sketches
components/new         /new: questions, connections, the plan drawn as a sketch
components/workspace   the project: shell, top bar (Sheet, AI helpers, Publish, Under the hood)
  sheet/               the Sheet: sketches, inking, the fix note, the real app, point and write a note
  rail.tsx             the margin: notes, replies and history as threads
  composer-dock.tsx    writing a note, and the priced change with Apply / Not now
  agents/              AI helpers: what each may do, Try it, details for developers
  ship/                Publish: what needs attention, people, what's public, sample data, versions
  blueprint/ inspector/ preview/ code/ handoffs/   Under the hood
components/renderer    the app renderer (the real app on the Sheet, Preview and published apps)
lib/blueprint          schema, fixtures, validation, plain-English descriptions
lib/llm                planner, questions, streaming, provider, model cost, rate limits and budgets (guard.ts)
lib/prices.ts, lib/pricing.ts   prices and the monthly free credits
lib/apps               published apps: who may see what, records, history, AI helper tools
lib/security           rate limits, project caps, signing
lib/supabase           browser, session and admin connections
lib/change             notes to typed edits to validated changes
lib/agents             Try it tools, approval mapping, scripted fallback
lib/codegen            generated files, job-description files, six framework templates, diffs, the import PR #1
lib/import             GitHub reads, stack and agent detection, House Rules, mapping
lib/sim                build timeline, fixes, test runs, preflight
lib/demo               the finished example behind /demo
supabase/migrations    schema, row-level security, limits and housekeeping
tests/                 Playwright end-to-end tests
scripts/               screenshot and export scripts
```

## Origin

Prod AI began as an answer to Lyzr's Architect 2.0 brief ("a vibe-coding platform for both technical and non-technical users"). It is an independent product, not affiliated with or endorsed by Lyzr.

Built by Aryan Saharan. MIT licensed.
