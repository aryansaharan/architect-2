import { getSessionUser } from "@/lib/auth";
import { codeProjectFor } from "@/lib/code-apps/build-access";
import { sandboxHeaders, sandboxNotice, sandboxPage } from "@/lib/code-apps/sandbox-html";
import type { BuildResult } from "@/lib/code-apps/schema";

export const dynamic = "force-dynamic";

/**
 * GET: the studio's test version of a code app, its latest working build, in the sandbox page
 * (lib/code-apps/sandbox-html.ts). Only the owner or the app's team, from their session cookie; anyone
 * else gets "not found". `?b=<hash>` only makes each build a new address; the latest build is what runs.
 */
export async function GET(_req: Request, ctx: RouteContext<"/run/p/[projectId]">) {
  const { projectId } = await ctx.params;
  const notFound = (message = "This app isn't here.") => new Response(sandboxNotice(message), { status: 404, headers: sandboxHeaders("preview") });
  const user = await getSessionUser();
  if (!user) return notFound();
  const found = await codeProjectFor<{ kind: string; name: string; build: BuildResult | null; title: string | null }>(projectId, user, "kind, name, build, title:code->manifest->>title");
  if (!found || found.row.kind !== "code") return notFound();
  const build = found.row.build;
  if (!build || !build.ok || typeof build.js !== "string") return notFound("There's no working build of this app yet.");
  const page = sandboxPage({ js: build.js, css: typeof build.css === "string" ? build.css : "", title: found.row.title || found.row.name || "App", mode: "preview" });
  return new Response(page, { headers: sandboxHeaders("preview") });
}
