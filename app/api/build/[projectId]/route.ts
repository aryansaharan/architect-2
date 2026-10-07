import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readJsonBody } from "@/lib/apps/body";
import { withinLimit } from "@/lib/security/rate-limit";
import { runBuild, type BuildBody } from "@/lib/build/run";
import type { BuildEvent } from "@/lib/build/report";

export const dynamic = "force-dynamic";
// The test runs are the long part: at most 12, four at a time, each bounded to 90 s (a cut-off build resumes on the next visit).
export const maxDuration = 300;

/**
 * POST { tests?: boolean } makes a business app real, or picks up the build under way (a reload, a
 * second tab); POST { fix: "a" | "b" | "none" } answers the fix note. Streams NDJSON BuildEvents
 * (lib/build/report.ts). Owner or team only: the project is read through the person's own session.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/build/[projectId]">) {
  const { projectId } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return Response.json({ error: "Project not found" }, { status: 404 });
  const read = await readJsonBody(req, 1024);
  if (!read.ok) return read.response;
  const raw = (read.value ?? {}) as Record<string, unknown>;
  const body: BuildBody = {
    tests: typeof raw.tests === "boolean" ? raw.tests : undefined,
    fix: raw.fix === "a" || raw.fix === "b" || raw.fix === "none" ? raw.fix : undefined,
  };
  if (!(await withinLimit(`build:${user.id}`, 30, 600, { failOpen: true }))) {
    return Response.json({ error: "That's a lot of builds in a few minutes. Wait a moment and try again." }, { status: 429 });
  }
  const supa = await createClient();

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // A closed tab doesn't stop the build: it carries on and saves, and the next visit follows it.
      const emit = (e: BuildEvent) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          // the reader went away
        }
      };
      try {
        await runBuild({ user, supa, emit }, projectId, body);
      } catch (e) {
        console.error("[build] failed:", e instanceof Error ? e.message : e);
        emit({ t: "error", message: "Something went wrong while making it real. Your plan is safe: try again." });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
