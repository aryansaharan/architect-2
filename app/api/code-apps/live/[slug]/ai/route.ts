import { getSessionUser } from "@/lib/auth";
import { isTeam, loadSite, roleFor } from "@/lib/apps/access";
import { readJsonBody } from "@/lib/apps/body";
import { askForCodeApp, isGuestAccount, readPrompt } from "@/lib/code-apps/bridge-ai";
import { visitorKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST { prompt }: prod.ai.ask in a published code app. The owner pays (5 credits an answer, from their
 * monthly allowance, within the project's spending cap); the team may always ask, visitors only when the
 * owner allows it (settings.app.publicHelpers). The rate limit follows whoever is asking: a teammate by
 * account, a visitor by network. Answers { ok: true, answer } or { ok: false, error } with a status.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/code-apps/live/[slug]/ai">) {
  const { slug } = await ctx.params;
  const read = await readJsonBody(req, 16 * 1024);
  if (!read.ok) return read.response;
  const prompt = readPrompt(read.value);
  if (!prompt.ok) return Response.json({ ok: false, error: prompt.error }, { status: 400, headers: NO_STORE });
  const site = await loadSite(slug);
  if (!site || site.kind !== "code" || !site.build) return Response.json({ ok: false, error: "Not found" }, { status: 404, headers: NO_STORE });
  const user = await getSessionUser();
  const role = await roleFor(site, user);
  const team = isTeam(role) && user ? user : null;
  if (!team && site.settings.app?.publicHelpers !== true) return Response.json({ ok: false, error: "The AI in this app is only for its team." }, { status: 403, headers: NO_STORE });
  const r = await askForCodeApp({
    prompt: prompt.prompt,
    title: site.build.manifest?.title ?? "App",
    projectId: site.projectId,
    payer: { id: site.ownerId, isGuest: await isGuestAccount(site.ownerId) },
    rateKey: team ? `user:${team.id}` : `${await visitorKey()}:app:${site.projectId}`,
    surface: "live",
    actor: team ? team.id : "visitor",
    capCredits: site.settings.budgetCapCredits,
  });
  return r.ok ? Response.json({ ok: true, answer: r.answer }, { headers: NO_STORE }) : Response.json({ ok: false, error: r.error }, { status: r.status, headers: NO_STORE });
}
