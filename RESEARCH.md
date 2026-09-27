# Exploration: what the market does, and where Prod AI fits

The brief asked for an exploration of architect.new, Replit, Lovable, Emergent, Vercel v0, Rocket.new, Cursor, Codex and Claude Code: how they differ, why people adopt them, their features, UI/UX patterns and flows. This is that research (checked against each product's docs and press in September 2026), and how it shaped Prod AI. Every claim below is backed by a link in [Sources](#7-sources).

## 1. The nine products in one page

| Product | Built for | Why people adopt it | Core flow | Where it hurts |
|---|---|---|---|---|
| **architect.new** (Lyzr) | Non-technical, enterprise | Agents are first-class, not bolted on; an AI Consultant proposes what to build; 24 built-in integrations plus custom tools and MCP; agent evals that escalate to a person below a confidence threshold | Prompt or AI Consultant → Plan (PRD) → Agents → App → deploy | Agents run only on Lyzr Studio, and editing one means leaving for Studio; no cost estimate before a run; a branch must already exist on GitHub before you can switch to it |
| **Replit Agent** | Both | Everything in one place (database, hosting, secrets); plan mode and a task board; imports from GitHub, Figma, Bolt and Lovable (via GitHub) | Prompt → plan and task cards → build with preview → publish | Effort-based pricing (June 2025) and Agent 3 (September 2025) produced bills users did not expect, including for failed attempts; an agent deleted a production database during a code freeze in July 2025 |
| **Lovable** | Non-technical | Polished UI output; a preview toolbar for visual edits; backend and AI with no API keys | Prompt → chat left, preview right → visual edits → publish | Exports to GitHub but cannot import a repo; edits one branch at a time; a row-level-security gap exposed user data in 170 of 1,645 scanned apps (CVE-2025-48757), and a 2026 permissions regression exposed public projects' chats and code |
| **Emergent** | Non-technical | A team of agents (plan, design, code, test); mobile apps via Expo; asks clarifying questions first | Prompt → questions → visible build stages → preview → deploy | Users report fix loops billed per attempt; one Trustpilot reviewer says a single login bug was billed for fixes 233 times |
| **Vercel v0** | Both (since the February 2026 relaunch) | Vercel's deploy pipeline; imports a repo into a Vercel Sandbox; a branch per chat and PRs | Chat beside Preview, Code and Design tabs → branch menu → PR → publish | Token pricing with no per-prompt quote; chat history and files count as input, so cost grows with context; deploys go through Vercel |
| **Rocket.new** | Non-technical founders, GTM | Research and a PRD before building (Solve); 25K+ templates; SOC 2, SSO and audit logs | Solve → Build → Intelligence | Two-way GitHub sync only for Next.js + TypeScript projects; syncs through a fixed `rocket-update` branch; free fixes only for Rocket-detected errors on paid plans |
| **Cursor** | Technical | Works in your real repo; up to 8 parallel agents in worktrees, plus cloud agents; Bugbot reviews PRs | Open repo → agent → review diff → PR | The June 2025 pricing change caused surprise bills (Cursor apologised and refunded); auto-run (YOLO) mode has deleted user files; no hosting |
| **OpenAI Codex** | Technical | Included in ChatGPT plans; parallel agents in separate worktrees; sandbox modes and approval policies | Task → agent in worktree → review diff → PR | Usage limits per 5-hour window plus weekly caps; preview only in the ChatGPT app's built-in browser; hosting only through Sites (beta) |
| **Claude Code** | Technical | Terminal, IDE, desktop and web; hooks, subagents, skills, plugins, MCP; checkpoints with rewind; permission modes | Plan → edit → review diff → PR | Usage limits on subscription plans; preview only for local dev servers in the desktop app; no hosting |

## 2. UI/UX and flow notes

**architect.new (Lyzr).**
- Starts from a prompt box, or from the AI Consultant, which interviews you (role, time sinks, tools) and proposes three tailored agent apps with estimated hours saved.
- A build moves through three tabs: Plan (a generated PRD you approve or edit), Agents (the agent network), App (code preview plus chat). Deploy gives a public URL.
- Signature interaction: a Plan toggle in the message box that answers without building anything. Editing an agent jumps out to Lyzr Studio.

**Replit Agent.**
- Two-panel editor: Agent chat on one side, live preview on the other (including mobile emulators), Publish at the top right.
- Plan mode turns a request into tasks on a board (Drafts, Active, Ready, Done). Each task runs in an isolated copy and changes nothing until you apply it.
- Signature interaction (Agent 4, March 2026): a design canvas where "Generate variants" on any element shows alternatives in place.

**Lovable.**
- Chat on the left, live preview on the right, Share and Publish above the preview.
- A mode picker switches between Build (edits code), Chat (discusses only) and Plan. Each reply shows what changed, so it can be undone.
- Signature interaction: the preview toolbar. Select an element and describe the change, edit text inline, draw an annotation, or leave a comment.

**Emergent.**
- Conversational start: after the prompt, the agent asks clarifying questions (which LLM key, whether to add login, design direction) before it builds.
- The build shows live, checkmarked stages ("Created project structure", "Set up MongoDB database"), then a preview link.
- Signature interaction: for mobile apps, scan a QR code with Expo Go to run the app on your own phone; store submission needs no Mac.

**Vercel v0.**
- Chat beside a panel with Preview, Code and Design tabs; Publish and a branch menu sit in the chat header.
- Every chat is its own git branch. The branch menu shows the preview deployment, diff, PR and CI checks; Publish merges the PR and waits for the production deploy.
- Signature interaction: Design Mode. Select an element in the preview and restyle it visually or with an instruction.

**Rocket.new.**
- Three separate workspaces: Solve (a business question becomes a cited report or PRD), Build (chat beside a live preview, plus a Code tab), Intelligence (competitor signals as ranked cards).
- Build's preview toolbar switches devices (desktop down to specific phone models) and keeps versions you can compare, roll back and label.
- Signature interaction: screen-aware slash commands (`/Change App Theme`, `/Fix Hydration Errors`) and `@file` scoped edits, which Rocket says use fewer credits; plus click-to-edit visual edits.

**Cursor.**
- Cursor 3's Agents Window is agent-first: a sidebar lists every local and cloud agent (including ones started from Slack, GitHub or Linear), shown as tabs side by side or in a grid. The classic IDE is one switch away.
- Flow: open the repo, start an agent (local, worktree or cloud), review its diffs, then commit and manage the PR without leaving the app. Cloud agents come back with screenshots or demos.
- Signature interaction: run up to 8 agents on one prompt in separate worktrees and keep the best result; Bugbot then reviews the PR.

**OpenAI Codex.**
- ChatGPT desktop app with a sidebar of projects, chats and pull requests. Each chat runs locally, in a git worktree or in a cloud environment, with an integrated terminal.
- Flow: start a task, the agent works in its own worktree, you review the diff, then commit or push, or hand the chat off to your local checkout.
- Signature interaction: the built-in browser previews localhost and lets you comment on page elements for the agent; Sites (beta) can host the result.

**Claude Code.**
- Runs in the terminal, VS Code and JetBrains, a desktop app and the web. The desktop app arranges chat, diff, browser, terminal and plan as panes.
- Flow: plan mode, then edits, then the diff viewer (comment on a line), then a PR with CI status. Shift+Tab cycles permission modes.
- Signature interaction: Esc twice (or `/rewind`) restores code, conversation or both to any earlier prompt.

## 3. The pattern behind the table

- **App builders win non-technical users with speed and polish, then lose their trust on turn three.** The complaints rhyme: bills nobody predicted (Replit's pricing changes, v0's context-based token pricing, Cursor's 2025 switch), fix attempts that cost money (Emergent and Replit user reports), and no way to see what the agent is about to do or what it will cost.
- **Coding agents win engineers with control, but stop at the repo.** Cursor, Codex and Claude Code have diffs, worktrees, permissions and rewind. Previews are arriving (Codex's built-in browser, Claude Code's desktop preview) and Codex has a hosting beta, but there is still nothing a non-technical colleague can open, price or govern.
- **Products switch modes instead of changing depth.** Lovable has Build, Chat and Plan modes; Replit adds a plan mode; Cursor offers the Agents Window or the classic IDE. Each is a separate surface, not one surface that goes deeper when you need it.
- **Almost nobody governs the agents inside the app they help you build.** Governance, where it exists, is about the coding agent (Codex and Claude Code approval policies). The agents that ship to production (the ones that email customers or pay claims) get no permission model, no approvals and no evals. The exception is architect.new's Agent Eval, which escalates low-confidence actions to a person.

## 4. Gaps, and how Prod AI answers each one

| Gap in the market | Evidence | What Prod AI does |
|---|---|---|
| **Cost you can predict** | No product quotes a task before it runs (v0 shows per-model prices only; architect.new's credits docs show no estimate); Replit users report paying for failed attempts; one Emergent reviewer reports a single bug billed 233 times | Nothing runs without a price. The sketch shows what the build will cost before **Make it real**, and every note in the margin gets the change in plain words and its price before **Apply** (a Work Order, under the hood). A live spend meter and a hard cap. Fixes for our own mistakes are free and labelled **Our fix** |
| **Stopping doom loops** | Paid fix loops in Emergent and Replit user reports; Rocket's free Fix-it covers only errors Rocket detects, on paid plans | When a test run catches a problem, a **note on the sheet** shows what was tried, why it matters and two free fixes. The harness stops after the same error twice and hands it to a person (see [ARCHITECTURE.md](ARCHITECTURE.md#7-the-agent-harness)) |
| **Governing production agents** | Replit database deletion, Cursor file deletions, Lovable data exposure | Every tool is **Read**, **Change** or **Can't undo**. Anything irreversible **asks a person first**, in **Try it** on the AI helpers tab and in production, with test runs (rehearsals) and replays |
| **Agents from any framework** | Builders hard-wire one agent stack (architect.new builds Lyzr Studio agents) | One agent definition compiles to **Lyzr ADK, LangGraph, CrewAI, OpenAI Agents SDK, Google ADK and Mastra**, with an honest list of what does not translate |
| **Handoff between the two audiences** | Lovable cannot import repos; Rocket syncs two ways only for Next.js + TypeScript; architect.new needs branches pushed to GitHub first | **Ask a teammate** sends the exact object, the brief, recent requests and the latest diff. Engineers get a branch and a PR per change; the fix comes back as a plain-English line |
| **Importing existing agent projects** | Imports (Replit, v0) bring in code and environment; none we found maps the agents and tools inside a repo | Import detects the stack **and the agents and tools inside it**, shows a coverage map, and agrees **House Rules** before anything is proposed. The repo stays untouched; new files arrive in one `prodai/` folder as PR #1 |
| **One surface for both people** | Mode switches instead of depth (section 3) | No mode switch. The Sheet speaks plain English for everyone; **Under the hood** holds the Plan map (every object with Plain, Settings and Code faces), Code and GitHub, and Handoffs for whoever wants the depth |

## 5. What we borrowed, and from whom

| From | Pattern | Where it lives in Prod AI |
|---|---|---|
| architect.new | Plan, Agents, App as the spine of a project | The Sheet (the plan as a sketch that becomes the app), the AI helpers tab, and the Plan map under the hood |
| Emergent, architect.new | Clarifying questions before building | A few brief-aware questions on /new, with "Skip, use sensible defaults" |
| Replit, Claude Code | Checkpoints you can roll back to | Versions: "Applied · version N" with Undo, always free to return to |
| Lovable, v0 | Visual edits in the preview | "Point and write a note" on the real app, and point-and-tweak in Preview and tweak (0 credits) |
| v0 | Branch per chat, PR into protected main | Branch and PR per applied change (Code and GitHub, sandboxed) |
| Codex, Claude Code | Explicit permission and approval policies | "What it's allowed to do": Just do it, Tell me, Ask first; can't-undo actions always ask first |
| Linear, Raycast | Keyboard-first command menu | ⌘K to jump anywhere |
| Stripe | Clear sandbox labelling | "Test version · only you can see this" and "Sandbox" tags on everything simulated |
| Vercel | Instant rollback by pointer switch | Versions and rollback on the Publish tab |

## 6. What we deliberately did not copy

- **A builder vs developer toggle.** Most products above split people this way. We think it is the wrong split: an ops lead reads code when it matters, and an engineer wants the plain summary when reviewing.
- **A linear Plan → Build → Ship ribbon as the whole product.** Real projects loop; versions and priced notes in the margin handle that better than a wizard.
- **Chat on the left, preview on the right.** Nearly every builder above uses this layout, and the brief asked us not to copy any of them. Prod AI's project is one sheet of paper: the app in the middle, notes in the margin.
- **Chat as the only surface.** The plan, the price and the progress live on the Sheet, not in messages that scroll away. Notes in the margin are threads tied to what they changed.
- **Credits with no receipt.** Every charge in the margin's thread says what it was for, and our own fixes cost nothing.

## 7. Sources

All links were opened and checked in September 2026.

**architect.new (Lyzr)**
- [AI Consultant](https://docs.architect.new/introduction/platform/ai-consultant.md)
- [Build guide (Plan, Agents, App)](https://docs.architect.new/build/build-guide.md)
- [Plan mode](https://docs.architect.new/build/plan-mode.md)
- [GitHub connect (branches must exist on GitHub)](https://docs.architect.new/build/github-connect.md)
- [Architect vs Studio](https://docs.architect.new/introduction/platform/architect-vs-studio.md)
- [Docs index, including the integrations list](https://docs.architect.new/llms.txt)
- [Plans and credits](https://docs.architect.new/introduction/essentials/plans-credits.md)
- [Launch press release, Agent Eval and human escalation (Feb 2026)](https://natlawreview.com/press-releases/lyzr-launches-architect-first-enterprise-grade-text-agent-platform-building)
- [SiliconANGLE launch coverage (Feb 2026)](https://siliconangle.com/2026/02/06/exclusive-startup-lyzr-ai-launches-app-builder-aimed-moving-agents-production-volume/)

**Replit**
- [Effort-based pricing recap](https://replit.com/blog/effort-based-pricing-recap)
- [The Register: Agent 3 pricing complaints (Sep 2025)](https://www.theregister.com/2025/09/18/replit_agent3_pricing/)
- [Fortune: agent wiped a production database (Jul 2025)](https://fortune.com/2025/07/23/ai-coding-tool-replit-wiped-database-called-it-a-catastrophic-failure/)
- [Task system docs](https://docs.replit.com/core-concepts/agent/task-system)
- [Import to Replit](https://docs.replit.com/replit-app/import-to-replit)
- [Project editor](https://docs.replit.com/core-concepts/workspace)
- [Introducing Agent 4 (Mar 2026)](https://replit.com/blog/introducing-agent-4-built-for-creativity)

**Lovable**
- [Matt Palmer: statement on CVE-2025-48757 (170 of 1,645 apps)](https://mattpalmer.io/posts/statement-on-CVE-2025-48757/)
- [Semafor: Lovable security coverage (May 2025)](https://www.semafor.com/article/05/29/2025/the-hottest-new-vibe-coding-startup-lovable-is-a-sitting-duck-for-hackers)
- [Lovable: response to the April 2026 incident](https://lovable.dev/blog/our-response-to-the-april-2026-incident)
- [GitHub integration (export only, one branch)](https://docs.lovable.dev/integrations/github)
- [Preview toolbar (formerly Visual Edits)](https://docs.lovable.dev/features/visual-edit)
- [Chat and modes](https://docs.lovable.dev/features/projects/chat)
- [AI features with no API keys](https://docs.lovable.dev/features/ai)

**Emergent**
- [How to build an AI app (agent team, clarifying questions)](https://emergent.sh/learn/how-to-build-an-ai-app)
- [Your first app](https://help.emergent.sh/first-app)
- [Mobile app development (Expo)](https://help.emergent.sh/mobile-app-development)
- [FAQs](https://help.emergent.sh/faqs)
- [Trustpilot reviews (source of the 233 fixes report)](https://www.trustpilot.com/review/app.emergent.sh)

**Vercel v0**
- [Introducing the new v0 (Feb 2026)](https://vercel.com/blog/introducing-the-new-v0)
- [GitHub: branch per chat, PRs, publish](https://v0.app/docs/github)
- [Git import into a Vercel Sandbox](https://v0.app/docs/git-import)
- [Pricing docs (context counts as input)](https://v0.app/docs/pricing)
- [Quickstart](https://v0.app/docs/quickstart)

**Rocket.new**
- [Introduction: Solve, Build, Intelligence](https://docs.rocket.new/getting-started/introduction)
- [GitHub code sync (Next.js + TypeScript, `rocket-update` branch)](https://docs.rocket.new/build/connectors/github/code-sync.md)
- [Templates (25K+)](https://www.rocket.new/templates)
- [Build page (SOC 2, SSO, audit logs)](https://www.rocket.new/build)
- [Editor chat](https://docs.rocket.new/build/editor/chat.md)
- [Preview toolbar and versions](https://docs.rocket.new/build/editor/preview.md)
- [Commands](https://docs.rocket.new/build/editor/commands.md)
- [Visual edit](https://docs.rocket.new/build/editor/visual-edit.md)
- [Credits (free Fix-it on paid plans)](https://docs.rocket.new/getting-started/credits.md)
- [Solve overview](https://docs.rocket.new/solve/overview.md)
- [Intelligence overview](https://docs.rocket.new/intelligence/overview.md)

**Cursor**
- [Clarifying our pricing (Jul 2025)](https://cursor.com/blog/june-2025-pricing)
- [TechCrunch: Cursor apologises for pricing changes (Jul 2025)](https://techcrunch.com/2025/07/07/cursor-apologizes-for-unclear-pricing-changes-that-upset-users/)
- [Forum: YOLO mode and delete-file protection](https://forum.cursor.com/t/yolo-mode-delete-file-protection/46170)
- [Forum: agent removes files through shell commands](https://forum.cursor.com/t/agent-ignores-yolo-mode-setting-being-off-and-removes-files-via-shell-commands/63145)
- [machine.news: YOLO mode wipes a user's machine (Jun 2025)](https://www.machine.news/it-felt-like-ultron-took-over-cursor-goes-rogue-in-yolo-mode-deletes-itself-and-everything-else/)
- [The Register: Cursor safeguards bypassed (Jul 2025)](https://www.theregister.com/2025/07/21/cursor_ai_safeguards_easily_bypassed/)
- [Meet the new Cursor (Cursor 3)](https://cursor.com/blog/cursor-3)
- [Cursor 2.0 changelog (parallel agents)](https://cursor.com/changelog/2-0)
- [Cloud agents](https://cursor.com/docs/cloud-agent)
- [Agents Window](https://cursor.com/docs/agent/agents-window)
- [Bugbot](https://cursor.com/docs/bugbot)

**OpenAI Codex**
- [Pricing and usage limits](https://learn.chatgpt.com/docs/pricing)
- [Worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)
- [Approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security)
- [Features](https://learn.chatgpt.com/docs/features)
- [Built-in browser](https://learn.chatgpt.com/docs/browser?surface=app)
- [Sites (beta)](https://learn.chatgpt.com/docs/sites)

**Claude Code**
- [Overview](https://code.claude.com/docs/en/overview)
- [Plugins](https://code.claude.com/docs/en/plugins)
- [Checkpointing and rewind](https://code.claude.com/docs/en/checkpointing)
- [Permission modes](https://code.claude.com/docs/en/permission-modes)
- [Desktop app](https://code.claude.com/docs/en/desktop)
- [Preview, review and merge with Claude Code (Feb 2026)](https://claude.com/blog/preview-review-and-merge-with-claude-code)
