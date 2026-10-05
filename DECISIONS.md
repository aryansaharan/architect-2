# Product decisions

Short notes on the calls that shaped Prod AI: what I chose, what I rejected, and why.

## 1. No "builder mode" and "developer mode"

**Decision.** One product. The primary surfaces (the Sheet, AI helpers, Publish) speak plain English to everyone; the depth lives **Under the hood** (Plan map with Plain · Settings · Code on every object, Preview and tweak, Code and GitHub, Handoffs), one click away for anyone who wants it.

**Why.** A mode toggle forces people to declare themselves "technical" or not, and then gives the two groups different products that drift apart. Real teams don't split that cleanly: an ops lead wants to read the rule that blocked a payment; an engineer wants the plain summary before a review. Putting depth on the object and under the hood means both can open the same AI helper and look at the level they need, and a handoff between them never needs translating.

**Rejected.** A global toggle (simple to build, but it doubles the surface and labels users). Progressive disclosure by role (still labels users).

## 2. The Blueprint is the source of truth

**Decision.** A project is a validated JSON Blueprint. The canvas, preview, public live site, generated code, diffs and build script are all derived from it.

**Why.** It makes the core promises cheap and trustworthy: every change is a small, reviewable diff; save points are exact; "Plain, Settings and Code" can never disagree because they're three views of one object; the live site is the same renderer as the preview. It also means an edit from any direction (a note in the margin, a tweak, the spec, the code) lands in one place.

**Trade-off.** The preview renders a fixed vocabulary of nine blocks rather than arbitrary generated UI. For agentic business apps (queues, records, forms, agent chats) that vocabulary covers most screens, and the generated Next.js code remains fully editable.

## 3. The model decides; code lays out

**Decision.** The planner asks Claude for decisions only (data, agents, tools and their risk, screens and their purpose), then expands them deterministically and validates referential integrity.

**Why.** It is faster, cheaper and far more reliable than asking a model for a finished layout, and it keeps the model's job to what it's good at: judgment. Estimates are computed, never taken from the model.

## 4. Price before work, and "our fix · free"

**Decision.** Only work Claude does costs credits, at one fixed price each: planning an app or importing a repo 40, applying a change Claude wrote 15, a new AI helper 10, each AI helper message 5 ([`lib/prices.ts`](lib/prices.ts)). Every change is a Work Order with a price and a blast radius; in the product that is the reply to a note in the margin: the change in plain words, its price, then **Apply** or **Not now**. Making it real, publishing, quotes, rule-based changes and scripted answers are free, a call that fails is never charged, and fixes for Prod AI's own mistakes are labelled and free.

**Why.** Paying for an AI's own mistakes is the single loudest complaint about AI builders. A fixed price per action is something a person can predict before pressing a button, and attributing every credit makes trust measurable. The real model cost is still metered behind each price, against daily budgets ([decision 16](#16-metered-model-spend-and-server-only-writes)).

## 5. Irreversible actions always ask

**Decision.** Tools are Read, Change or Can't undo, and each AI helper's card says in plain words "What it's allowed to do": **Just do it**, **Tell me** or **Ask first**. Anything that can't be undone always asks first, whatever the setting. The approval in **Try it** offers **Always allow** for changes you can undo, but never for actions you can't.

**Why.** It is the one rule a non-technical owner can check at a glance, and the one an engineer can enforce in any framework. The same permission compiles to the AI SDK's tool approval in Try it and in published apps (where an AI helper's email always waits for a person's OK), and to each framework's own mechanism in generated code. The server signs each approval request, so a browser can't forge an "Allow".

## 6. Test runs inside the build

**Decision.** Every build gives every AI helper its test runs (rehearsals, under the hood); Publish requires them to pass; generated CI runs them on each pull request.

**Why.** This brings agent simulation forward from "before production" to "while designing". The first build always surfaces one real weakness in the plan, and a note on the sheet proposes two free fixes. That moment is the product's clearest demonstration of trust.

## 7. Stream the plan as a sketch forming

