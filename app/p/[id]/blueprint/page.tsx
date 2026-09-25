import { BlueprintCanvas } from "@/components/workspace/blueprint/canvas";

export default async function BlueprintPage(props: PageProps<"/p/[id]/blueprint">) {
  const sp = await props.searchParams;
  return <BlueprintCanvas tour={sp.tour === "1"} />;
}
