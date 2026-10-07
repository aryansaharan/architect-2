import { getSessionUser } from "@/lib/auth";
import { loadSite } from "@/lib/apps/access";
import { readJsonBody } from "@/lib/apps/body";
import { runDataRequest, type DataOp, type DataRequest } from "@/lib/code-apps/data";

export const dynamic = "force-dynamic";

/**
 * prod.data for a published code app (lib/code-apps/data.ts decides everything):
 *   GET    ?collection=&limit=                 list, newest first (at most 200)
 *   POST   { collection, values }              add (or { op: "list"|"add"|"update"|"remove", ... }, one route for the host page)
 *   PATCH  { collection, id, values }          change some fields (null clears one); the team only
 *   DELETE { collection, id }                  remove; the team only
 * Answers { ok: true, result } or { ok: false, error } with a status. Bodies are at most 16 KB.
 */
const MAX_BODY = 16 * 1024;
const OPS = new Set<DataOp>(["list", "add", "update", "remove"]);
const NO_STORE = { "Cache-Control": "no-store" };

async function answer(slug: string, req: DataRequest): Promise<Response> {
  const site = await loadSite(slug);
  if (!site || site.kind !== "code" || !site.build) return Response.json({ ok: false, error: "Not found" }, { status: 404, headers: NO_STORE });
  const r = await runDataRequest(site, await getSessionUser(), req);
  return r.ok ? Response.json({ ok: true, result: r.result }, { headers: NO_STORE }) : Response.json({ ok: false, error: r.error }, { status: r.status, headers: NO_STORE });
}

/** The host page sends `fields` (its own name for them); the contract calls them `values`. Both work. */
const valuesOf = (b: Record<string, unknown>) => (b.values !== undefined ? b.values : b.fields);

async function bodyOf(req: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  const read = await readJsonBody(req, MAX_BODY);
  if (!read.ok) return { ok: false, response: read.response };
  return { ok: true, body: read.value as Record<string, unknown> };
}

export async function GET(req: Request, ctx: RouteContext<"/api/code-apps/live/[slug]/data">) {
  const { slug } = await ctx.params;
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "");
  return answer(slug, { op: "list", collection: url.searchParams.get("collection") ?? "", limit: Number.isFinite(limit) && limit > 0 ? limit : undefined });
}

export async function POST(req: Request, ctx: RouteContext<"/api/code-apps/live/[slug]/data">) {
  const { slug } = await ctx.params;
  const b = await bodyOf(req);
  if (!b.ok) return b.response;
  const op = (b.body.op ?? "add") as DataOp;
  if (!OPS.has(op)) return Response.json({ ok: false, error: "Prod AI doesn't know that request." }, { status: 400 });
  return answer(slug, { op, collection: b.body.collection, limit: b.body.limit, id: b.body.id, values: valuesOf(b.body) });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/code-apps/live/[slug]/data">) {
  const { slug } = await ctx.params;
  const b = await bodyOf(req);
  if (!b.ok) return b.response;
  return answer(slug, { op: "update", collection: b.body.collection, id: b.body.id, values: valuesOf(b.body) });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/code-apps/live/[slug]/data">) {
  const { slug } = await ctx.params;
  const b = await bodyOf(req);
  if (!b.ok) return b.response;
  return answer(slug, { op: "remove", collection: b.body.collection, id: b.body.id });
}
