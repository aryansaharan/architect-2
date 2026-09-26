# Exploration: what the market does, and where Architect 2.0 fits

The brief asked for an exploration of architect.new, Replit, Lovable, Emergent, Vercel v0, Rocket.new, Cursor, Codex and Claude Code: how they differ, why people adopt them, their features, UI/UX patterns and flows. This is that research (September 2026), and how it shaped Architect 2.0.

## 1. The nine products in one page

| Product | Built for | Why people adopt it | Core flow | Where it hurts |
|---|---|---|---|---|
| **architect.new** (Lyzr) | Non-technical, enterprise | Agents are first-class, not bolted on; an "AI Consultant" suggests what to build; 30+ integrations; agent evals with human escalation | Chat left, preview right, Plan → Agents → App tabs | One agent framework (Lyzr SDK); editing agents means leaving for Lyzr Studio; no cost preview; branches must exist on GitHub first |
| **Replit Agent** | Both | Everything in one place (DB, hosting, secrets); plan mode and task board; import from GitHub, Figma, Lovable, Bolt | Prompt → plan and task cards → build with preview → publish | Effort-based pricing surprised people with large bills; failed runs still billed; an agent deleted a production database in 2025 |
| **Lovable** | Non-technical | Polished UI output, visual click-to-edit, backend and AI with no keys | Prompt → chat left, preview right → visual edits → publish | Credits burn on fixing its own bugs; cannot import an existing repo; one branch at a time; an access-rules gap exposed 170+ apps |
| **Emergent** | Non-technical | A team of agents (architect, designer, developer, tester); mobile builds; asks clarifying questions first | Prompt → questions → visible build log → preview → deploy | Fix loops billed every time (one user was charged for 233 attempts); slow rebuilds; generic UI |
| **Vercel v0** | Both (since Feb 2026) | Vercel's deploy pipeline; imports any repo into a sandbox; branch per chat and PRs | Chat left, preview or code right, Git panel → PR | Token pricing with no quote before a prompt; cost grows with context; Next.js and Vercel centric |
| **Rocket.new** | Non-technical founders, GTM | Research and a PRD before building; 25,000+ templates; SOC 2, SSO, audit logs | Solve → Build → Intelligence | Two-way GitHub only for Next.js; fixed sync branch; failed generations still billed |
| **Cursor** | Technical | Works in your real repo; parallel local and cloud agents; PR review bot | Open repo → agent → review diff → PR | Surprise bills after a 2025 pricing change; auto-run mode has deleted files; no hosting |
| **OpenAI Codex** | Technical | Bundled with ChatGPT plans; parallel agents in separate worktrees; review queue; sandbox and approval policies | Task → agent in worktree → review → PR | Usage caps; no preview or hosting |
| **Claude Code** | Technical | Handles large repos; hooks, subagents, skills, plugins, MCP; checkpoints with rewind; permission modes | Terminal or IDE → plan → edit → review | Usage caps; terminal-first; no hosting |

## 2. The pattern behind the table

- **App builders win non-technical users with speed and polish, then lose their trust on turn three.** The complaints are the same across Lovable, Emergent, Rocket, v0 and Replit: fix loops that burn credits, bills nobody predicted, and no way to see what the agent is about to do.
- **Coding agents win engineers with control, but stop at the repo.** Cursor, Codex and Claude Code have diffs, worktrees, permissions and rewind, but no preview, no hosting, and nothing a non-technical colleague can open.
- **Almost everyone splits the audience with a mode switch** (Build vs Plan, Chat vs Agent, Soft vs Pro). That admits the product could not design one surface for both people.
- **Nobody governs the agents inside the app they help you build.** Governance, where it exists, is about the coding agent. The agents that ship to production (the ones that email customers or pay claims) get no permission model, no approvals and no evals, except in Lyzr's own Architect.

## 3. Gaps, and how Architect 2.0 answers each one

| Gap in the market | Evidence | What Architect 2.0 does |
|---|---|---|
| **Cost you can predict** | No builder quotes before a task runs; Replit and Rocket bill failed runs; Emergent billed one fix loop 233 times | Every build and change starts as a **Work Order** with time, credits and blast radius. A live spend meter and a hard cap. Fixes for our own mistakes are free and labelled **Our fix** |
| **Stopping doom loops** | Fix loops at Emergent, Rocket, Lovable and v0 | The **repair card** shows what was tried, why it matters and two fixes. The harness stops after the same error twice and hands it to a person (see [ARCHITECTURE.md](ARCHITECTURE.md#5-the-agent-harness)) |
| **Governing production agents** | Replit database deletion, Cursor file deletions, Lovable data exposure | Every tool is **Read**, **Change** or **Can't undo**. Anything irreversible **asks a person first**, in the playground and in production, with rehearsals and replays |
| **Agents from any framework** | Each builder hard-wires one stack (Lyzr SDK, Mastra, its own gateway) | One agent definition compiles to **Lyzr ADK, LangGraph, CrewAI, OpenAI Agents SDK, Google ADK and Mastra**, with an honest list of what does not translate |
| **Handoff between the two audiences** | Lovable cannot import repos; Rocket syncs two ways only for Next.js; Architect needs pre-made branches | **Ask a teammate** sends the exact object, the brief, recent requests and the latest diff. Engineers get a branch and a PR per Work Order; the fix comes back as a plain-English line |
| **Importing existing agent projects** | Imports treat a repo as web code only | Import detects the stack **and the agents and tools inside it**, shows a coverage map, and signs **House Rules** before it touches a file |
| **One surface for both people** | Mode switches everywhere | No mode switch. **Depth is per object**: every screen, agent and connection has a Plain face, a Spec face and a Code face |

## 4. What we borrowed, and from whom

| From | Pattern | Where it lives in Architect 2.0 |
|---|---|---|
| architect.new | Plan, Agents, App as the spine of a project | Blueprint, Agents and Preview tabs |
| Emergent, Cursor | Clarifying questions before building | Three quick questions with sensible defaults |
| Replit | Checkpoints you can roll back to | Save points, always free to return to |
| Lovable, v0 | Visual edits that cost nothing | Point-and-tweak in Preview, 0 credits |
| v0 | Branch per chat, PR into protected main | Branch and PR per Work Order |
| Codex, Claude Code | Explicit permission and approval policies | Read, Change, Can't undo, with Ask first |
| Linear, Raycast | Keyboard-first command menu | ⌘K to jump anywhere |
| Stripe | Clear sandbox labelling | "Test version · only you can see this" and "Sandbox" tags on everything simulated |
| Vercel | Instant rollback by pointer switch | "Update the live version" and rollback in Ship |

## 5. What we deliberately did not copy

- **A builder vs developer toggle.** Most products above split people this way. We think it is the wrong split: an ops lead reads code when it matters, and an engineer wants the plain summary when reviewing.
- **A linear Plan → Build → Ship ribbon as the whole product.** Real projects loop; save points and Work Orders handle that better than a wizard.
- **Chat as the only surface.** The plan, the price and the progress are pinned objects, not messages that scroll away.
- **Credits with no receipt.** Every charge in the activity feed says what it was for, and our own fixes cost nothing.
