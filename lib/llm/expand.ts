import {
  BlueprintSchema,
  defaultPermissionFor,
  type Agent,
  type Block,
  type Blueprint,
  type Connection,
  type Entity,
  type Screen,
  type Vertical,
} from "@/lib/blueprint/schema";
import { estimate } from "@/lib/blueprint/estimate";
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

const ICONS: Record<string, string> = {
  queue: "inbox",
  dashboard: "layout-dashboard",
  detail: "file-text",
  form: "file-plus",
  assistant: "sparkles",
  report: "bar-chart-3",
};

function coerce(value: string, type: string): string | number | boolean {
  const v = (value ?? "").toString().trim();
  if (type === "number" || type === "money") {
    const n = Number(v.replace(/[$,£€₹\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  if (type === "boolean") return /^(true|yes|y|1)$/i.test(v);
  return v;
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
  const connIds = new Set<string>();
  let missingAssigned = false;
  const connections: Connection[] = draft.connections.slice(0, 6).map((c) => {
    const needsKey = c.auth === "api_key" && c.kind !== "database";
    const status = c.kind === "database" || !needsKey || missingAssigned ? "configured" : "missing";
    if (status === "missing") missingAssigned = true;
    return {
      id: uniq(kebab(c.name), connIds),
      name: c.name,
      kind: c.kind,
      auth: c.kind === "database" ? "none" : c.auth,
      status,
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
        permission: defaultPermissionFor(t.access),
      };
    });
    const id = uniq(kebab(a.name), agentIds);
    const rules = a.rules.filter(Boolean).slice(0, 6);
    return {
      id,
      name: a.name,
      role: a.role,
      avatarHue: hash(id) % 360,
      plain: a.description,
      jobDescription: a.jobDescription,
      rules: rules.length ? rules : ["Ask a person when you are unsure."],
      tools,
      supervision: a.supervision,
      knowledge: [],
      memory: { scope: a.memory, retentionDays: a.memory === "org" ? 365 : 30 },
      cost: { creditsPerRun: Math.max(1, Math.round(1 + tools.length / 2)), model: opts.modelId },
      triggers: ["chat"],
      rehearsals: a.rehearsals.slice(0, 4).map((r, i) => ({ id: `r-${kebab(r.name)}-${i}`, name: r.name, input: r.input, expect: r.expect, history: [] })),
      framework: "lyzr",
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
        : { type: "kpis", id: bid(id, "kpis"), items: [
            { label: `${entity.plural}`, value: String(entity.sample.length * 7 + 3), tone: "neutral" },
            { label: "Handled by agents", value: `${60 + (hash(id) % 30)}%`, tone: "good" },
          ] };
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
            fields: entity.fields.slice(0, 7).map((f) => ({
              name: f.name,
              label: f.label ?? f.name,
              kind: f.type === "enum" ? "select" : f.type === "text" ? "textarea" : f.type === "date" ? "date" : f.type === "number" || f.type === "money" ? "number" : f.type === "boolean" ? "toggle" : "text",
              ...(f.type === "enum" && f.options ? { options: f.options } : {}),
              required: false,
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
      icon: ICONS[s.kind] ?? "layout-dashboard",
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

  const bp: Blueprint = BlueprintSchema.parse({
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
  });
  const errs = integrityErrors(bp);
  if (errs.length) throw new Error(`expanded blueprint failed integrity: ${errs.slice(0, 3).join("; ")}`);
  bp.estimate = estimate(bp);
  return bp;
}
