import { getSessionUser } from "@/lib/auth";
import { buildCodeApp, type BuildStep } from "@/lib/code-apps/build";
import { codeProjectFor } from "@/lib/code-apps/build-access";
import type { BuildResult, CodeApp } from "@/lib/code-apps/schema";
import { withinLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Builds are free, but each one runs esbuild on the server: this many per person in ten minutes. */
const BUILDS = { max: 60, windowSeconds: 600 };

type BuildEvent = ({ t: "step" } & BuildStep) | { t: "result"; build: BuildResult };

/**
 * POST: the real build of a code app's saved files (never files from the browser), streamed as NDJSON:
 * { t: "step", id, label, state, detail? } for "Checking the files", "Compiling N files",
 * "Bundling with M packages" and "Ready to start", then { t: "result", build }. The result is saved on
 * the project (projects.build), which is what the sandbox (/run/p/[projectId]) runs. The owner or the
 * app's team only. Free.
 */
export async function POST(_req: Request, ctx: RouteContext<"/api/code-apps/[projectId]/build">) {
  const { projectId } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const found = await codeProjectFor<{ id: string; kind: string; code: CodeApp | null }>(projectId, user, "id, kind, code");
  if (!found) return Response.json({ error: "Not found" }, { status: 404 });
  if (found.row.kind !== "code") return Response.json({ error: "This app isn't written as code, so there's nothing to build here." }, { status: 400 });
  if (!found.row.code) return Response.json({ error: "There are no files to build yet." }, { status: 400 });
  if (!(await withinLimit(`user:${user.id}:code-build`, BUILDS.max, BUILDS.windowSeconds))) return Response.json({ error: "That's a lot of builds in a few minutes. Wait a little, then try again." }, { status: 429 });

  const code = found.row.code;
  // The owner saves through their own session; an invited teammate can't write the project row, so the server does.
  const db = found.role === "owner" ? await createClient() : adminClient();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let open = true;
      const send = (e: BuildEvent) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          open = false;
        }
      };
      let build: BuildResult;
      try {
        build = await buildCodeApp(code, (s) => send({ t: "step", ...s }));
      } catch (e) {
        console.error("[code-apps] build crashed", e instanceof Error ? e.message : e);
        build = { ok: false, at: new Date().toISOString(), hash: "none", errors: [{ message: "The build couldn't run. Try again in a moment." }] };
      }
      const { error } = await db.from("projects").update({ build }).eq("id", projectId);
      if (error) console.error("[code-apps] build save failed", error.message);
      send({ t: "result", build });
      if (open) controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
