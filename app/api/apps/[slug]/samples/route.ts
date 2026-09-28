import { getSessionUser } from "@/lib/auth";
import { loadSite, roleFor } from "@/lib/apps/access";
import { clearSampleRecords } from "@/lib/apps/records";
import { withinLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * DELETE: the owner removes the sample records the app was published with. Records people added
 * stay. Only the owner can do this (not invited teammates): it can't be undone.
 */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/apps/[slug]/samples">) {
  const { slug } = await ctx.params;
  const site = await loadSite(slug);
  if (!site) return Response.json({ error: "Not found" }, { status: 404 });
  const user = await getSessionUser();
  if ((await roleFor(site, user)) !== "owner") return Response.json({ error: "Only the app's owner can clear its sample data" }, { status: 403 });
  if (!(await withinLimit(`user:${user!.id}:app-write`, 120, 3600))) return Response.json({ error: "That's a lot of changes. Try again later." }, { status: 429 });
  const cleared = await clearSampleRecords(site.projectId);
  return Response.json({ cleared });
}
