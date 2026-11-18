import { Router } from 'express';
import { analyzeSkillGap, normalizeKey } from '@pip/shared';
import { Profile, User, Repository, Opportunity, TeamMember, Connection, CollaborationRequest } from '../models';
import { page, qstr, qlist, escapeRegex, objectId, forbidden } from '../lib/http';
import { requireAuth, me } from '../lib/auth';
import { getCatalog } from '../lib/catalog';
import {
  candidateFromProfile, requirementFromProfile, requirementFromOpportunity, scoreWith, personCard, blockedIdsFor,
  pairKey, type ProfileLike,
} from '../lib/people';
import type { MatchRequirement } from '@pip/shared';

export const discoverRouter = Router();
export const catalogRouter = Router();

catalogRouter.get('/', async (_req, res) => {
  const c = await getCatalog();
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.json({ skills: c.skills, categories: c.categories, roles: c.roles, interests: c.interests });
});

/**
 * FR7 + FR9: search students across colleges. Every filter must hold for every result (QR14).
 * Results carry a match score against the chosen context (my profile, or one of my teams).
 */
discoverRouter.get('/', requireAuth, async (req, res) => {
  const user = me(req);
  const viewerId = String(user._id);
  const c = await getCatalog();
  const { limit, page: p, skip } = page(req, 12, 48);

  const filter: Record<string, unknown> = { userId: { $ne: user._id } };
  const and: Record<string, unknown>[] = [];
  const q = qstr(req.query.q);
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    const skill = c.aliasIndex.get(normalizeKey(q));
    and.push({ $or: [{ name: rx }, { headline: rx }, ...(skill ? [{ skillSlugs: skill }] : [])] });
  }
  const skills = qlist(req.query.skills);
  if (skills.length) and.push({ skillSlugs: { $all: skills } });
  const interests = qlist(req.query.interests);
  if (interests.length) and.push({ interests: { $in: interests } });
  const roles = qlist(req.query.roles);
  if (roles.length) and.push({ preferredRoles: { $in: roles } });
  const college = qstr(req.query.college);
  if (college) and.push({ college: new RegExp(escapeRegex(college), 'i') });
  const years = qlist(req.query.years).map(Number).filter((n) => n >= 1 && n <= 6);
  if (years.length) and.push({ year: { $in: years } });
  const minHours = Number(req.query.minHours ?? 0);
  if (minHours > 0) and.push({ availabilityHours: { $gte: Math.min(minHours, 60) } });
  if (and.length) filter.$and = and;

  const blocked = await blockedIdsFor(viewerId);
  const viewerProfile = (await Profile.findOne({ userId: user._id }).lean()) as (ProfileLike & { lookingForSkills?: string[] }) | null;

  // Match context
  const context = qstr(req.query.context, 40) || 'profile';
  let requirement: MatchRequirement = viewerProfile ? requirementFromProfile(viewerProfile) : { skills: [], interests: [], roles: [], hoursPerWeek: 0 };
  let contextInfo: Record<string, unknown> = { type: 'profile', label: 'Your profile' };
  if (context !== 'profile') {
    const opp = await Opportunity.findById(objectId(context, 'Team'));
    if (!opp || String(opp.leaderId) !== viewerId) throw forbidden('You can only match against teams you lead');
    const members = await TeamMember.find({ opportunityId: opp._id }).lean();
    const mp = await Profile.find({ userId: { $in: members.map((m) => m.userId) } }, { userId: 1, name: 1, skillSlugs: 1 }).lean();
    const gap = analyzeSkillGap(opp.requiredSkills, mp.map((m) => ({ userId: String(m.userId), name: m.name, skills: m.skillSlugs })));
    requirement = requirementFromOpportunity(opp, undefined, gap.missing.length ? gap.missing : opp.requiredSkills);
    for (const m of members) blocked.push(String(m.userId));
    contextInfo = { type: 'team', id: String(opp._id), label: opp.title, missingSkills: gap.missing };
  }
  if (blocked.length) (filter.userId as Record<string, unknown>).$nin = blocked.map((b) => objectId(b));

  const found = await Profile.find(filter).sort({ completeness: -1 }).limit(5000).lean();
  const active = await User.find({ _id: { $in: found.map((r) => r.userId) }, status: 'active' }, { _id: 1, institutionVerified: 1 }).lean();
  const activeMap = new Map(active.map((u) => [String(u._id), u]));
  const rows = found.filter((r) => activeMap.has(String(r.userId)));

  const scored = rows.map((r) => ({ r, match: scoreWith(c, requirement, candidateFromProfile(r as ProfileLike)) }));
  const sort = qstr(req.query.sort) || 'match';
  if (sort === 'name') scored.sort((a, b) => a.r.name.localeCompare(b.r.name));
  else if (sort === 'availability') scored.sort((a, b) => (b.r.availabilityHours ?? 0) - (a.r.availabilityHours ?? 0));
  else scored.sort((a, b) => b.match.score - a.match.score || (b.r.completeness ?? 0) - (a.r.completeness ?? 0));

  const slice = scored.slice(skip, skip + limit);
  const ids = slice.map((s) => s.r.userId);
  const repos = await Repository.aggregate<{ _id: unknown; count: number; top: { name: string; stars: number; language: string | null; featured: boolean }[] }>([
    { $match: { userId: { $in: ids }, isFork: false } },
    { $sort: { featured: -1, stars: -1, pushedAt: -1 } },
    { $group: { _id: '$userId', count: { $sum: 1 }, top: { $push: { name: '$name', stars: '$stars', language: '$primaryLanguage', featured: '$featured' } } } },
    { $project: { count: 1, top: { $slice: ['$top', 2] } } },
  ]);
  const rm = new Map(repos.map((r) => [String(r._id), r]));
  const connections = await Connection.find({ $or: [{ userA: user._id }, { userB: user._id }] }).lean();
  const connected = new Set(connections.map((x) => (String(x.userA) === viewerId ? String(x.userB) : String(x.userA))));
  const pending = await CollaborationRequest.find({ status: 'pending', $or: [{ fromId: user._id }, { toId: user._id }] }).lean();
  const pendingMap = new Map(pending.map((x) => [String(x.fromId) === viewerId ? String(x.toId) : String(x.fromId), String(x.fromId) === viewerId ? 'pending_out' : 'pending_in']));

  res.json({
    context: contextInfo,
    requirement,
    items: slice.map(({ r, match }) => {
      const id = String(r.userId);
      return personCard(r as ProfileLike, {
        institutionVerified: !!activeMap.get(id)?.institutionVerified,
        match,
        repoCount: rm.get(id)?.count ?? 0,
        topRepos: rm.get(id)?.top ?? [],
        connection: connected.has(id) ? 'connected' : pendingMap.get(id) ?? 'none',
      });
    }),
    total: scored.length,
    page: p,
    pages: Math.max(1, Math.ceil(scored.length / limit)),
  });
  void pairKey;
});
