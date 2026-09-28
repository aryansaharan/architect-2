import { getSessionUser } from "@/lib/auth";
import { isTeam, loadSite, roleFor } from "@/lib/apps/access";
import { undoChange } from "@/lib/apps/records";

export const dynamic = "force-dynamic";

/** POST { changeId }: the team puts a record back the way it was before one change. */
export async function POST(req: Request, ctx: RouteContext<"/api/apps/[slug]/undo">) {
  const { slug } = await ctx.params;
  const site = await loadSite(slug);
  if (!site) return Response.json({ error: "Not found" }, { status: 404 });
  const user = await getSessionUser();
  const role = await roleFor(site, user);
  if (!isTeam(role)) return Response.json({ error: "Only the app's team can undo changes" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { changeId?: unknown } | null;
  if (typeof body?.changeId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.changeId)) return Response.json({ error: "Unknown change" }, { status: 400 });
  const result = await undoChange(site.projectId, body.changeId, { kind: role === "owner" ? "owner" : "member", id: user!.id });
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ record: result.record });
}
