import "server-only";
import type { SessionUser } from "@/lib/auth";
import type { Supa } from "@/lib/supabase/server";

/** How many projects one account may keep (the database enforces the same numbers: policy "project cap"). */
export const PROJECT_CAP = { guest: 5, member: 25 } as const;

/** A plain message when the person can't make another project, otherwise null. */
export async function projectCapMessage(supa: Supa, user: SessionUser): Promise<string | null> {
  const { data, error } = await supa.rpc("my_project_count");
  if (error || typeof data !== "number") return null;
  if (user.isAnonymous) return data >= PROJECT_CAP.guest ? `Guests can keep up to ${PROJECT_CAP.guest} projects. Sign in to keep more, or delete one.` : null;
  return data >= PROJECT_CAP.member ? `You have ${PROJECT_CAP.member} projects, the most one account can keep. Delete one to make another.` : null;
}
