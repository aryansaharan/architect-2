import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/env";

export const dynamic = "force-dynamic";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/new";
}

/** "Continue as a guest": an anonymous session, then straight to a first project from scratch. Nothing is seeded. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  if (!hasSupabase()) return NextResponse.redirect(`${origin}/login?error=setup`);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error("[start] anonymous sign-in failed", error.message);
      return NextResponse.redirect(`${origin}/login?error=demo&next=${encodeURIComponent(next)}`);
    }
  }
  return NextResponse.redirect(`${origin}${next}`);
}
