import { buildAliasIndex, normalizeKey, slugify, DEFAULT_INSTITUTION_DOMAINS } from '@pip/shared';
import { Skill, Role, Interest, SkillCategory, InstitutionDomain } from '../models';

export interface CatalogSnapshot {
  skills: { slug: string; name: string; category: string; aliases: string[]; custom: boolean }[];
  categories: { slug: string; name: string; order: number }[];
  roles: { slug: string; name: string }[];
  interests: { slug: string; name: string }[];
  domains: string[];
  aliasIndex: Map<string, string>;
  names: Map<string, string>;
  loadedAt: number;
}

let cache: CatalogSnapshot | null = null;
let loading: Promise<CatalogSnapshot> | null = null;
const TTL = 60_000;

export function invalidateCatalog() {
  cache = null;
}

export async function getCatalog(): Promise<CatalogSnapshot> {
  if (cache && Date.now() - cache.loadedAt < TTL) return cache;
  if (loading) return loading;
  loading = (async () => {
    const [skills, categories, roles, interests, domains] = await Promise.all([
      Skill.find({ active: true }).sort({ name: 1 }).lean(),
      SkillCategory.find().sort({ order: 1 }).lean(),
      Role.find({ active: true }).sort({ name: 1 }).lean(),
      Interest.find({ active: true }).sort({ name: 1 }).lean(),
      InstitutionDomain.find().lean(),
    ]);
    const names = new Map<string, string>();
    for (const s of skills) names.set(s.slug, s.name);
    for (const r of roles) if (!names.has(r.slug)) names.set(r.slug, r.name);
    for (const i of interests) if (!names.has(i.slug)) names.set(i.slug, i.name);
    const snap: CatalogSnapshot = {
      skills: skills.map((s) => ({ slug: s.slug, name: s.name, category: s.category, aliases: s.aliases ?? [], custom: !!s.custom })),
      categories: categories.map((c) => ({ slug: c.slug, name: c.name, order: c.order })),
      roles: roles.map((r) => ({ slug: r.slug, name: r.name })),
      interests: interests.map((i) => ({ slug: i.slug, name: i.name })),
      domains: domains.length ? domains.map((d) => d.domain) : DEFAULT_INSTITUTION_DOMAINS,
      aliasIndex: buildAliasIndex(skills.map((s) => ({ slug: s.slug, name: s.name, aliases: s.aliases ?? [] }))),
      names,
      loadedAt: Date.now(),
    };
    cache = snap;
    return snap;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

/** Display name for a skill / role / interest slug. Separate maps avoid slug collisions. */
export function nameLookup(c: CatalogSnapshot) {
  const skillNames = new Map(c.skills.map((s) => [s.slug, s.name]));
  const roleNames = new Map(c.roles.map((s) => [s.slug, s.name]));
  const interestNames = new Map(c.interests.map((s) => [s.slug, s.name]));
  return {
    skill: (s: string) => skillNames.get(s) ?? s,
    role: (s: string) => roleNames.get(s) ?? s,
    interest: (s: string) => interestNames.get(s) ?? s,
    any: (s: string) => skillNames.get(s) ?? roleNames.get(s) ?? interestNames.get(s) ?? s,
  };
}

/**
 * Resolves a typed skill name to a catalogue slug. Unknown names create a custom
 * catalogue entry (category "other") so users are never blocked from adding a skill.
 */
export async function resolveOrCreateSkill(name: string, category = 'other'): Promise<string> {
  const c = await getCatalog();
  const found = c.aliasIndex.get(normalizeKey(name));
  if (found) return found;
  const existing = await Skill.findOne({ $or: [{ slug: slugify(name) }, { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }] });
  if (existing) {
    if (!existing.active) {
      existing.active = true;
      await existing.save();
      invalidateCatalog();
    }
    return existing.slug;
  }
  let slug = slugify(name) || `skill-${Date.now()}`;
  if (await Skill.exists({ slug })) slug = `${slug}-${Date.now().toString(36)}`;
  await Skill.create({ slug, name: name.trim().slice(0, 60), category, custom: true });
  invalidateCatalog();
  return slug;
}

export function validSlugs(input: string[], allowed: { slug: string }[]): string[] {
  const set = new Set(allowed.map((a) => a.slug));
  return Array.from(new Set(input.filter((s) => set.has(s))));
}
