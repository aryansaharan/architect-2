import { z } from "zod";

/**
 * The Blueprint is the single source of truth for a project.
 * Canvas, Preview, /live, generated code, diffs and the build script
 * are all pure functions of this object.
 */

const Id = z.string().min(1);

export const ActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("navigate"), screenId: Id }),
  z.object({ kind: z.literal("toast"), message: z.string() }),
  z.object({ kind: z.literal("agent"), agentId: Id, prompt: z.string() }),
  z.object({ kind: z.literal("openDetail"), entityId: Id }),
]);
export type Action = z.infer<typeof ActionSchema>;

export const ButtonSchema = z.object({
  label: z.string(),
  variant: z.enum(["primary", "secondary", "ghost", "danger"]).default("secondary"),
  action: ActionSchema,
});
export type ButtonSpec = z.infer<typeof ButtonSchema>;

export const FieldKind = z.enum(["text", "textarea", "number", "date", "select", "toggle", "file"]);

export const BlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("kpis"),
    id: Id,
    items: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
          delta: z.string().optional(),
          tone: z.enum(["neutral", "good", "bad"]).default("neutral"),
        }),
      )
      .min(1)
      .max(6),
  }),
  z.object({
    type: z.literal("table"),
    id: Id,
    title: z.string().optional(),
    entityId: Id,
    columns: z.array(z.string()).min(1).max(8),
    filters: z.array(z.string()).default([]),
    rowAction: ActionSchema.optional(),
    pageSize: z.number().int().default(8),
    /**
     * Default row order. `order` ranks values top first (for enum columns, e.g. Urgent, High, Normal, Low);
     * values it doesn't list follow in their natural order. "desc" reverses the whole order.
     */
    sort: z
      .object({
        column: z.string(),
        dir: z.enum(["asc", "desc"]).default("asc"),
        order: z.array(z.string()).max(12).optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("list"),
    id: Id,
    title: z.string().optional(),
    entityId: Id,
    titleField: z.string(),
    subtitleField: z.string().optional(),
    badgeField: z.string().optional(),
    onSelect: ActionSchema.optional(),
  }),
  z.object({
    type: z.literal("detail"),
    id: Id,
    title: z.string().optional(),
    entityId: Id,
    fields: z.array(z.string()).min(1),
    actions: z.array(ButtonSchema).default([]),
  }),
  z.object({
    type: z.literal("form"),
    id: Id,
    title: z.string(),
    entityId: Id.optional(),
    fields: z
      .array(
        z.object({
          name: z.string(),
          label: z.string(),
          kind: FieldKind,
          options: z.array(z.string()).optional(),
          required: z.boolean().default(false),
        }),
      )
      .min(1)
      .max(10),
    submitLabel: z.string().default("Submit"),
    onSubmit: ActionSchema,
  }),
  z.object({
    type: z.literal("chat"),
    id: Id,
    agentId: Id,
    title: z.string().optional(),
    placeholder: z.string().default("Ask…"),
    starters: z.array(z.string()).max(4).default([]),
  }),
  z.object({
    type: z.literal("timeline"),
    id: Id,
    title: z.string().optional(),
    items: z
      .array(
        z.object({
          title: z.string(),
          when: z.string(),
          state: z.enum(["done", "active", "pending"]),
        }),
      )
      .min(1)
      .max(8),
  }),
  z.object({ type: z.literal("text"), id: Id, title: z.string().optional(), markdown: z.string() }),
  z.object({ type: z.literal("actions"), id: Id, buttons: z.array(ButtonSchema).min(1).max(4) }),
]);
export type Block = z.infer<typeof BlockSchema>;
export type BlockType = Block["type"];

export const ScreenSchema = z.object({
  id: Id,
  slug: z.string(),
  title: z.string(),
  icon: z.string(), // lucide icon name, resolved by an allow-list
  purpose: z.string(),
  plain: z.string(),
  layout: z.enum(["dashboard", "split", "single", "form"]),
  regions: z.object({
    main: z.array(BlockSchema).min(1).max(5),
    side: z.array(BlockSchema).max(3).default([]),
  }),
  audience: z.enum(["team", "customer", "admin"]).default("team"),
  status: z.enum(["planned", "built"]).default("planned"),
});
export type Screen = z.infer<typeof ScreenSchema>;

