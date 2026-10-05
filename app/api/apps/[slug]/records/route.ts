import { getSessionUser } from "@/lib/auth";
import { isTeam, loadSite, roleFor } from "@/lib/apps/access";
import { readJsonBody } from "@/lib/apps/body";
import { liveView } from "@/lib/apps/live";
import { cleanValues, createRecord, fieldSpecs, withDefaults } from "@/lib/apps/records";
import { visitorKey, withinLimit } from "@/lib/security/rate-limit";
import type { Block } from "@/lib/blueprint/schema";

export const dynamic = "force-dynamic";

/** GET: the records this person may see (after a change, the app refreshes from here). */
export async function GET(_req: Request, ctx: RouteContext<"/api/apps/[slug]/records">) {
  const { slug } = await ctx.params;
  const site = await loadSite(slug);
  if (!site) return Response.json({ error: "Not found" }, { status: 404 });
  const view = await liveView(site, await roleFor(site, await getSessionUser()));
  if (view.privateOnly) return Response.json({ error: "Sign in to use this app" }, { status: 403 });
  return Response.json({ records: view.records, hasSample: view.hasSample }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST { entityId, values, formId? }: a new record. A visitor can only submit a public page's form,
 * and only its fields; the team can add a record of any type. Visitors are rate-limited by network.
 * The body is at most 64 KB (lib/apps/body.ts).
 */
export async function POST(req: Request, ctx: RouteContext<"/api/apps/[slug]/records">) {
  const { slug } = await ctx.params;
  const site = await loadSite(slug);
  if (!site) return Response.json({ error: "Not found" }, { status: 404 });
  const read = await readJsonBody(req);
  if (!read.ok) return read.response;
  const body = read.value as { entityId?: unknown; values?: unknown; formId?: unknown };
  const user = await getSessionUser();
  const role = await roleFor(site, user);
  const entity = site.blueprint.entities.find((e) => e.id === body.entityId);
  if (!entity) return Response.json({ error: "Unknown data type" }, { status: 400 });

  const team = isTeam(role);
  const key = team ? `user:${user!.id}:app-write` : `${await visitorKey()}:app-form:${site.projectId}`;
  if (!(await withinLimit(key, team ? 120 : 20, 3600))) return Response.json({ error: "That's a lot of submissions. Try again later." }, { status: 429 });

  const view = await liveView(site, role);
  const allowed = view.canCreate[entity.id];
  if (!allowed?.length) return Response.json({ error: "This page can't add that" }, { status: 403 });
  const form = site.blueprint.screens.flatMap((s) => [...s.regions.main, ...(s.regions.side ?? [])]).find((b): b is Extract<Block, { type: "form" }> => b.type === "form" && b.id === body.formId && b.entityId === entity.id);
  const values = cleanValues(fieldSpecs(entity, form?.fields), body.values, team ? undefined : allowed);
  if (!Object.keys(values).length) return Response.json({ error: "Fill in the form first" }, { status: 400 });
  const data = withDefaults(entity, values);
  const result = await createRecord(site.projectId, entity.id, data, { kind: team ? (role === "owner" ? "owner" : "member") : "visitor", id: team ? user!.id : null }, team ? "team" : "form");
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ record: team ? result.record : { ...result.record, data: {} } });
}
