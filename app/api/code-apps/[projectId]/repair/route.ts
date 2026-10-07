import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readJsonBody } from "@/lib/apps/body";
import { codeAppAccess, parseProblem, repairCodeApp } from "@/lib/code-apps/repair";

export const dynamic = "force-dynamic";
// One fix by Claude, and once more if its first answer doesn't pass the checks.
export const maxDuration = 300;

/**
 * POST { errors: BuildError[] } (a failed build) or { runtime: { message, stack } } (a runtime error in the
 * sandbox) → Claude fixes the files, saved as a new version labelled as Prod AI's fix. Free. The owner or
 * the app's team only; at most 3 fixes in a row (then it asks for a note), and rate-limited.
 * Answers { ok: true, version, label, summary, reply, files, code, left } or { error, code } with a status.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/code-apps/[projectId]/repair">) {
  const { projectId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return Response.json({ error: "Not found" }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const read = await readJsonBody(req, 48 * 1024);
  if (!read.ok) return read.response;
  const problem = parseProblem(read.value);
  if (!problem) return Response.json({ error: "Send the errors to fix: { errors: [{ file, line, column, message }] } or { runtime: { message, stack } }." }, { status: 400 });
  const supa = await createClient();
  const access = await codeAppAccess(user, supa, projectId);
  if (!access) return Response.json({ error: "Not found" }, { status: 404 });
  const result = await repairCodeApp(user, access, problem);
  if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status, headers: { "Cache-Control": "no-store" } });
  revalidatePath(`/p/${projectId}`, "layout");
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
