/** Normalise free text into a comparable key: "React.js" -> "reactjs"-style token. */
export function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\+\+/g, 'pp')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '');
}

/** URL-friendly slug for new catalogue entries. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\+\+/g, 'pp')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export interface AliasSource {
  slug: string;
  name: string;
  aliases?: string[];
}

/**
 * Builds a lookup from every spelling of a skill (slug, name, aliases) to its slug,
 * so "ReactJS", "react.js" and "React" all resolve to "react".
 */
export function buildAliasIndex(items: AliasSource[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const item of items) {
    for (const spelling of [item.slug, item.name, ...(item.aliases ?? [])]) {
      const key = normalizeKey(spelling);
      if (key && !index.has(key)) index.set(key, item.slug);
    }
  }
  return index;
}

export function resolveSlug(index: Map<string, string>, spelling: string): string | undefined {
  return index.get(normalizeKey(spelling));
}
