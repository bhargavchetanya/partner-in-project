import { SKILLS, SKILL_CATEGORIES, ROLES, INTERESTS, DEFAULT_INSTITUTION_DOMAINS } from '@pip/shared';
import { Skill, SkillCategory, Role, Interest, InstitutionDomain } from '../models';
import { invalidateCatalog } from '../lib/catalog';

/** Inserts the default catalogue entries that are missing. Never overwrites admin edits. */
export async function seedCatalog(): Promise<void> {
  const ops = [
    SkillCategory.bulkWrite(
      SKILL_CATEGORIES.map((c) => ({ updateOne: { filter: { slug: c.slug }, update: { $setOnInsert: c }, upsert: true } })),
    ),
    Skill.bulkWrite(
      SKILLS.map((s) => ({
        updateOne: {
          filter: { slug: s.slug },
          update: { $setOnInsert: { slug: s.slug, name: s.name, category: s.category, aliases: s.aliases ?? [], active: true, custom: false } },
          upsert: true,
        },
      })),
    ),
    Role.bulkWrite(ROLES.map((r) => ({ updateOne: { filter: { slug: r.slug }, update: { $setOnInsert: { ...r, active: true } }, upsert: true } }))),
    Interest.bulkWrite(INTERESTS.map((r) => ({ updateOne: { filter: { slug: r.slug }, update: { $setOnInsert: { ...r, active: true } }, upsert: true } }))),
  ];
  await Promise.all(ops);
  if ((await InstitutionDomain.countDocuments()) === 0) {
    await InstitutionDomain.insertMany(DEFAULT_INSTITUTION_DOMAINS.map((domain) => ({ domain })), { ordered: false }).catch(() => undefined);
  }
  invalidateCatalog();
}
