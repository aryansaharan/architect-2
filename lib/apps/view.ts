import type { Block, Blueprint, Entity } from "@/lib/blueprint/schema";

/**
 * What a published app shows to whom. Team screens are for the owner and the people they invite;
 * customer screens are the app's public pages. A public page can read only the fields its own blocks
 * display and create records only through its own forms, so a visitor never sees a team list
 * by way of a public page. Owners can hide a data type from public pages entirely (settings.hiddenEntities).
 */
export type PublicAccess = {
  screens: string[];
  read: Record<string, string[]>;
  create: Record<string, string[]>;
};

const blocksOf = (bp: Blueprint, screenIds: Set<string>): Block[] =>
  bp.screens.filter((s) => screenIds.has(s.id)).flatMap((s) => [...s.regions.main, ...(s.regions.side ?? [])]);

/** The fields a block displays, by data type. */
function shown(b: Block): { entityId: string; fields: string[] } | null {
  if (b.type === "table") return { entityId: b.entityId, fields: b.columns };
  if (b.type === "list") return { entityId: b.entityId, fields: [b.titleField, b.subtitleField, b.badgeField].filter((f): f is string => Boolean(f)) };
  if (b.type === "detail") return { entityId: b.entityId, fields: b.fields };
  return null;
}

export function publicAccess(bp: Blueprint, hiddenEntities: string[] = []): PublicAccess {
  const hidden = new Set(hiddenEntities);
  const screens = bp.screens.filter((s) => s.audience === "customer").map((s) => s.id);
  const read: Record<string, Set<string>> = {};
  const create: Record<string, Set<string>> = {};
  for (const b of blocksOf(bp, new Set(screens))) {
    const s = shown(b);
    if (s && !hidden.has(s.entityId)) for (const f of s.fields) (read[s.entityId] ??= new Set()).add(f);
    if (b.type === "form" && b.entityId && !hidden.has(b.entityId)) for (const f of b.fields) (create[b.entityId] ??= new Set()).add(f.name);
  }
  const plain = (m: Record<string, Set<string>>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v]]));
  return { screens, read: plain(read), create: plain(create) };
}

/** The data types a published app keeps records for: every entity the plan defines. */
export const appEntities = (bp: Blueprint): Entity[] => bp.entities;

/** Only these keys of a record, for a visitor on a public page. */
export function pick(data: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]]));
}
