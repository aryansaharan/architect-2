import "server-only";
import type { Supa } from "@/lib/supabase/server";
import type { SessionUser } from "@/lib/auth";
import { USD_PER_CREDIT } from "@/lib/blueprint/estimate";

/**
 * Protects the model bill from a busy demo day: each person gets a daily model
 * budget (credits of real model spend). Past it, features switch to their
 * scripted/offline path: the product keeps working, it just stops calling Claude.
 * Planning and quotes are free to the person (0 credits on their meter), so the
 * budget counts each event's real model cost as well as its credits.
 */
const DAILY = { guest: 150, member: 600 } as const;

export async function modelBudgetOk(supa: Supa, user: SessionUser): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await supa
    .from("usage_events")
    .select("credits, cost_usd, kind")
    .eq("user_id", user.id)
    .in("kind", ["llm", "import", "agent_run"])
    .gte("created_at", since)
    .not("model", "is", null)
    .limit(2000);
  const spent = (data ?? []).reduce((s, r) => s + Math.max(Number(r.credits) || 0, (Number(r.cost_usd) || 0) / USD_PER_CREDIT), 0);
  return spent < (user.isAnonymous ? DAILY.guest : DAILY.member);
}
