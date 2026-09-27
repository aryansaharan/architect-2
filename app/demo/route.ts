import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { seedDemoProject } from "@/lib/demo/seed";
import { hasSupabase } from "@/lib/env";

export const dynamic = "force-dynamic";

/** A finished example project for reviewers (linked from the README only): guest session plus a seeded, built project, opened on its Sheet. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  if (!hasSupabase()) return NextResponse.redirect(`${origin}/login?error=setup`);
  const supabase = await createClient();
  const prompt = request.nextUrl.searchParams.get("prompt");

  const { data } = await supabase.auth.getClaims();
  let userId = data?.claims?.sub as string | undefined;
  if (!userId) {
    const { data: signIn, error } = await supabase.auth.signInAnonymously();
    if (error || !signIn.user) {
      console.error("[demo] anonymous sign-in failed", error?.message);
      return NextResponse.redirect(`${origin}/login?error=demo`);
    }
    userId = signIn.user.id;
  }

  if (prompt) return NextResponse.redirect(`${origin}/new?prompt=${encodeURIComponent(prompt.slice(0, 1200))}`);

  const { data: existing } = await supabase.from("projects").select("id").eq("is_demo", true).order("created_at").limit(1).maybeSingle();
  let projectId = existing?.id as string | undefined;
  if (!projectId) {
    try {
      projectId = await seedDemoProject(supabase, userId);
    } catch (e) {
      console.error("[demo] seeding failed", e);
      return NextResponse.redirect(`${origin}/home?error=seed`);
    }
  }
  return NextResponse.redirect(`${origin}/p/${projectId}`);
}
