import { redirect } from "next/navigation";

export default async function ProjectIndex(props: PageProps<"/p/[id]">) {
  const { id } = await props.params;
  redirect(`/p/${id}/blueprint`);
}
