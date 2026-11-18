/**
 * Partner in Project — rule-based match engine (SRS FR9).
 *
 *   Match score = 50% x skill match + 20% x interest match
 *               + 15% x role match  + 15% x availability match
 *
 * Every component is a value in [0, 1]. If the requirement side of a component is
 * empty (e.g. the post lists no domains), that component is excluded and the
 * remaining weights are rescaled so they still sum to 1. The final score is
 * therefore always within 0..100.
 */

export const MATCH_WEIGHTS = {
  skill: 0.5,
  interest: 0.2,
  role: 0.15,
  availability: 0.15,
} as const;

export type ComponentKey = keyof typeof MATCH_WEIGHTS;

export interface MatchRequirement {
  /** Canonical skill slugs that are required. */
  skills: string[];
  /** Interest / domain slugs of the project. */
  interests: string[];
  /** Open role slugs. If `appliedRole` is given only that role is considered. */
  roles: string[];
  /** Expected commitment in hours per week. 0 or undefined = not specified. */
  hoursPerWeek?: number;
}

export interface MatchCandidate {
  /** Canonical slugs of the candidate's CONFIRMED skills. */
  skills: string[];
  interests: string[];
  roles: string[];
  hoursPerWeek?: number;
}

export interface ComponentResult {
  key: ComponentKey;
  label: string;
  weight: number; // original weight (0.5, 0.2, ...)
  effectiveWeight: number; // weight after re-normalisation (0 if excluded)
  value: number | null; // 0..1, null when excluded
  included: boolean;
  detail: string;
}

export interface MatchResult {
  score: number; // 0..100, integer
  components: ComponentResult[];
  matchedSkills: string[];
  missingSkills: string[];
  requiredSkills: string[];
  matchedInterests: string[];
  matchedRoles: string[];
  /** One-line human explanation, e.g. "Matches 3 of 4 required skills: React, Node.js, MongoDB". */
  summary: string;
  /** Longer explanation, one sentence per component. */
  reasons: string[];
}

export type NameLookup = (slug: string) => string;

const identity: NameLookup = (s) => s;

function uniq(list: string[]): string[] {
  return Array.from(new Set(list.filter(Boolean)));
}

function listNames(slugs: string[], name: NameLookup, max = 6): string {
  const names = slugs.map(name);
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} +${names.length - max} more`;
}

export function computeMatch(
  requirement: MatchRequirement,
  candidate: MatchCandidate,
  nameOf: NameLookup = identity,
): MatchResult {
  const reqSkills = uniq(requirement.skills);
  const reqInterests = uniq(requirement.interests);
  const reqRoles = uniq(requirement.roles);
  const candSkills = new Set(candidate.skills);
  const candInterests = new Set(candidate.interests);
  const candRoles = new Set(candidate.roles);

  const matchedSkills = reqSkills.filter((s) => candSkills.has(s));
  const missingSkills = reqSkills.filter((s) => !candSkills.has(s));
  const matchedInterests = reqInterests.filter((s) => candInterests.has(s));
  const matchedRoles = reqRoles.filter((s) => candRoles.has(s));

  const components: ComponentResult[] = [];

  // Skill match = required skills the candidate has / required skills
  if (reqSkills.length > 0) {
    const v = matchedSkills.length / reqSkills.length;
    components.push({
      key: 'skill',
      label: 'Skills',
      weight: MATCH_WEIGHTS.skill,
      effectiveWeight: 0,
      value: v,
      included: true,
      detail:
        matchedSkills.length > 0
          ? `Matches ${matchedSkills.length} of ${reqSkills.length} required skills: ${listNames(matchedSkills, nameOf)}`
          : `Has none of the ${reqSkills.length} required skills`,
    });
  } else {
    components.push(excluded('skill', 'Skills', 'No required skills specified'));
  }

  // Interest match = shared domains / project domains
  if (reqInterests.length > 0) {
    const v = matchedInterests.length / reqInterests.length;
    components.push({
      key: 'interest',
      label: 'Interests',
      weight: MATCH_WEIGHTS.interest,
      effectiveWeight: 0,
      value: v,
      included: true,
      detail:
        matchedInterests.length > 0
          ? `Shares ${matchedInterests.length} of ${reqInterests.length} interests: ${listNames(matchedInterests, nameOf)}`
          : 'No shared interests',
    });
  } else {
    components.push(excluded('interest', 'Interests', 'No interests or domain specified'));
  }

  // Role match = 1 if any open role is among the candidate's preferred roles
  if (reqRoles.length > 0) {
    const v = matchedRoles.length > 0 ? 1 : 0;
    components.push({
      key: 'role',
      label: 'Role',
      weight: MATCH_WEIGHTS.role,
      effectiveWeight: 0,
      value: v,
      included: true,
      detail: v
        ? `Prefers the ${listNames(matchedRoles, nameOf, 2)} role`
        : `Preferred roles don't include ${listNames(reqRoles, nameOf, 3)}`,
    });
  } else {
    components.push(excluded('role', 'Role', 'No open roles specified'));
  }

  // Availability = min(candidate hours / required hours, 1)
  const reqHours = requirement.hoursPerWeek ?? 0;
  if (reqHours > 0) {
    const have = Math.max(0, candidate.hoursPerWeek ?? 0);
    const v = Math.min(have / reqHours, 1);
    components.push({
      key: 'availability',
      label: 'Availability',
      weight: MATCH_WEIGHTS.availability,
      effectiveWeight: 0,
      value: v,
      included: true,
      detail: `${have} of ${reqHours} hours/week available`,
    });
  } else {
    components.push(excluded('availability', 'Availability', 'No time commitment specified'));
  }

  const totalWeight = components.filter((c) => c.included).reduce((s, c) => s + c.weight, 0);
  let raw = 0;
  for (const c of components) {
    if (c.included && totalWeight > 0) {
      c.effectiveWeight = c.weight / totalWeight;
      raw += c.effectiveWeight * (c.value ?? 0);
    }
  }
  const score = totalWeight > 0 ? Math.round(clamp01(raw) * 100) : 0;

  const skillComp = components[0];
  const summary = skillComp.included
    ? skillComp.detail +
      (missingSkills.length > 0 ? ` · missing ${listNames(missingSkills, nameOf, 4)}` : '')
    : components.find((c) => c.included)?.detail ?? 'Not enough information to compare';

  return {
    score,
    components,
    matchedSkills,
    missingSkills,
    requiredSkills: reqSkills,
    matchedInterests,
    matchedRoles,
    summary,
    reasons: components.map((c) => c.detail),
  };
}

function excluded(key: ComponentKey, label: string, detail: string): ComponentResult {
  return {
    key,
    label,
    weight: MATCH_WEIGHTS[key],
    effectiveWeight: 0,
    value: null,
    included: false,
    detail: `${detail} — not counted`,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Plain skill coverage, e.g. 4/5 -> 80. */
export function skillCoverage(required: string[], have: string[]): number {
  const req = uniq(required);
  if (req.length === 0) return 100;
  const set = new Set(have);
  return Math.round((req.filter((s) => set.has(s)).length / req.length) * 100);
}