export const EntityFieldType = z.enum(["string", "number", "boolean", "date", "enum", "money", "text", "ref"]);
export const EntitySchema = z.object({
  id: Id,
  name: z.string(),
  plural: z.string(),
  plain: z.string(),
  fields: z
    .array(
      z.object({
        name: z.string(),
        label: z.string().optional(),
        type: EntityFieldType,
        options: z.array(z.string()).optional(),
        ref: Id.optional(),
      }),
    )
    .min(1)
    .max(12),
  sample: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))).max(12),
});
export type Entity = z.infer<typeof EntitySchema>;

export const ConnectionKind = z.enum([
  "database",
  "crm",
  "email",
  "http",
  "mcp",
  "slack",
  "calendar",
  "payments",
  "storage",
  "llm",
  "docs",
]);
export const ConnectionSchema = z.object({
  id: Id,
  name: z.string(),
  kind: ConnectionKind,
  auth: z.enum(["oauth", "api_key", "none"]),
  status: z.enum(["configured", "missing"]).default("missing"),
  plain: z.string(),
});
export type Connection = z.infer<typeof ConnectionSchema>;

export const ToolAccess = z.enum(["read", "write", "irreversible"]);
export const ToolPermission = z.enum(["auto", "log", "ask"]);
export type ToolAccess = z.infer<typeof ToolAccess>;
export type ToolPermission = z.infer<typeof ToolPermission>;

export const AgentToolSchema = z.object({
  id: Id,
  name: z.string(),
  description: z.string(),
  connectionId: Id,
  access: ToolAccess,
  permission: ToolPermission,
});
export type AgentTool = z.infer<typeof AgentToolSchema>;

export const RehearsalSchema = z.object({
  id: Id,
  name: z.string(),
  input: z.string(),
  expect: z.string(),
  history: z
    .array(z.object({ at: z.string(), pass: z.boolean(), note: z.string() }))
    .default([]),
});
export type Rehearsal = z.infer<typeof RehearsalSchema>;

export const Frameworks = ["lyzr", "langgraph", "crewai", "openai_agents", "google_adk", "mastra"] as const;
export const FrameworkSchema = z.enum(Frameworks);
export type Framework = z.infer<typeof FrameworkSchema>;

export const AgentSchema = z.object({
  id: Id,
  name: z.string(),
  role: z.string(),
  avatarHue: z.number().int().min(0).max(360),
  plain: z.string(),
  jobDescription: z.string(),
  rules: z.array(z.string()).min(1).max(8),
  tools: z.array(AgentToolSchema).max(6),
  supervision: z.enum(["autonomous", "spot_check", "approve_all"]),
  knowledge: z
    .array(z.object({ label: z.string(), source: z.enum(["entity", "document", "url"]), ref: z.string() }))
    .default([]),
  memory: z.object({
    scope: z.enum(["none", "session", "project", "org"]),
    retentionDays: z.number().int().default(30),
  }),
  cost: z.object({ creditsPerRun: z.number(), model: z.string() }),
  triggers: z.array(z.enum(["manual", "on_create", "schedule", "chat"])).default(["chat"]),
  rehearsals: z.array(RehearsalSchema).max(8).default([]),
  framework: FrameworkSchema.default("lyzr"),
  origin: z.enum(["generated", "imported", "endpoint"]).default("generated"),
});
export type Agent = z.infer<typeof AgentSchema>;

export const EstimateSchema = z.object({
  /** Minutes a real build takes in production. The demo's simulated build is far shorter: show both (buildTimeLabel). */
  minutes: z.number(),
  credits: z.number(),
  files: z.number(),
  agentsTouched: z.number(),
  confidence: z.enum(["low", "medium", "high"]),
  breakdown: z.array(z.object({ label: z.string(), credits: z.number() })),
});
export type Estimate = z.infer<typeof EstimateSchema>;

export const Verticals = ["claims", "support", "sales", "hr", "custom"] as const;
export const VerticalSchema = z.enum(Verticals);
export type Vertical = z.infer<typeof VerticalSchema>;

