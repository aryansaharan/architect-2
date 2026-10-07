import { getSessionUser } from "@/lib/auth";
import { codeProjectFor } from "@/lib/code-apps/build-access";
import { exportZip } from "@/lib/code-apps/export";
import { CodeAppSchema, type CodeApp } from "@/lib/code-apps/schema";
import { withinLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET: a code app's saved files as a runnable Vite project (.zip): package.json, vite.config.js,
 * index.html, src/ with the app's files, a local stand-in for prod (records in localStorage) and a
 * README. `npm install && npm run dev` runs it. The owner or the app's team only. Free.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/code-apps/[projectId]/export">) {
  const { projectId } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const found = await codeProjectFor<{ kind: string; name: string; code: CodeApp | null }>(projectId, user, "kind, name, code");
  if (!found || found.row.kind !== "code") return Response.json({ error: "Not found" }, { status: 404 });
  const app = CodeAppSchema.safeParse(found.row.code);
  if (!app.success) return Response.json({ error: "This app's files aren't ready to download yet." }, { status: 400 });
  if (!(await withinLimit(`user:${user.id}:code-export`, 30, 600, { failOpen: true }))) return Response.json({ error: "That's a lot of downloads in a few minutes. Try again soon." }, { status: 429 });
  const { filename, bytes } = await exportZip(app.data, found.row.name);
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
