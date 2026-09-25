import { getSessionUser } from "@/lib/auth";
import { analyzeRepo } from "@/lib/import/analyze";
import { defaultHouseRules } from "@/lib/import/detect";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { repo } = (await req.json().catch(() => ({}))) as { repo?: string };
  const result = await analyzeRepo(repo ?? "");
  if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: 400 });
  return Response.json({ report: result.report, houseRules: defaultHouseRules(result.report) });
}
