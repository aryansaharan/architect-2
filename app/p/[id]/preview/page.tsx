import { createClient } from "@/lib/supabase/server";
import { listComments } from "@/lib/db/queries";
import { PreviewView } from "@/components/workspace/preview/preview-view";

export default async function PreviewPage(props: PageProps<"/p/[id]/preview">) {
  const { id } = await props.params;
  const supa = await createClient();
  const comments = await listComments(supa, id);
  return <PreviewView comments={comments} />;
}