**Decision.** A few brief-aware questions come first (a fast model call when one is available, with "Skip, use sensible defaults"), then the plan is drawn onto the page as Claude decides it.

**Why.** Careful planning takes about a minute. A spinner makes that feel broken; watching screens, helpers and risky actions appear on paper makes it feel like work being done, and shows what the helpers will be allowed to do before anything is built.

## 8. Guests start from scratch; the finished example has its own door

**Decision.** Sign-in offers Google, an email link, or **continue as a guest**. A guest starts with an empty desk and nothing seeded: the first thing they see of Prod AI is their own idea turning into a sketch, from the closest starter plan. A finished, published example project lives at `/demo`, linked from the README. Signing in later keeps everything (identity linking); guests who don't come back for a week are removed with their projects.

**Why.** A seeded example on a first visit answers a question nobody asked and makes the product look like a template gallery. Someone who wants to see a finished, published project in seconds still can, through its own door. Both are real product plumbing: a guest's data is protected by the same row-level security as everyone's.

## 9. Import reads first and signs House Rules

**Decision.** Importing shows what Prod AI understood, what it isn't sure about and what it ignored, then asks the owner to agree House Rules ("never change the framework", "pull requests only") before anything is mapped. The repo stays **untouched**; everything Prod AI adds is proposed in one `prodai/` folder as pull request #1, filtered by those rules.

**Why.** Engineers adopt tools that respect their codebase. Most teams don't start from zero; Prod AI has to adopt existing projects rather than absorb them.

## 10. Honest fallbacks everywhere

**Decision.** Every model call has a scripted path: no key, timeouts, errors, a rate limit, a spent daily budget or no credits left all degrade to starter plans, rule-based changes and a scripted agent run that still uses the real approval protocol, with a plain note saying why. Simulated parts are labelled.

**Why.** A product that errors is worse than one that is candid about its seams.

## 11. Visual language: Paper & Pencil

**Decision.** "Sketch your app. Get a production app." Warm paper, ink and a single forest-green accent. Caveat handwriting for titles and notes, Architects Daughter for sketch labels, Hanken Grotesk for the tool, JetBrains Mono for code. No glows, no gradients behind the work. The generated app appears in its own clean theme inside the sheet.

**Why.** The first question a non-technical person has is "what am I going to get?", and the oldest answer is a sketch on paper. A pencil sketch says "rough, cheap to change" without a word of copy, which is exactly the state a plan is in. So the project goes through the same three states a real design does: a pencil sketch (the plan), inking (the build: each screen turns from pencil into the real screen as its step completes) and the real thing ("It's real."). The metaphor carries the thesis: the plan is cheap to change until you make it real, and after that every change is written as a note. It also reads as deliberately unlike the dark, purple-glow look most AI builders share. Semantic colours stay reserved for meaning: green reads, blue changes, rose can't be undone, violet is Prod AI fixing its own mistake.

**Rejected.** An earlier dark theme: striking on the landing page, but a dark studio made the product feel like a developer tool, and its motif had nothing to say about the states a project moves through.

## 12. No chat on the left and preview on the right

**Decision.** The project page is one sheet of paper, the app in the middle and notes in the margin, not the chat-panel-plus-preview layout.

**Why.** The brief Prod AI started from asked for first principles and said not to copy the current Architect's UI or any other platform's. Chat-left, preview-right is the layout nearly every builder shares (see [RESEARCH.md](RESEARCH.md)). Starting from what the user needs, the app itself deserves the space; the conversation is secondary.

## 13. Notes in the margin instead of a chat panel

**Decision.** You change the app by writing a note in the margin, or by pointing at part of the app and writing one. Prod AI replies next to it with the change in plain words and its price, then **Apply** or **Not now**, then "Applied · version N" with **Undo**. Questions get answers in the margin. Every note is saved as a thread.

**Why.** People already know how to mark up a draft: you write in the margin, next to the thing. A note is anchored to what it's about and ends in a decision, where a chat scrolls away and blurs requests, answers and costs together. The margin also doubles as the project's history: what was asked, what it cost, what changed.

