import { loadSite } from "@/lib/apps/access";
import { sandboxHeaders, sandboxNotice, sandboxPage } from "@/lib/code-apps/sandbox-html";

export const dynamic = "force-dynamic";

const notFound = () => new Response(sandboxNotice("This app isn't here."), { status: 404, headers: sandboxHeaders("live") });

/**
 * GET: a published code app, its published build (live_sites.build), in the sandbox page. Public: the
 * page can't act as anyone (opaque origin), and its data and AI go through the host page to routes that
 * check who is asking. A plain 404 when the link is malformed or unknown, nothing is published there,
 * it's a business app, or it was taken down.
 */
export async function GET(req: Request, ctx: RouteContext<"/run/live/[slug]">) {
  try {
    const { slug } = await ctx.params;
    const site = await loadSite(slug);
    const build = site?.kind === "code" ? site.build : null;
    if (!site || !build || typeof build.js !== "string" || typeof build.hash !== "string") return notFound();
    const etag = `"${build.hash}-${Date.parse(site.publishedAt) || 0}"`;
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: sandboxHeaders("live", { ETag: etag }) });
    const page = sandboxPage({ js: build.js, css: typeof build.css === "string" ? build.css : "", title: build.manifest?.title || "App", mode: "live" });
    return new Response(page, { headers: sandboxHeaders("live", { ETag: etag }) });
  } catch (e) {
    console.error("[code-apps] live sandbox failed", e instanceof Error ? e.message : e);
    return notFound();
  }
}