export const BlueprintSchema = z.object({
  version: z.literal(1),
  meta: z.object({
    name: z.string(),
    tagline: z.string(),
    vertical: VerticalSchema,
    plain: z.string(),
    theme: z.object({
      primary: z.string(),
      radius: z.enum(["sm", "md", "lg"]),
      density: z.enum(["compact", "comfortable"]),
      mode: z.enum(["light", "dark"]).default("light"),
    }),
    auth: z.object({ enabled: z.boolean(), providers: z.array(z.enum(["google", "email", "sso"])) }),
    region: z.enum(["us", "eu", "in"]),
  }),
  screens: z.array(ScreenSchema).min(1).max(8),
  agents: z.array(AgentSchema).min(1).max(6),
  entities: z.array(EntitySchema).min(1).max(8),
  connections: z.array(ConnectionSchema).max(8),
  estimate: EstimateSchema,
});
export type Blueprint = z.infer<typeof BlueprintSchema>;
/** Input shape (before zod defaults are applied): what fixtures are authored in. */
export type BlueprintInput = z.input<typeof BlueprintSchema>;

export const ObjectTypes = [
  "brief",
  "screen",
  "block",
  "agent",
  "entity",
  "connection",
  "buildStep",
  "deployCheck",
] as const;
export type ObjectType = (typeof ObjectTypes)[number];
export type ObjectRef = { type: ObjectType; id: string };

export function parseRef(sel: string | null | undefined): ObjectRef | null {
  if (!sel) return null;
  const i = sel.indexOf(":");
  if (i < 1) return null;
  const type = sel.slice(0, i) as ObjectType;
  const id = sel.slice(i + 1);
  if (!ObjectTypes.includes(type) || !id) return null;
  return { type, id };
}
export function refToString(ref: ObjectRef): string {
  return `${ref.type}:${ref.id}`;
}

export const defaultPermissionFor = (access: ToolAccess): ToolPermission =>
  access === "read" ? "auto" : access === "write" ? "log" : "ask";

export type TableSort = NonNullable<Extract<Block, { type: "table" }>["sort"]>;

const isEmpty = (v: unknown) => v === undefined || v === null || v === "";

/**
 * Rows in a table's order, the same everywhere a table is shown: values ranked in `order` come first
 * (top first), the rest follow in natural order (numbers by size, text A to Z, ISO dates oldest first).
 * "desc" reverses that. Empty values always sink to the bottom, and ties keep their original order.
 */
export function sortRows<T>(rows: T[], valueOf: (row: T) => unknown, sort: { dir: "asc" | "desc"; order?: string[] }): T[] {
  const rank = (sort.order ?? []).map((x) => x.toLowerCase());
  const at = (v: unknown) => {
    const i = rank.indexOf(String(v).toLowerCase());
    return i === -1 ? rank.length : i;
  };
  const sign = sort.dir === "desc" ? -1 : 1;
  return rows
    .map((row, i) => ({ row, i, v: valueOf(row) }))
    .sort((a, b) => {
      const ea = isEmpty(a.v);
      const eb = isEmpty(b.v);
      if (ea || eb) return ea === eb ? a.i - b.i : ea ? 1 : -1;
      let d = at(a.v) - at(b.v);
      if (!d) {
        if (typeof a.v === "number" && typeof b.v === "number") d = a.v - b.v;
        else if (typeof a.v === "boolean" && typeof b.v === "boolean") d = Number(a.v) - Number(b.v);
        else d = String(a.v).localeCompare(String(b.v), "en", { numeric: true, sensitivity: "base" });
      }
      return sign * d || a.i - b.i;
    })
    .map((x) => x.row);
}

/** Which rows come first, in words: "Urgent first", "newest first", "A to Z". */
export function sortPhrase(sort: { dir: "asc" | "desc"; order?: string[] }, type?: string): string {
  const desc = sort.dir === "desc";
  if (sort.order?.length) return `${desc ? sort.order[sort.order.length - 1] : sort.order[0]} first`;
  if (type === "number" || type === "money") return desc ? "highest first" : "lowest first";
  if (type === "date") return desc ? "newest first" : "oldest first";
  if (type === "boolean") return desc ? "Yes first" : "No first";
  return desc ? "Z to A" : "A to Z";
}
