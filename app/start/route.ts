import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/env";
import { GUEST_LIMIT, visitorKey, withinLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/** A path on this site, parsed the way a browser would ("//evil.com" and "/\evil.com" are other sites). Same rule as app/login. */
function safeNext(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/new";
  try {
    const url = new URL(next, "http://x");
    return url.origin === "http://x" ? url.pathname + url.search + url.hash : "/new";
  } catch {
    return "/new";
  }
}

/** "Continue as a guest": an anonymous session, then straight to a first project from scratch. Nothing is seeded. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  if (!hasSupabase()) return NextResponse.redirect(`${origin}/login?error=setup`);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    // At most 10 new guests an hour from one network. If the limit can't be checked, let people in.
    if (!(await withinLimit(`guest:${await visitorKey()}`, GUEST_LIMIT.max, GUEST_LIMIT.windowSeconds, { failOpen: true })))
      return NextResponse.redirect(`${origin}/login?error=busy&next=${encodeURIComponent(next)}`);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error("[start] anonymous sign-in failed", error.message);
      return NextResponse.redirect(`${origin}/login?error=demo&next=${encodeURIComponent(next)}`);
    }
  }
  return NextResponse.redirect(`${origin}${next}`);
}
