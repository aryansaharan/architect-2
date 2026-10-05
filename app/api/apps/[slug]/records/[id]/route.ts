import { getSessionUser } from "@/lib/auth";
import { isTeam, loadSite, roleFor } from "@/lib/apps/access";
import { readJsonBody } from "@/lib/apps/body";
import { cleanPatch, fieldSpecs, getRecord, updateRecord } from "@/lib/apps/records";
import { withinLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/** PATCH { values }: the team changes some fields of a record (a body of at most 64 KB). The previous values are kept for undo. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/apps/[slug]/records/[id]">) {
  const { slug, id } = await ctx.params;
  const read = await readJsonBody(req);
  if (!read.ok) return read.response;
  const site = await loadSite(slug);
  if (!site) return Response.json({ error: "Not found" }, { status: 404 });
  const user = await getSessionUser();
  const role = await roleFor(site, user);
  if (!isTeam(role)) return Response.json({ error: "Only the app's team can change records" }, { status: 403 });
  if (!(await withinLimit(`user:${user!.id}:app-write`, 120, 3600))) return Response.json({ error: "That's a lot of changes. Try again later." }, { status: 429 });
  const current = await getRecord(site.projectId, id);
  const entity = current && site.blueprint.entities.find((e) => e.id === current.entityId);
  if (!current || !entity) return Response.json({ error: "That record is gone" }, { status: 404 });
  const patch = cleanPatch(fieldSpecs(entity), (read.value as { values?: unknown }).values);
  const result = await updateRecord(site.projectId, id, patch, { kind: role === "owner" ? "owner" : "member", id: user!.id });
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ record: result.record, changeId: result.changeId });
}
