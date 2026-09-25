import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  isAnonymous: boolean;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  provider: string | null;
};

/** Verified user for this request (JWT claims checked server-side), or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const appMeta = (claims.app_metadata ?? {}) as Record<string, unknown>;
  const isAnonymous = Boolean(claims.is_anonymous);
  const email = (claims.email as string | undefined) || null;
  const name =
    (meta.full_name as string | undefined) ||
    (meta.name as string | undefined) ||
    (email ? email.split("@")[0] : null) ||
    (isAnonymous ? "Guest" : "You");
  return {
    id: claims.sub,
    isAnonymous,
    email,
    name,
    avatarUrl: (meta.avatar_url as string | undefined) || null,
    provider: (appMeta.provider as string | undefined) || (isAnonymous ? "anonymous" : null),
  };
});

export async function requireUser(next = "/home"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
