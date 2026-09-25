import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/server";
import type { LiveSiteRow } from "@/lib/db/types";
import { LiveApp } from "@/components/renderer/live-app";

async function load(slug: string): Promise<LiveSiteRow | null> {
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;
  const { data } = await createPublicClient().from("live_sites").select("*").eq("slug", slug).maybeSingle();
  return (data as LiveSiteRow | null) ?? null;
}

export async function generateMetadata(props: PageProps<"/live/[slug]">) {
  const { slug } = await props.params;
  const site = await load(slug);
  return site ? { title: { absolute: site.blueprint.meta.name }, description: site.blueprint.meta.tagline } : { title: "Not found" };
}

export default async function LivePage(props: PageProps<"/live/[slug]">) {
  const { slug } = await props.params;
  const site = await load(slug);
  if (!site) notFound();
  return <LiveApp bp={site.blueprint} publishedAt={site.published_at} />;
}
