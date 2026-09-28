import { getSessionUser } from "@/lib/auth";
import { analyzeRepo } from "@/lib/import/analyze";
import { defaultHouseRules } from "@/lib/import/detect";
import { withinLimit } from "@/lib/security/rate-limit";
import { sign } from "@/lib/security/sign";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  // Each analysis makes about 25 GitHub requests on the shared token, so one person can't use up its hourly quota.
  if (!(await withinLimit(`user:${user.id}:analyze`, 12, 600))) return Response.json({ error: "That's a lot of repositories in a few minutes. Wait a little, then try again." }, { status: 429 });
  const { repo } = (await req.json().catch(() => ({}))) as { repo?: unknown };
  const result = await analyzeRepo(typeof repo === "string" ? repo : "");
  if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: 400 });
  // Signed, so the import step can trust that this is the analysis the server made, unedited.
  return Response.json({ report: result.report, sig: sign(result.report), houseRules: defaultHouseRules(result.report) });
}
