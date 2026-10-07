import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadSiteOnce, roleFor } from "@/lib/apps/access";
import { liveView } from "@/lib/apps/live";
import { publicAccess } from "@/lib/apps/view";
import { emailConfigured } from "@/lib/email";
import { ManifestSchema } from "@/lib/code-apps/schema";
import { LiveApp, type LiveViewer } from "@/components/renderer/live-app";
import { LiveCodeApp } from "@/components/code-apps/live-code-app";

/** One read per request, shared by the metadata, the social image and the page. A blocked or missing site reads as not found. */
const site = loadSiteOnce;

/** A published code app's title and tagline, from its published build (null when the build is missing or unreadable). */
const manifestOf = (s: { build: { manifest?: unknown } | null }) => {
  const m = ManifestSchema.safeParse(s.build?.manifest);
  return m.success ? m.data : null;
};

export async function generateMetadata(props: PageProps<"/live/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const s = await site(slug);
  const robots = { index: false, follow: false };
  if (!s) return { title: "Not found", robots };
  // A code app is public: its own title and tagline (its collections' rules protect its data).
  if (s.kind === "code") {
    const m = manifestOf(s);
    return m ? { title: { absolute: m.title }, description: m.tagline || undefined, robots } : { title: "Not found", robots };
  }
  // A private app (no public pages left once hidden data types are taken out) shows strangers its name and nothing more.
  const open = publicAccess(s.blueprint, s.settings.app?.hiddenEntities).screens.length > 0;
  return { title: { absolute: s.blueprint.meta.name }, description: open ? s.blueprint.meta.tagline : undefined, robots };
}

/**
 * A published app. Who is looking is decided here, on the server: the owner and invited people get
 * every screen and record, a visitor only the public pages and the fields they show, and someone who
 * may see nothing gets the sign-in wall (with only the app's name and colour).
 * A code app is its published build, full height in the sandbox, with the small Prod AI footer.
 */
export default async function LivePage(props: PageProps<"/live/[slug]">) {
  const { slug } = await props.params;
  const s = await site(slug);
  if (!s) notFound();
  const user = await getSessionUser();
  if (s.kind === "code") {
    const m = manifestOf(s);
    if (!m || !s.build?.hash) notFound();
    // Who is looking only shapes prod.user() in the app; the data and AI routes decide access again. A visitor's own name stays with Prod AI.
    const role = await roleFor(s, user);
    return <LiveCodeApp slug={slug} hash={s.build.hash} title={m.title} publishedAt={s.publishedAt} user={{ role, name: role === "visitor" ? "Visitor" : (user?.name ?? "Visitor") }} />;
  }
  const view = await liveView(s, await roleFor(s, user));
  const viewer: LiveViewer = { signedIn: Boolean(user), guest: Boolean(user?.isAnonymous), email: user && !user.isAnonymous ? user.email : null, name: user?.name ?? "Visitor" };
  const app = { name: view.bp.meta.name, primary: view.bp.meta.theme.primary };
  return (
    <LiveApp
      app={app}
      view={view.privateOnly ? null : { role: view.role, bp: view.bp, records: view.records, canCreate: view.canCreate, canEdit: view.canEdit, hasSample: view.hasSample, publicHelpers: Boolean(s.settings.app?.publicHelpers), emailReady: emailConfigured() }}
      viewer={viewer}
      publishedAt={s.publishedAt}
      slug={slug}
    />
  );
}
