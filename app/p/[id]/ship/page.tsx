import { createClient } from "@/lib/supabase/server";
import { listDeployments } from "@/lib/db/queries";
import { ShipView } from "@/components/workspace/ship/ship-view";

export default async function ShipPage(props: PageProps<"/p/[id]/ship">) {
  const { id } = await props.params;
  const supa = await createClient();
  const deployments = await listDeployments(supa, id);
  return <ShipView deployments={deployments} />;
}
