import { HandoffsView } from "@/components/workspace/handoffs/handoffs-view";

export default async function HandoffsPage(props: PageProps<"/p/[id]/handoffs">) {
  const sp = await props.searchParams;
  return <HandoffsView initial={typeof sp.h === "string" ? sp.h : undefined} />;
}
