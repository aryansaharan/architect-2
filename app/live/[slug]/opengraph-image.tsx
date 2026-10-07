import { ImageResponse } from "next/og";
import { loadSiteOnce } from "@/lib/apps/access";
import { publicAccess } from "@/lib/apps/view";
import { ManifestSchema } from "@/lib/code-apps/schema";
import { accentFor } from "@/components/renderer/theme";

/**
 * A published app's own social preview: its name and tagline in its theme colour, on the slate the app
 * itself uses, with a small "Made with Prod AI". A private app (no public pages) shows strangers its name
 * and nothing more, here as on its sign-in wall. A code app (always public) shows its title and tagline.
 * Read fresh each time, so a rename shows up.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

type Card = { name: string; tagline: string | null; primary: string };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** A code app has no theme colour of its own, so its card takes Prod AI's teal. */
const CODE_PRIMARY = "#0F766E";

async function cardFor(slug: unknown): Promise<Card | null> {
  if (typeof slug !== "string") return null;
  const site = await loadSiteOnce(slug);
  if (!site) return null;
  if (site.kind === "code") {
    const m = ManifestSchema.safeParse(site.build?.manifest);
    if (!m.success) return null;
    const { title, tagline } = m.data;
    return { name: clip(title.trim() || "Untitled app", 60), tagline: tagline.trim() ? clip(tagline.trim(), 150) : null, primary: CODE_PRIMARY };
  }
  const { meta } = site.blueprint;
  const open = publicAccess(site.blueprint, site.settings.app?.hiddenEntities).screens.length > 0;
  return {
    name: clip(meta.name.trim() || "Untitled app", 60),
    tagline: open && meta.tagline?.trim() ? clip(meta.tagline.trim(), 150) : null,
    primary: /^#[0-9a-fA-F]{6}$/.test(meta.theme.primary) ? meta.theme.primary : "#0F766E",
  };
}

/** The image's alt text follows the app: its name and tagline, or only its name when it's private. */
export async function generateImageMetadata({ params }: { params: { slug: string } | Promise<{ slug: string }> }) {
  const card = await cardFor((await params)?.slug);
  if (!card) return [];
  return [{ id: "card", size, contentType, alt: card.tagline ? `${card.name}: ${card.tagline}` : card.name }];
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const card = await cardFor((await params).slug);
  if (!card) return new Response("Not found", { status: 404 });
  const accent = accentFor(card.primary, card.name);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f8fafc", color: "#0f172a", fontFamily: "sans-serif" }}>
        <div style={{ height: 14, width: "100%", display: "flex", background: card.primary }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 88px", gap: 28 }}>
          <div style={{ width: 96, height: 96, borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff", fontSize: 52, background: `linear-gradient(135deg, ${card.primary}, ${accent})` }}>
            {card.name.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ display: "flex", fontSize: card.name.length > 32 ? 64 : 80, lineHeight: 1.08, letterSpacing: -2, color: "#0f172a", maxWidth: 1000 }}>{card.name}</div>
          {card.tagline && <div style={{ display: "flex", fontSize: 36, lineHeight: 1.35, color: "#475569", maxWidth: 980 }}>{card.tagline}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "0 88px 48px", fontSize: 22, color: "#94a3b8" }}>Made with Prod AI</div>
      </div>
    ),
    size,
  );
}
