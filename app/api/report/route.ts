import { z } from "zod";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { visitorKey, withinLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const ReportSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
  reason: z.enum(["phishing", "spam", "harmful", "other"]),
  details: z.string().max(1000).optional(),
});

/**
 * POST { slug, reason, details? } → { ok: true }. "Report this page" on a published app (components/renderer/live-app.tsx).
 * Anyone can send one, a few an hour per network. The reporter is kept only as a hashed IP address.
 */
export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 8000) return Response.json({ ok: false, error: "That report is too long." }, { status: 413 });
  const parsed = ReportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "Pick a reason, and keep the details under 1,000 characters." }, { status: 400 });
  if (!hasAdmin()) return Response.json({ ok: false, error: "Reports aren't switched on for this copy of Prod AI yet." }, { status: 503 });

  const reporter = await visitorKey();
  if (!(await withinLimit(`report:${reporter}`, 5, 3600, { failOpen: false })))
    return Response.json({ ok: false, error: "You've sent a few reports already. Try again in an hour." }, { status: 429 });

  const { slug, reason, details } = parsed.data;
  const admin = adminClient();
  const { data: site, error: readError } = await admin.from("live_sites").select("slug").eq("slug", slug).maybeSingle();
  if (readError) return failed("site lookup", readError.message);
  if (!site) return Response.json({ ok: false, error: "That page isn't published any more." }, { status: 404 });

  const { error } = await admin.from("abuse_reports").insert({ slug, reason, details: details?.trim() || null, reporter_hash: reporter });
  if (error) return failed("insert", error.message);
  return Response.json({ ok: true });
}

function failed(what: string, detail: string) {
  console.error(`[report] ${what} failed`, detail);
  return Response.json({ ok: false, error: "That didn't go through. Try again in a moment." }, { status: 500 });
}
