import { getSessionUser } from "@/lib/auth";
import { readJsonBody } from "@/lib/apps/body";
import { askForCodeApp, readPrompt } from "@/lib/code-apps/bridge-ai";
import { codeProjectFor } from "@/lib/code-apps/build-access";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST { prompt }: prod.ai.ask in the studio's test version of a code app. The owner or the app's team;
 * the person asking pays from their own credits (5 an answer) and is rate-limited by account.
 * Answers { ok: true, answer } or { ok: false, error } with a status.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/code-apps/p/[projectId]/ai">) {
  const { projectId } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return Response.json({ ok: false, error: "Sign in first" }, { status: 401, headers: NO_STORE });
  const read = await readJsonBody(req, 16 * 1024);
  if (!read.ok) return read.response;
  const prompt = readPrompt(read.value);
  if (!prompt.ok) return Response.json({ ok: false, error: prompt.error }, { status: 400, headers: NO_STORE });
  const found = await codeProjectFor<{ kind: string; name: string; title: string | null }>(projectId, user, "kind, name, title:code->manifest->>title");
  if (!found || found.row.kind !== "code") return Response.json({ ok: false, error: "Not found" }, { status: 404, headers: NO_STORE });
  const r = await askForCodeApp({
    prompt: prompt.prompt,
    title: found.row.title || found.row.name || "App",
    projectId,
    payer: { id: user.id, isGuest: user.isAnonymous },
    rateKey: `user:${user.id}`,
    surface: "preview",
    actor: user.id,
  });
  return r.ok ? Response.json({ ok: true, answer: r.answer }, { headers: NO_STORE }) : Response.json({ ok: false, error: r.error }, { status: r.status, headers: NO_STORE });
}
