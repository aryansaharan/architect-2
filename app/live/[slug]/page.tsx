import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadSite, roleFor } from "@/lib/apps/access";
import { liveView } from "@/lib/apps/live";
import { LiveApp, type LiveViewer } from "@/components/renderer/live-app";

/** One read per request, shared by the metadata and the page. A blocked or missing site reads as not found. */
const site = cache(loadSite);

export async function generateMetadata(props: PageProps<"/live/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const s = await site(slug);
  const robots = { index: false, follow: false };
  if (!s) return { title: "Not found", robots };
  // A private app shows strangers its name and nothing more.
  const open = s.blueprint.screens.some((x) => x.audience === "customer");
  return { title: { absolute: s.blueprint.meta.name }, description: open ? s.blueprint.meta.tagline : undefined, robots };
}

/**
 * A published app. Who is looking is decided here, on the server: the owner and invited people get
 * every screen and record, a visitor only the public pages and the fields they show, and someone who
 * may see nothing gets the sign-in wall (with only the app's name and colour).
 */
export default async function LivePage(props: PageProps<"/live/[slug]">) {
  const { slug } = await props.params;
  const s = await site(slug);
  if (!s) notFound();
  const user = await getSessionUser();
  const view = await liveView(s, await roleFor(s, user));
  const viewer: LiveViewer = { signedIn: Boolean(user), guest: Boolean(user?.isAnonymous), email: user && !user.isAnonymous ? user.email : null, name: user?.name ?? "Visitor" };
  const app = { name: view.bp.meta.name, primary: view.bp.meta.theme.primary };
  return (
    <LiveApp
      app={app}
      view={view.privateOnly ? null : { role: view.role, bp: view.bp, records: view.records, canCreate: view.canCreate, canEdit: view.canEdit, hasSample: view.hasSample, publicHelpers: Boolean(s.settings.app?.publicHelpers) }}
      viewer={viewer}
      publishedAt={s.publishedAt}
      slug={slug}
    />
  );
}
