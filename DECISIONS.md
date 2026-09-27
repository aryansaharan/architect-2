# Product decisions

Short notes on the calls that shaped Prod AI: what I chose, what I rejected, and why.

## 1. No "builder mode" and "developer mode"

**Decision.** One product. Depth lives on each object (Plain · Spec · Code), not on the person.

**Why.** A mode toggle forces people to declare themselves "technical" or not, and then gives the two groups different products that drift apart. Real teams don't split that cleanly: an ops lead wants to read the rule that blocked a payment; an engineer wants the plain summary before a review. Putting depth on the object means both can open the same agent and look at the level they need, and a handoff between them never needs translating.

**Rejected.** A global toggle (simple to build, but it doubles the surface and labels users). Progressive disclosure by role (still labels users).

## 2. The Blueprint is the source of truth

**Decision.** A project is a validated JSON Blueprint. The canvas, preview, public live site, generated code, diffs and build script are all derived from it.

**Why.** It makes the core promises cheap and trustworthy: every change is a small, reviewable diff; save points are exact; "Plain, Spec and Code" can never disagree because they're three views of one object; the live site is the same renderer as the preview. It also means an edit from any direction (chat, tweak, spec, code) lands in one place.

**Trade-off.** The preview renders a fixed vocabulary of nine blocks rather than arbitrary generated UI. For agentic business apps (queues, records, forms, agent chats) that vocabulary covers most screens, and the generated Next.js code remains fully editable.

## 3. The model decides; code lays out

**Decision.** The planner asks Claude for decisions only (data, agents, tools and their risk, screens and their purpose), then expands them deterministically and validates referential integrity.

**Why.** It is faster, cheaper and far more reliable than asking a model for a finished layout, and it keeps the model's job to what it's good at: judgment. Estimates are computed, never taken from the model.

## 4. Price before work, and "our fix · free"

**Decision.** Every build and every change is a Work Order with a price and a blast radius. Fixes for Prod AI's own mistakes are labelled and free. Stopping a build refunds it.

**Why.** Paying for an AI's own mistakes is the single loudest complaint about AI builders. Showing the price up front and attributing every credit makes trust measurable.

## 5. Irreversible actions always ask

**Decision.** Tools are Read, Change or Can't undo. Anything that sends, pays, creates or deletes asks a person first. The approval card offers "Always allow" for changes you can undo, but never for actions you can't.

**Why.** It is the one rule a non-technical owner can check at a glance, and the one an engineer can enforce in any framework. The same permission compiles to the AI SDK's tool approval in the playground and to each framework's own mechanism in generated code.

## 6. Rehearsals inside the build

**Decision.** Every build rehearses every agent; Preflight requires rehearsals to pass before going live; generated CI runs them on each pull request.

**Why.** This brings Lyzr's simulation engine forward from "before production" to "while designing". The first build always surfaces one real weakness in the plan and proposes two fixes. The repair moment is the product's clearest demonstration of trust.

## 7. Stream the plan

**Decision.** The plan streams onto the screen as Claude decides it.

**Why.** Careful planning takes about a minute. A spinner makes that feel broken; watching screens, agents and risky actions appear makes it feel like work being done, and shows what the agents will be allowed to do before anyone approves anything.

## 8. A guest session instead of a login wall

**Decision.** "Try the demo" creates an anonymous session and a finished project in about five seconds. Signing in later keeps everything (identity linking).

**Why.** Reviewers and prospects should reach the value before the form. It's also real product plumbing: the guest's data is protected by the same row-level security as everyone's.

## 9. Import reads first and signs House Rules

**Decision.** Importing shows what Prod AI understood, what it isn't sure about and what it ignored, then asks the owner to confirm House Rules ("never change the framework", "pull requests only") before anything is mapped.

**Why.** Engineers adopt tools that respect their codebase. Most teams don't start from zero; Prod AI has to adopt existing projects rather than absorb them.

## 10. Honest fallbacks everywhere

**Decision.** Every model call has a scripted path: no key, timeouts, errors and a spent daily budget all degrade to starter plans, rule-based changes and a scripted agent run that still uses the real approval protocol. Simulated parts are labelled.

**Why.** A demo that errors is worse than one that is candid about its seams.

## 11. Visual language

**Decision.** A dark studio with one amber accent; the generated app previews in its own light theme.

**Why.** The contrast separates "the tool" from "the thing you're building" at a glance. Semantic colours are reserved for meaning: green reads, blue changes, rose can't be undone, violet is Prod AI fixing its own mistake.

## What I cut, and what's next

- **Real GitHub pushes and pull requests**: the flow and repo semantics are designed; the push is sandboxed.
- **Real deploys to Vercel and customer VPCs**: the live URL on Prod Cloud is real; the other targets are sandboxed.
- **Real teammates**: handoffs persist, but the resolution is simulated.
- **A drag-and-drop layout editor**: point-and-tweak covers copy, columns and removal; layout changes go through Work Orders.
- **Next:** approvals inbox for production agent actions, LLM-judged rehearsals against production traces, multiplayer presence, ZIP and Figma import.