## 14. Plain words first, developer words under the hood

**Decision.** The primary UI says AI helpers, test runs, "What it's allowed to do", Make it real, Publish and versions. Agents, rehearsals, Work Orders, save points, specs, frameworks, job descriptions and memory appear under the hood and behind "Details for developers".

**Why.** The same object needs two vocabularies. Leading with the plain one keeps the first ten minutes readable for a non-technical owner; keeping the technical one a click away means an engineer never has to guess what a plain label maps to.

## 15. A simulated build that says so, and costs nothing

**Decision.** The build is a scripted timeline over the real plan, and it is labelled on the sheet: "This building step is a visual; the plan, code and data are real." No generated code runs: the app is rendered from its plan by a tested library of nine blocks. It has a playback speed control (Normal, Fast, Skip to end), not a fake "faster build", and making it real is free.

**Why.** Running generated code in real sandboxes is the production design ([ARCHITECTURE.md](ARCHITECTURE.md)), not something Prod AI pretends to do before it exists. No model work happens while it plays, so it costs nothing: the price sits on the work Claude actually does, and the plan was paid for when Claude wrote it. The honest version still shows the real value: a real plan, real generated code, a real test-run decision that changes the plan, and a published app with real records.

## 16. Metered model spend and server-only writes

**Decision.** Every model call first passes a rate limit for what the person is doing, then holds its worst-case cost against two 24-hour budgets: the person's and the whole site's ([`lib/llm/guard.ts`](lib/llm/guard.ts)). Failed calls are metered too, and guests have no model budget. Rows people must never write themselves (the spend meter, rate limits, budget holds, published sites, abuse reports and published apps' records) are written only by the server's admin connection, after it checks who is asking; everything else goes through the person's own session and row-level security.

**Why.** On a public site the model bill is the risk, and a browser can't be trusted to report its own spend. Past any limit the feature takes its scripted path, so the product keeps working and simply stops calling the model. A new browser never costs anything.

## 17. Monthly free credits, no payments yet

**Decision.** Each signed-in person gets 300 free credits a month, back on the 1st (UTC). Guests get none and use the free starter plans. Credits can't be bought yet.

**Why.** Prod AI runs on free tiers (Vercel Hobby, Supabase Free, the Anthropic API; [docs/LAUNCH.md](docs/LAUNCH.md)), and Vercel Hobby is for non-commercial use, so charging waits for a paid plan. A monthly allowance lets a signed-in person plan a few apps and make real changes, while the daily budgets keep the bill bounded.

## 18. Published apps keep real data, behind the server

**Decision.** A published app keeps its own records (up to 2,000), with a change history for undo and audit, and starts with its plan's sample data, marked and one click to clear. Team screens are private to the owner and the people they invite by email. Public pages show only the fields they display and accept only their own forms. AI helpers in a published app work on those records: look-ups, undoable changes, and email that always asks first. The app's owner pays for their messages.

**Why.** An app whose forms don't save is a mock-up. The people using a published app are usually not its owner, so access can't follow project ownership alone: every read and write goes through the server, which decides from the app's own screens what each person may see and send.

## What I cut, and what's next

- **Real GitHub pushes and pull requests**: the flow and repo semantics are designed; the push is sandboxed.
- **Real deploys to Vercel and customer VPCs**: the live URL on Prod Cloud is real; the other targets are sandboxed.
- **Real teammates in the studio**: handoffs persist, but the teammate's answer is simulated. (Published apps do have real invited team members.)
- **Outside connections other than email**: payments, Slack, CRMs and the rest run on test data in Try it, and in a published app the helper says the connection isn't set up.
- **Payments**: credits are free for now; credit packs come later, together with a paid hosting plan.
- **A drag-and-drop layout editor**: point-and-tweak covers copy, columns and removal; layout changes go through notes in the margin.
- **Next:** approvals inbox for production agent actions, LLM-judged rehearsals against production traces, multiplayer presence, ZIP and Figma import.
