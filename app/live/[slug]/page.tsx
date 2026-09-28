import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import type { Blueprint } from "@/lib/blueprint/schema";
import { LiveApp } from "@/components/renderer/live-app";
import { QUOTED_RULES } from "@/lib/sim/demo-chat";


/**
 * What a visitor's browser gets: the screens, sample data and what the scripted chat reads
 * (lib/sim/demo-chat.ts, components/renderer). Each agent's job description, rules, memory, model,
 * tests and other builder-only fields stay on the server.
 */
function forVisitors(bp: Blueprint): Blueprint {
  return {
    ...bp,
    meta: { ...bp.meta, plain: "", theme: { ...bp.meta.theme, primary: /^#[0-9a-fA-F]{6}$/.test(bp.meta.theme.primary) ? bp.meta.theme.primary : "#0F766E" } },
    screens: bp.screens.map((s) => ({ ...s, plain: "" })),
    entities: bp.entities.map((e) => ({ ...e, plain: "" })),
    connections: bp.connections.map((c) => ({ id: c.id, name: c.name, kind: c.kind, auth: c.auth, status: c.status, plain: "" })),
    agents: bp.agents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      avatarHue: a.avatarHue,
      plain: "",
      jobDescription: "",
      rules: a.rules.filter((r) => Object.values(QUOTED_RULES).some((re) => re.test(r))),
      tools: a.tools.map((t) => ({ id: t.id, name: t.name, description: t.description, connectionId: t.connectionId, access: t.access, permission: t.permission })),
      supervision: a.supervision,
      knowledge: a.knowledge.filter((k) => k.source === "entity").map((k) => ({ label: "", source: k.source, ref: k.ref })),
      memory: { scope: "none", retentionDays: 0 },
      cost: { creditsPerRun: 0, model: "" },
      triggers: [],
      rehearsals: [],
      framework: "lyzr",
      origin: "generated",
    })),
    estimate: { minutes: 0, credits: 0, files: 0, agentsTouched: 0, confidence: "low", breakdown: [] },
  };
}

/** Published sites are read by the server (visitors have no access to the table). A blocked site reads as not found. */
const load = cache(async (slug: string): Promise<{ bp: Blueprint; publishedAt: string } | null> => {
  if (!/^[a-z0-9-]{3,80}$/.test(slug) || !hasAdmin()) return null;
  const { data, error } = await adminClient().from("live_sites").select("blueprint, published_at, blocked_at").eq("slug", slug).maybeSingle();
  if (error) console.error("[live] read failed", error.message);
  if (!data || data.blocked_at) return null;
  return { bp: data.blueprint as Blueprint, publishedAt: data.published_at as string };
});

export async function generateMetadata(props: PageProps<"/live/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const site = await load(slug);
  const robots = { index: false, follow: false };
  return site ? { title: { absolute: site.bp.meta.name }, description: site.bp.meta.tagline, robots } : { title: "Not found", robots };
}

export default async function LivePage(props: PageProps<"/live/[slug]">) {
  const { slug } = await props.params;
  const site = await load(slug);
  if (!site) notFound();
  return <LiveApp bp={forVisitors(site.bp)} publishedAt={site.publishedAt} slug={slug} />;
}
