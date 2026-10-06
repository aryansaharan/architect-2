import {
  BlueprintSchema,
  DEFAULT_FRAMEWORK,
  clipToLimits,
  type Agent,
  type Block,
  type Blueprint,
  type Connection,
  type Entity,
  type Screen,
  type Vertical,
} from "@/lib/blueprint/schema";
import { estimate } from "@/lib/blueprint/estimate";
import { presetPermission } from "@/lib/blueprint/describe";
import { PRICE } from "@/lib/prices";
import { integrityErrors } from "@/lib/blueprint/validate";
import { hash } from "@/lib/sim/hash";
import type { Draft } from "./draft";

const kebab = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "item";
const snake = (s: string) => kebab(s).replace(/-/g, "_");

function uniq(base: string, used: Set<string>): string {
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

function fuzzyFind<T>(items: T[], name: string, key: (t: T) => string): T | undefined {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  return (
    items.find((i) => key(i).toLowerCase() === n) ??
    items.find((i) => key(i).toLowerCase().includes(n) || n.includes(key(i).toLowerCase()))
  );
}

const PALETTE: Record<Vertical, string> = {
  claims: "#0F766E",
  support: "#4F46E5",
  sales: "#0369A1",
  hr: "#7C3AED",
  custom: "#B45309",
};

/**
 * Screen icons by purpose, from the set the renderer draws (components/icon.tsx). The words in a
 * screen's title and purpose win over its layout kind ("Payout approvals" is an approvals screen even
 * when laid out as a queue), and each purpose has alternatives so two screens rarely share an icon.
 */
const PURPOSE_ICONS: { purpose: string; match: RegExp; icons: string[] }[] = [
  { purpose: "approvals", match: /\b(approv\w*|sign[- ]?offs?|authori[sz]\w*|review queue|needs review|awaiting review)\b/i, icons: ["shield-check", "key-round", "clipboard-list"] },
  { purpose: "calendar", match: /\b(calendar|schedul\w*|bookings?|appointments?|shifts?|rota|roster|availability|events?|timeline|deadlines?)\b/i, icons: ["calendar", "calendar-check"] },
  { purpose: "money", match: /\b(payouts?|payments?|invoices?|billing|refunds?|expenses?|payroll|budgets?|quotes?)\b/i, icons: ["wallet", "receipt", "credit-card"] },
  { purpose: "people", match: /\b(people|team|staff|employees?|hires?|candidates?|customers?|clients?|contacts?|members?|directory|adjusters?|agents? desk|patients?|tenants?|students?|volunteers?|vendors?|suppliers?|accounts|technicians?|engineers?|crews?|drivers?|workers?|reps)\b/i, icons: ["users", "user-plus", "building-2"] },
  { purpose: "reports", match: /\b(reports?|reporting|analytics?|insights?|metrics?|trends?|forecasts?|performance|kpis?|stats?|statistics)\b/i, icons: ["bar-chart-3", "layout-dashboard", "newspaper"] },
  { purpose: "dashboard", match: /\b(dashboards?|overview|home|summary|at a glance|command cent(er|re))\b/i, icons: ["layout-dashboard", "bar-chart-3", "radar"] },
  { purpose: "incidents", match: /\b(incidents?|outages?|alerts?|escalations?|on-?call|emergenc\w*)\b/i, icons: ["siren", "radar"] },
  { purpose: "knowledge", match: /\b(knowledge|help cent(er|re)|articles?|docs|documentation|policies|playbooks?|runbooks?|library|guides?)\b/i, icons: ["book-open", "newspaper"] },
  { purpose: "research", match: /\b(research|search|lookup|prospect\w*|signals?|leads?|discover\w*)\b/i, icons: ["radar", "search"] },
  { purpose: "messages", match: /\b(messages?|emails?|outreach|campaigns?|drafts?|replies|conversations?|chats?)\b/i, icons: ["mail", "send", "message-square"] },
  { purpose: "queue", match: /\b(queues?|inbox|triage|backlog|intake|worklist|to-?do)\b/i, icons: ["inbox", "clipboard-list", "ticket"] },
  { purpose: "tickets", match: /\b(tickets?|cases?|issues?|requests?)\b/i, icons: ["ticket", "inbox", "clipboard-list"] },
];
const KIND_ICONS: Record<string, string[]> = {
  queue: ["inbox", "clipboard-list", "ticket"],
  dashboard: ["layout-dashboard", "bar-chart-3", "radar"],
  report: ["bar-chart-3", "newspaper", "layout-dashboard"],
  detail: ["file-text", "clipboard-list", "newspaper"],
  form: ["file-plus", "send", "clipboard-list"],
  assistant: ["sparkles", "message-square", "bot"],
};

/** The icon for one screen: detail and form screens keep their kind's icon (a record, a form), others follow their words. */
function screenIcon(s: { kind: string; title: string; purpose: string }, used: Set<string>): string {
  const text = `${s.title} ${s.purpose}`;
  const byWords = PURPOSE_ICONS.find((p) => p.match.test(s.title)) ?? PURPOSE_ICONS.find((p) => p.match.test(text));
  const byKind = KIND_ICONS[s.kind] ?? ["layout-dashboard"];
  // A detail screen is about one record and a form collects one; those shapes read clearer than the topic.
  const pool = s.kind === "detail" || s.kind === "form" || s.kind === "assistant" || !byWords ? [...byKind, ...(byWords?.icons ?? [])] : [...byWords.icons, ...byKind];
  const pick = pool.find((i) => !used.has(i)) ?? pool[0];
  used.add(pick);
  return pick;
}

function coerce(value: string, type: string): string | number | boolean {
  const v = (value ?? "").toString().trim();
  if (type === "number" || type === "money") {
    const n = Number(v.replace(/[$,£€₹\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  if (type === "boolean") return /^(true|yes|y|1)$/i.test(v);
  return v;
}

/**
 * Headline numbers for a screen the model gave none: the record count and the
 * size of the first status, both counted from the sample rows (the renderer
 * recounts them live), never invented.
 */
function fallbackKpis(entity: Entity): Extract<Block, { type: "kpis" }>["items"] {
  const status = entity.fields.find((f) => f.type === "enum" && /status|stage|state/i.test(f.name) && f.options?.length) ?? entity.fields.find((f) => f.type === "enum" && f.options?.length);
  const items: Extract<Block, { type: "kpis" }>["items"] = [{ label: entity.plural, value: String(entity.sample.length), tone: "neutral" }];
  const first = status?.options?.find((o) => entity.sample.some((r) => r[status.name] === o)) ?? status?.options?.[0];
  if (status && first) items.push({ label: first, value: String(entity.sample.filter((r) => r[status.name] === first).length), tone: "neutral" });
  return items;
}

export function expandDraft(draft: Draft, opts: { modelId: string }): Blueprint {
  const vertical = draft.vertical;

  // ---- entities
  const entityIds = new Set<string>();
  const entities: Entity[] = draft.entities.slice(0, 6).map((e) => {
    const usedFields = new Set<string>();
    const fields = e.fields.slice(0, 10).map((f) => ({
      name: uniq(snake(f.name || f.label), usedFields).replace(/-/g, "_"),
      label: f.label || f.name,
      type: f.type,
      ...(f.type === "enum" && f.options.length ? { options: f.options.slice(0, 8) } : {}),
    }));
    if (!fields.length) fields.push({ name: "name", label: "Name", type: "string" });
    const sample = e.sampleRows.slice(0, 10).map((row) => {
      const rec: Record<string, string | number | boolean> = {};
      fields.forEach((f, i) => {
        rec[f.name] = coerce(row[i] ?? "", f.type);
      });
      return rec;
    });
    return {
      id: uniq(kebab(e.name), entityIds),
      name: e.name,
      plural: e.plural || `${e.name}s`,
      plain: e.description,
      fields,
      sample,
    };
  });
  if (!entities.length) throw new Error("draft has no entities");

  // ---- connections (always one app database)
  // Honest from the first save: nothing outside the app is connected when a plan is made. Every outside
  // system starts as "missing" (not connected, test data) until someone adds its keys. Only the app's own
  // database, which Prod AI creates, is ready. The routes apply startNotConnected (draft.ts) again on top.
  const connIds = new Set<string>();
  let ownDb = false;
  const connections: Connection[] = draft.connections.slice(0, 6).map((c) => {
    const own = c.kind === "database" && !ownDb;
    if (own) ownDb = true;
    return {
      id: uniq(kebab(c.name), connIds),
      name: c.name,
      kind: c.kind,
      auth: own ? "none" : c.auth,
      status: own ? "configured" : "missing",
      plain: c.description,
    };
  });
  if (!connections.some((c) => c.kind === "database")) {
    connections.unshift({ id: uniq("app-db", connIds), name: "App database", kind: "database", auth: "none", status: "configured", plain: "Where this app's records are stored. Created for you." });
  }
  const db = connections.find((c) => c.kind === "database")!;

  // ---- agents
  const agentIds = new Set<string>();
  const agents: Agent[] = draft.agents.slice(0, 4).map((a) => {
    const toolIds = new Set<string>();
    const tools = a.tools.slice(0, 5).map((t) => {
      const conn = fuzzyFind(connections, t.connection, (c) => c.name) ?? db;
      return {
        id: uniq(snake(t.name), toolIds).replace(/-/g, "_"),
        name: t.name,
        description: t.description,
        connectionId: conn.id,
        access: t.access,
        // Supervision is a preset that writes every tool's permission, so a drafted agent never reads "Custom".
        permission: presetPermission(a.supervision, t.access),
      };
    });
    const id = uniq(kebab(a.name), agentIds);
    const rules = a.rules.filter(Boolean).slice(0, 6);
    const jobDescription = a.jobDescription;
    const guardrails = rules.length ? rules : ["Ask a person when you are unsure."];
    return {
      id,
      name: a.name,
      role: a.role,
      avatarHue: hash(id) % 360,
      plain: a.description,
      jobDescription,
      rules: guardrails,
      tools,
      supervision: a.supervision,
      knowledge: [],
      memory: { scope: a.memory, retentionDays: a.memory === "org" ? 365 : 30 },
      // One price for each message Claude answers, whatever the helper (lib/prices.ts).
      cost: { creditsPerRun: PRICE.helperMessage, model: opts.modelId },
      triggers: ["chat"],
      rehearsals: a.rehearsals.slice(0, 4).map((r, i) => ({ id: `r-${kebab(r.name)}-${i}`, name: r.name, input: r.input, expect: r.expect, history: [] })),
      framework: DEFAULT_FRAMEWORK,
      origin: "generated",
    };
  });
  if (!agents.length) throw new Error("draft has no agents");

  // ---- screens (deterministic layouts per kind)
  const screenIds = new Set<string>();
  const blockIds = new Set<string>();
  const bid = (screenId: string, kind: string) => uniq(`${screenId}-${kind}`, blockIds);

  const drafts = draft.screens.slice(0, 6);
  const idsByTitle = drafts.map((s) => uniq(kebab(s.title), screenIds));
  const usedIcons = new Set<string>();
  const iconsByScreen = drafts.map((s) => screenIcon(s, usedIcons));
  const detailScreenFor = (entityId: string) => {
    const i = drafts.findIndex((s, k) => s.kind === "detail" && (fuzzyFind(entities, s.entity, (e) => e.name) ?? entities[0]).id === entityId && k >= 0);
    return i >= 0 ? idsByTitle[i] : undefined;
  };

  const screens: Screen[] = drafts.map((s, i) => {
    const id = idsByTitle[i];
    const entity = fuzzyFind(entities, s.entity, (e) => e.name) ?? fuzzyFind(entities, s.entity, (e) => e.plural) ?? entities[0];
    const agent = fuzzyFind(agents, s.agent, (a) => a.name);
    const fieldNames = entity.fields.map((f) => f.name);
    const enumFields = entity.fields.filter((f) => f.type === "enum").map((f) => f.name);
    const titleField = entity.fields[0].name;
    const subtitleField = entity.fields.find((f, k) => k > 0 && (f.type === "string" || f.type === "enum"))?.name;
    const badgeField = entity.fields.find((f) => f.type === "enum" || f.type === "number")?.name;
    const metrics = s.metrics.slice(0, 4).map((m) => ({ label: m.label, value: m.value, tone: "neutral" as const }));
    const kpis: Block | null =
      metrics.length > 0
        ? { type: "kpis", id: bid(id, "kpis"), items: metrics }
        : { type: "kpis", id: bid(id, "kpis"), items: fallbackKpis(entity) };
    const chat: Block | null = agent
      ? { type: "chat", id: bid(id, "chat"), agentId: agent.id, title: `Ask ${agent.name}`, placeholder: `Ask ${agent.name}…`, starters: agent.rehearsals.slice(0, 2).map((r) => r.input.slice(0, 80)) }
      : null;
    const detailTarget = detailScreenFor(entity.id);
    const table: Block = {
      type: "table",
      id: bid(id, "table"),
      title: entity.plural,
      entityId: entity.id,
      columns: fieldNames.filter((n) => entity.fields.find((f) => f.name === n)?.type !== "text").slice(0, 6),
      filters: enumFields.slice(0, 2),
      ...(detailTarget && detailTarget !== id ? { rowAction: { kind: "navigate" as const, screenId: detailTarget } } : {}),
      pageSize: 8,
    };
    if (!table.columns.length) table.columns = [titleField];

    let main: Block[] = [];
    let side: Block[] = [];
    let layout: Screen["layout"] = "dashboard";
    switch (s.kind) {
      case "queue":
      case "report":
        main = [kpis!, table];
        side = chat ? [chat] : [];
        layout = "dashboard";
        break;
      case "dashboard":
        main = [kpis!, { type: "list", id: bid(id, "list"), title: entity.plural, entityId: entity.id, titleField, ...(subtitleField ? { subtitleField } : {}), ...(badgeField ? { badgeField } : {}) }];
        side = chat ? [chat] : [{ type: "text", id: bid(id, "note"), title: "About this screen", markdown: s.description }];
        layout = "dashboard";
        break;
      case "detail":
        main = [
          {
            type: "detail",
            id: bid(id, "detail"),
            title: entity.name,
            entityId: entity.id,
            fields: fieldNames.slice(0, 9),
            actions: agents
              .filter((a) => a.id === agent?.id || a.tools.some((t) => t.access !== "read"))
              .slice(0, 2)
              .map((a, k) => ({ label: `Ask ${a.name}`, variant: k === 0 ? ("primary" as const) : ("secondary" as const), action: { kind: "agent" as const, agentId: a.id, prompt: `Help with this ${entity.name.toLowerCase()}.` } })),
          },
          {
            type: "timeline",
            id: bid(id, "timeline"),
            title: "History",
            items: [
              { title: `${entity.name} created`, when: "09:02", state: "done" },
              { title: `Reviewed by ${agent?.name ?? agents[0].name}`, when: "09:04", state: "done" },
              { title: "Waiting for a decision", when: "Now", state: "active" },
              { title: "Closed", when: "Pending", state: "pending" },
            ],
          },
        ];
        side = chat ? [chat] : [];
        layout = "split";
        break;
      case "form":
        main = [
          {
            type: "form",
            id: bid(id, "form"),
            title: s.purpose.slice(0, 60) || `New ${entity.name.toLowerCase()}`,
            entityId: entity.id,
            fields: entity.fields.slice(0, 7).map((f, k) => ({
              name: f.name,
              label: f.label ?? f.name,
              kind: f.type === "enum" ? "select" : f.type === "text" ? "textarea" : f.type === "date" ? "date" : f.type === "number" || f.type === "money" ? "number" : f.type === "boolean" ? "toggle" : "text",
              ...(f.type === "enum" && f.options ? { options: f.options } : {}),
              // The first field is the record's human-readable identifier, so a form can't be sent without it.
              required: k === 0 && f.type !== "boolean",
            })),
            submitLabel: "Submit",
            onSubmit: { kind: "toast", message: `${entity.name} received. ${agent ? `${agent.name} will pick it up in a moment.` : "Thanks!"}` },
          },
        ];
        side = [{ type: "text", id: bid(id, "help"), title: "What happens next", markdown: s.description }];
        layout = "form";
        break;
      case "assistant":
        main = chat ? [chat] : [{ type: "text", id: bid(id, "note"), markdown: s.description }];
        side = [{ type: "list", id: bid(id, "list"), title: entity.plural, entityId: entity.id, titleField, ...(subtitleField ? { subtitleField } : {}) }];
        layout = "split";
        break;
    }
    return {
      id,
      slug: id.split("-")[0] + (i ? "" : ""),
      title: s.title,
      icon: iconsByScreen[i],
      purpose: s.purpose,
      plain: s.description,
      layout,
      regions: { main, side },
      audience: s.audience,
      status: "planned",
    };
  });
  // unique slugs
  const slugs = new Set<string>();
  screens.forEach((s) => (s.slug = uniq(s.slug || s.id, slugs)));
  if (!screens.length) throw new Error("draft has no screens");

  // Make sure at least one chat exists (agents need a place to be talked to).
  if (!screens.some((s) => [...s.regions.main, ...s.regions.side].some((b) => b.type === "chat"))) {
    const target = screens[0];
    if (target.regions.side.length < 3)
      target.regions.side.push({ type: "chat", id: uniq(`${target.id}-chat`, blockIds), agentId: agents[0].id, title: `Ask ${agents[0].name}`, placeholder: "Ask…", starters: [] });
  }
  // knowledge: agents read the entities shown next to them
  for (const a of agents) {
    const ents = new Set<string>();
    for (const s of screens) {
      const blocks = [...s.regions.main, ...s.regions.side];
      if (blocks.some((b) => b.type === "chat" && b.agentId === a.id)) blocks.forEach((b) => "entityId" in b && b.entityId && ents.add(b.entityId));
    }
    a.knowledge = [...ents].slice(0, 3).map((e) => ({ label: entities.find((x) => x.id === e)!.plural, source: "entity" as const, ref: e }));
  }

  const bp: Blueprint = BlueprintSchema.parse(clipToLimits({
    version: 1,
    meta: {
      name: draft.name,
      tagline: draft.tagline,
      vertical,
      plain: draft.summary,
      theme: { primary: PALETTE[vertical], radius: "md", density: "comfortable", mode: "light" },
      auth: { enabled: true, providers: ["google", "email"] },
      region: "us",
    },
    screens,
    agents,
    entities,
    connections,
    estimate: { minutes: 0, credits: 0, files: 0, agentsTouched: 0, confidence: "high", breakdown: [] },
  }));
  const errs = integrityErrors(bp);
  if (errs.length) throw new Error(`expanded blueprint failed integrity: ${errs.slice(0, 3).join("; ")}`);
  bp.estimate = estimate(bp);
  return bp;
}
