import "server-only";
import { DEFAULT_FRAMEWORK, type Block, type Blueprint } from "@/lib/blueprint/schema";
import { QUOTED_RULES } from "@/lib/sim/demo-chat";
import { isTeam, type AppRole, type LiveSite } from "./access";
import { hasSampleRecords, listRecords, type AppRecord } from "./records";
import { blockActions, hiddenBlock, pick, publicAccess } from "./view";

/**
 * What a visitor's browser gets: the screens, sample data and what the scripted chat reads
 * (lib/sim/demo-chat.ts, components/renderer). Each agent's job description, rules, memory, model,
 * tests and other builder-only fields stay on the server.
 */
export function forVisitors(bp: Blueprint): Blueprint {
  return {
    ...bp,
    meta: { ...bp.meta, plain: "", theme: { ...bp.meta.theme, primary: /^#[0-9a-fA-F]{6}$/.test(bp.meta.theme.primary) ? bp.meta.theme.primary : "#0F766E" } },
    screens: bp.screens.map((s) => ({ ...s, plain: "" })),
    entities: bp.entities.map((e) => ({ ...e, plain: "" })),
    connections: bp.connections.map((c) => ({ id: c.id, name: c.name, kind: c.kind, auth: c.auth, status: c.status, plain: "" })),
    agents: bp.agents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      avatarHue: a.avatarHue,
      plain: "",
      jobDescription: "",
      rules: a.rules.filter((r) => Object.values(QUOTED_RULES).some((re) => re.test(r))),
      tools: a.tools.map((t) => ({ id: t.id, name: t.name, description: t.description, connectionId: t.connectionId, access: t.access, permission: t.permission })),
      supervision: a.supervision,
      knowledge: a.knowledge.filter((k) => k.source === "entity").map((k) => ({ label: "", source: k.source, ref: k.ref })),
      memory: { scope: "none", retentionDays: 0 },
      cost: { creditsPerRun: 0, model: "" },
      triggers: [],
      rehearsals: [],
      framework: DEFAULT_FRAMEWORK,
      origin: "generated",
    })),
    estimate: { minutes: 0, credits: 0, files: 0, agentsTouched: 0, confidence: "low", breakdown: [] },
  };
}

/**
 * What one person sees of a published app. The team (owner and invited people) gets every screen,
 * every data type and every field. A visitor gets only the public pages, only the data types those
 * pages use, and only the fields they display; they can submit the public forms and nothing else.
 */
export type LiveView = {
  role: AppRole;
  bp: Blueprint;
  records: Record<string, AppRecord[]>;
  /** Data type → fields this person may submit (a visitor: the public forms' fields). */
  canCreate: Record<string, string[]>;
  /** The team can change records (and undo). */
  canEdit: boolean;
  /** The app still holds the sample data it was published with. */
  hasSample: boolean;
  /** Nothing here is public and this person isn't on the team: show the sign-in wall. */
  privateOnly: boolean;
};

export async function liveView(site: LiveSite, role: AppRole): Promise<LiveView> {
  const bp = forVisitors(site.blueprint);
  if (isTeam(role)) {
    const records = await listRecords(site.projectId, bp.entities.map((e) => e.id));
    const canCreate = Object.fromEntries(bp.entities.map((e) => [e.id, e.fields.map((f) => f.name)]));
    return { role, bp: withoutSamples(bp), records, canCreate, canEdit: true, hasSample: await hasSampleRecords(site.projectId), privateOnly: false };
  }
  const access = publicAccess(site.blueprint, site.settings.app?.hiddenEntities);
  if (!access.screens.length) return { role, bp: { ...withoutSamples(bp), screens: [] }, records: {}, canCreate: {}, canEdit: false, hasSample: false, privateOnly: true };
  // Public pages that hiding left with nothing but text are already gone from access.screens (lib/apps/view.ts).
  const screens = new Set(access.screens);
  const used = new Set([...Object.keys(access.read), ...Object.keys(access.create)]);
  const hidden = new Set(site.settings.app?.hiddenEntities ?? []);
  const visible = (b: Block) => !hiddenBlock(b, hidden);
  // The AI helpers a visitor can meet: one with a chat on their pages, or one a button there asks.
  const helperIds = new Set(
    bp.screens
      .filter((s) => screens.has(s.id))
      .flatMap((s) => [...s.regions.main, ...(s.regions.side ?? [])])
      .filter(visible)
      .flatMap((b) => (b.type === "chat" ? [b.agentId] : blockActions(b).flatMap((a) => (a.kind === "agent" ? [a.agentId] : [])))),
  );
  const agents = bp.agents.filter((a) => helperIds.has(a.id));
  const connections = new Set(agents.flatMap((a) => a.tools.map((t) => t.connectionId)));
  // A visitor's copy names only what their pages use: of each data type, the fields those pages show or
  // collect, and only the connections their AI helpers' tools use. The rest of the plan stays on the server.
  const view: Blueprint = {
    ...withoutSamples(bp),
    // A data type the owner hid from public pages leaves no trace there: no list of it, no form for it.
    screens: bp.screens
      .filter((s) => screens.has(s.id))
      .map((s) => ({ ...s, regions: { ...s.regions, main: s.regions.main.filter(visible), side: (s.regions.side ?? []).filter(visible) } })),
    entities: withoutSamples(bp)
      .entities.filter((e) => used.has(e.id))
      .map((e) => {
        const keep = new Set([...(access.read[e.id] ?? []), ...(access.create[e.id] ?? [])]);
        return { ...e, fields: e.fields.filter((f) => keep.has(f.name)) };
      }),
    agents,
    connections: bp.connections.filter((c) => connections.has(c.id)),
  };
  const all = await listRecords(site.projectId, Object.keys(access.read));
  const records = Object.fromEntries(Object.entries(all).map(([e, rows]) => [e, rows.map((r) => ({ ...r, data: pick(r.data, access.read[e]) as AppRecord["data"] }))]));
  return { role, bp: view, records, canCreate: access.create, canEdit: false, hasSample: Object.values(all).some((rows) => rows.some((r) => r.isSample)), privateOnly: false };
}

/** Records come from the database now; the plan's inline samples never reach the browser. */
function withoutSamples(bp: Blueprint): Blueprint {
  return { ...bp, entities: bp.entities.map((e) => ({ ...e, sample: [] })) };
}
