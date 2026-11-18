import type { Types } from 'mongoose';
import { computeMatch, type MatchRequirement, type MatchCandidate, type MatchResult } from '@pip/shared';
import { Profile, UserSkill, User, Connection, Block, GithubAccount } from '../models';
import { getCatalog, nameLookup, type CatalogSnapshot } from './catalog';

type Id = Types.ObjectId | string;

export interface ProfileLike {
  userId: Types.ObjectId;
  name: string;
  headline?: string | null;
  college?: string | null;
  branch?: string | null;
  year?: number | null;
  bio?: string | null;
  interests?: string[];
  preferredRoles?: string[];
  availabilityHours?: number | null;
  skillSlugs?: string[];
  avatarVersion?: number | null;
  externalAvatarUrl?: string | null;
  completeness?: number | null;
}

export function avatarUrl(p: Pick<ProfileLike, 'userId' | 'avatarVersion' | 'externalAvatarUrl'>): string | null {
  if (p.avatarVersion && p.avatarVersion > 0) return `/api/profiles/${String(p.userId)}/avatar?v=${p.avatarVersion}`;
  return p.externalAvatarUrl || null;
}

export function candidateFromProfile(p: ProfileLike): MatchCandidate {
  return {
    skills: p.skillSlugs ?? [],
    interests: p.interests ?? [],
    roles: p.preferredRoles ?? [],
    hoursPerWeek: p.availabilityHours ?? 0,
  };
}

export interface OppLike {
  requiredSkills: string[];
  domains: string[];
  openRoles: { role: string; slots: number; filled: number }[];
  commitmentHours?: number | null;
}

export function requirementFromOpportunity(o: OppLike, onlyRole?: string, skillsOverride?: string[]): MatchRequirement {
  const openRoles = o.openRoles.filter((r) => r.filled < r.slots).map((r) => r.role);
  return {
    skills: skillsOverride ?? o.requiredSkills,
    interests: o.domains,
    roles: onlyRole ? [onlyRole] : openRoles.length ? openRoles : o.openRoles.map((r) => r.role),
    hoursPerWeek: o.commitmentHours ?? 0,
  };
}

/** Requirement built from a viewer's own profile, for Discover's "My profile" context. */
export function requirementFromProfile(p: ProfileLike & { lookingForSkills?: string[] }): MatchRequirement {
  return {
    skills: p.lookingForSkills ?? [],
    interests: p.interests ?? [],
    roles: [],
    hoursPerWeek: Math.min(p.availabilityHours ?? 0, 20),
  };
}

export function scoreWith(c: CatalogSnapshot, req: MatchRequirement, cand: MatchCandidate): MatchResult {
  const n = nameLookup(c);
  const r = computeMatch(req, cand, n.any);
  // Use role names in the role component text
  return r;
}

export async function matchFor(req: MatchRequirement, profile: ProfileLike): Promise<MatchResult> {
  const c = await getCatalog();
  return scoreWith(c, req, candidateFromProfile(profile));
}

/** Compact public card for lists (Discover, members, applicants). */
export function personCard(p: ProfileLike, extras: Record<string, unknown> = {}) {
  return {
    id: String(p.userId),
    name: p.name,
    headline: p.headline ?? '',
    college: p.college ?? '',
    branch: p.branch ?? '',
    year: p.year ?? 0,
    avatarUrl: avatarUrl(p),
    skills: p.skillSlugs ?? [],
    interests: p.interests ?? [],
    roles: p.preferredRoles ?? [],
    availabilityHours: p.availabilityHours ?? 0,
    ...extras,
  };
}

export type PersonCard = ReturnType<typeof personCard> & { institutionVerified: boolean; status: string };

export async function cardsFor(userIds: Id[]): Promise<Map<string, PersonCard>> {
  const profiles = await Profile.find({ userId: { $in: userIds } }).lean();
  const users = await User.find({ _id: { $in: userIds } }, { institutionVerified: 1, status: 1 }).lean();
  const uv = new Map(users.map((u) => [String(u._id), u]));
  return new Map(
    profiles.map((p) => [
      String(p.userId),
      personCard(p as ProfileLike, {
        institutionVerified: !!uv.get(String(p.userId))?.institutionVerified,
        status: uv.get(String(p.userId))?.status ?? 'active',
      }) as PersonCard,
    ]),
  );
}

/** Recomputes the denormalised confirmed-skill list and completeness on the profile. */
export async function refreshProfileDerived(userId: Id): Promise<void> {
  const [skills, profile, gh] = await Promise.all([
    UserSkill.find({ userId, status: 'confirmed' }, { skill: 1 }).lean(),
    Profile.findOne({ userId }),
    GithubAccount.exists({ userId }),
  ]);
  if (!profile) return;
  profile.skillSlugs = skills.map((s) => s.skill);
  const checks = [
    !!profile.name,
    !!profile.college,
    !!profile.branch,
    !!profile.year,
    (profile.bio ?? '').length >= 20,
    profile.interests.length > 0,
    profile.preferredRoles.length > 0,
    (profile.availabilityHours ?? 0) > 0,
    skills.length >= 3,
    !!gh,
    (profile.avatarVersion ?? 0) > 0 || !!profile.externalAvatarUrl,
    profile.projects.length > 0 || profile.achievements.length > 0,
  ];
  profile.completeness = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  await profile.save();
}

export function pairKey(a: Id, b: Id): [string, string] {
  const x = String(a);
  const y = String(b);
  return x < y ? [x, y] : [y, x];
}

export async function areConnected(a: Id, b: Id): Promise<boolean> {
  const [x, y] = pairKey(a, b);
  return !!(await Connection.exists({ userA: x, userB: y }));
}

/** True if either user has blocked the other. */
export async function isBlockedBetween(a: Id, b: Id): Promise<boolean> {
  return !!(await Block.exists({ $or: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] }));
}

export async function blockedIdsFor(userId: Id): Promise<string[]> {
  const rows = await Block.find({ $or: [{ blockerId: userId }, { blockedId: userId }] }).lean();
  return rows.map((r) => (String(r.blockerId) === String(userId) ? String(r.blockedId) : String(r.blockerId)));
}
