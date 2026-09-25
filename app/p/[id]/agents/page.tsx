import { createClient } from "@/lib/supabase/server";
import { listAgentRuns } from "@/lib/db/queries";
import { AgentsView } from "@/components/workspace/agents/agents-view";

export default async function AgentsPage(props: PageProps<"/p/[id]/agents">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const supa = await createClient();
  const runs = await listAgentRuns(supa, id);
  const tab = typeof sp.tab === "string" && ["overview", "playground", "rehearsals", "replay", "code"].includes(sp.tab) ? (sp.tab as "overview") : undefined;
  return <AgentsView runs={runs} initialAgent={typeof sp.agent === "string" ? sp.agent : undefined} initialTab={tab} />;
}
