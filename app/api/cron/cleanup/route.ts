import { timingSafeEqual } from "node:crypto";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** True when the request carries "Authorization: Bearer <CRON_SECRET>". Vercel Cron sends it; with no secret set, nobody gets in. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * GET, daily from Vercel Cron (vercel.json): deletes guests who haven't been back for a week
 * (their projects go with them), then prunes old rate-limit windows, budget holds and versions.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!hasAdmin()) return Response.json({ ok: false, error: "SUPABASE_SECRET_KEY is not set" }, { status: 503 });
  const admin = adminClient();

  const { data: ids, error } = await admin.rpc("stale_guest_ids", { p_limit: 200 });
  if (error) {
    console.error("[cron] stale guest lookup failed", error.message);
    return Response.json({ ok: false, error: "Stale guest lookup failed" }, { status: 500 });
  }
  let deleted = 0;
  let failed = 0;
  for (const id of (ids ?? []) as string[]) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(id);
    if (deleteError) {
      failed++;
      console.error("[cron] deleting guest failed", id, deleteError.message);
    } else deleted++;
  }

  const { error: pruneError } = await admin.rpc("prune_housekeeping");
  if (pruneError) console.error("[cron] prune failed", pruneError.message);
  return Response.json({ ok: !pruneError && !failed, staleGuests: (ids ?? []).length, deleted, failed, pruned: !pruneError });
}
