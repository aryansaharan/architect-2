import { getSessionUser } from "@/lib/auth";
import { isTeam, loadSite, roleFor } from "@/lib/apps/access";
import { getRecord, recordHistory } from "@/lib/apps/records";

export const dynamic = "force-dynamic";

/**
 * GET: one record's real history, newest first: how it was created (the public form, the team or an
 * AI helper), each change field by field, who made it and when. Only the app's team sees it; a visitor
 * never learns who changed what.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/apps/[slug]/records/[id]/history">) {
  const { slug, id } = await ctx.params;
  const site = await loadSite(slug);
  if (!site) return Response.json({ error: "Not found" }, { status: 404 });
  const role = await roleFor(site, await getSessionUser());
  if (!isTeam(role)) return Response.json({ error: "Only the app's team can see a record's history" }, { status: 403 });
  const record = await getRecord(site.projectId, id);
  if (!record || !site.blueprint.entities.some((e) => e.id === record.entityId)) return Response.json({ error: "That record is gone" }, { status: 404 });
  const agentName = (agentId: string) => site.blueprint.agents.find((a) => a.id === agentId)?.name ?? null;
  const history = await recordHistory(site.projectId, record, site.ownerId, agentName);
  return Response.json({ history }, { headers: { "Cache-Control": "no-store" } });
}
