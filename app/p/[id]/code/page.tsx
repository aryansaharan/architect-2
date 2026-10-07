import { createClient } from "@/lib/supabase/server";
import { getCheckpointsFull, listCheckpoints, listWorkOrders } from "@/lib/db/queries";
import { CodeBrowser } from "@/components/workspace/code/code-browser";

export default async function CodePage(props: PageProps<"/p/[id]/code">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const supa = await createClient();
  const [cps, workOrders] = await Promise.all([listCheckpoints(supa, id), listWorkOrders(supa, id)]);
  const toId = typeof sp.to === "string" ? sp.to : cps[0]?.id;
  const fromId = typeof sp.from === "string" ? sp.from : (cps[1] ?? cps[0])?.id;
  const full = await getCheckpointsFull(supa, [fromId, toId].filter(Boolean) as string[]);
  const pick = (cid?: string) => {
    const c = full.find((x) => x.id === cid);
    if (!c) return null;
    // A code app's files are fetched by the Code tab itself, version by version: only the plan goes to the page.
    const meta: Partial<typeof c> = { ...c };
    delete meta.blueprint;
    delete meta.code;
    return { meta: meta as Omit<typeof c, "blueprint" | "code">, blueprint: c.blueprint };
  };
  return <CodeBrowser compare={{ from: pick(fromId), to: pick(toId) }} workOrders={workOrders} />;
}
