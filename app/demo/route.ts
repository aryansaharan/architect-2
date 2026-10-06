import { NextResponse, type NextRequest } from "next/server";
import { createClient, type Supa } from "@/lib/supabase/server";
import { seedDemoProject } from "@/lib/demo/seed";
import { hasSupabase } from "@/lib/env";
import { DEMO_LIMIT, GUEST_LIMIT, visitorKey, withinLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

async function existingDemo(supabase: Supa): Promise<string | undefined> {
  const { data } = await supabase.from("projects").select("id").eq("is_demo", true).order("created_at").limit(1).maybeSingle();
  return data?.id as string | undefined;
}

/** A finished example project (linked from the README only): guest session plus a seeded, built project, opened on its Sheet. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  if (!hasSupabase()) return NextResponse.redirect(`${origin}/login?error=setup`);
  const supabase = await createClient();
  const prompt = request.nextUrl.searchParams.get("prompt");

  const { data } = await supabase.auth.getClaims();
  let userId = data?.claims?.sub as string | undefined;

  // Someone who already has the example goes straight back to it: nothing new is created.
  const existing = userId && !prompt ? await existingDemo(supabase) : undefined;
  if (existing) return NextResponse.redirect(`${origin}/p/${existing}`);

  // At most 5 examples seeded and 10 new guests an hour from one network (the guest limit is shared with app/start).
  // If a limit can't be checked, let people in.
  const visitor = await visitorKey();
  if (!prompt && !(await withinLimit(`demo:${visitor}`, DEMO_LIMIT.max, DEMO_LIMIT.windowSeconds, { failOpen: true }))) return NextResponse.redirect(`${origin}/login?error=demo_busy`);

  if (!userId) {
    if (!(await withinLimit(`guest:${visitor}`, GUEST_LIMIT.max, GUEST_LIMIT.windowSeconds, { failOpen: true }))) return NextResponse.redirect(`${origin}/login?error=busy`);
    const { data: signIn, error } = await supabase.auth.signInAnonymously();
    if (error || !signIn.user) {
      console.error("[demo] anonymous sign-in failed", error?.message);
      return NextResponse.redirect(`${origin}/login?error=demo`);
    }
    userId = signIn.user.id;
  }

  if (prompt) return NextResponse.redirect(`${origin}/new?prompt=${encodeURIComponent(prompt.slice(0, 1200))}`);

  let projectId: string;
  try {
    projectId = await seedDemoProject(supabase, userId);
  } catch (e) {
    console.error("[demo] seeding failed", e);
    return NextResponse.redirect(`${origin}/home?error=seed`);
  }
  return NextResponse.redirect(`${origin}/p/${projectId}`);
}
