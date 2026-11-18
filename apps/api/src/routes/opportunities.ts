import { Router, type Request } from 'express';
import { z } from 'zod';
import { opportunitySchema, applySchema } from '@pip/shared';
import {
  Opportunity, TeamMember, Application, Profile, User, TeamInvitation, type OpportunityDoc,
} from '../models';
import { parse, badRequest, forbidden, notFound, conflict, objectId, page, qstr, qlist, escapeRegex } from '../lib/http';
import { requireAuth, requireVerified, me } from '../lib/auth';
import { getCatalog, nameLookup, resolveOrCreateSkill, validSlugs } from '../lib/catalog';
import { notify, notifyMany } from '../lib/notify';
import {
  avatarUrl, candidateFromProfile, requirementFromOpportunity, scoreWith, isBlockedBetween, blockedIdsFor, type ProfileLike,
} from '../lib/people';
import {
  loadOpportunity, refreshStatus, spotsLeft, ensureTeamConversation, acceptApplication, removeMember, teamMembers, skillGap,
  expireDuePosts,
} from '../services/teams';

export const opportunitiesRouter = Router();

type Viewer = { id: string; isAdmin: boolean; profile: ProfileLike | null };

async function viewerOf(req: Request): Promise<Viewer> {
  const u = me(req);
  const profile = (await Profile.findOne({ userId: u._id }).lean()) as ProfileLike | null;
  return { id: String(u._id), isAdmin: u.role === 'admin', profile };
}

async function leaderCards(leaderIds: string[]) {
  const profiles = await Profile.find({ userId: { $in: leaderIds } }).lean();
  const users = await User.find({ _id: { $in: leaderIds } }, { institutionVerified: 1 }).lean();
  const uv = new Map(users.map((u) => [String(u._id), u.institutionVerified]));
  return new Map(
    profiles.map((p) => [
      String(p.userId),
      { id: String(p.userId), name: p.name, college: p.college, avatarUrl: avatarUrl(p), institutionVerified: !!uv.get(String(p.userId)) },
    ]),
  );
}

function oppDto(o: OpportunityDoc | (Record<string, unknown> & { _id: unknown }), extras: Record<string, unknown> = {}) {
  const x = o as unknown as {
    _id: unknown; title: string; description: string; eventName: string; type: string; domains: string[]; deadline: Date;
    teamSize: number; commitmentHours: number; requiredSkills: string[]; openRoles: { role: string; slots: number; filled: number }[];
    location: string; memberCount: number; status: string; createdAt: Date; leaderId: unknown; approvedAt: Date | null;
  };
  return {
    id: String(x._id),
    title: x.title,
    description: x.description,
    eventName: x.eventName,
    type: x.type,
    domains: x.domains,
    deadline: x.deadline,
    teamSize: x.teamSize,
    commitmentHours: x.commitmentHours,
    requiredSkills: x.requiredSkills,
    openRoles: x.openRoles.map((r) => ({ role: r.role, slots: r.slots, filled: r.filled, remaining: Math.max(0, r.slots - r.filled) })),
    location: x.location,
    memberCount: x.memberCount,
    spotsLeft: spotsLeft(x),
    status: x.status,
    createdAt: x.createdAt,
    approvedAt: x.approvedAt,
    leaderId: String(x.leaderId),
    ...extras,
  };
}

async function normalizeInput(body: unknown) {
  const input = parse(opportunitySchema, body);
  const c = await getCatalog();
  if (input.deadline.getTime() < Date.now() + 60 * 60 * 1000) {
    throw badRequest('Please fix the highlighted fields', 'VALIDATION_ERROR', { deadline: 'Deadline must be at least an hour in the future' });
  }
  const skills: string[] = [];
  for (const s of input.requiredSkills) skills.push(await resolveOrCreateSkill(s));
  const roleSlugs = new Set(c.roles.map((r) => r.slug));
  const merged = new Map<string, number>();
  for (const r of input.openRoles) {
    if (!roleSlugs.has(r.role)) throw badRequest('Please fix the highlighted fields', 'VALIDATION_ERROR', { openRoles: `Unknown role "${r.role}"` });
    merged.set(r.role, (merged.get(r.role) ?? 0) + r.slots);
  }
  return {
    ...input,
    domains: validSlugs(input.domains, c.interests),
    requiredSkills: Array.from(new Set(skills)),
    openRoles: [...merged.entries()].map(([role, slots]) => ({ role, slots, filled: 0 })),
  };
}

// ---------------------------------------------------------------- browse / search (FR8, FR9)
opportunitiesRouter.get('/', requireAuth, async (req, res) => {
  const v = await viewerOf(req);
  const c = await getCatalog();
  const { limit, page: p, skip } = page(req, 12, 48);
  await expireDuePosts();

  const filter: Record<string, unknown> = { status: 'open', hiddenByBan: { $ne: true } };
  const and: Record<string, unknown>[] = [];
  const q = qstr(req.query.q);
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    const skillSlug = c.aliasIndex.get(q.toLowerCase().replace(/[^a-z0-9+#]/g, '').replace(/\+\+/g, 'pp').replace(/#/g, 'sharp'));
    and.push({ $or: [{ title: rx }, { eventName: rx }, { description: rx }, ...(skillSlug ? [{ requiredSkills: skillSlug }] : [])] });
  }
  const event = qstr(req.query.event);
  if (event) and.push({ eventName: new RegExp(escapeRegex(event), 'i') });
  const skills = qlist(req.query.skills);
  if (skills.length) and.push({ requiredSkills: { $all: skills } });
  const role = qstr(req.query.role);
  if (role) and.push({ 'openRoles.role': role }); // remaining-slot check is done in memory below
  const domains = qlist(req.query.domains);
  if (domains.length) and.push({ domains: { $in: domains } });
  const type = qstr(req.query.type);
  if (type) and.push({ type });
  const before = qstr(req.query.deadlineBefore);
  if (before && !Number.isNaN(Date.parse(before))) and.push({ deadline: { $lte: new Date(before) } });
  if (req.query.mine === 'exclude') and.push({ leaderId: { $ne: v.id } });
  const blocked = await blockedIdsFor(v.id);
  if (blocked.length) and.push({ leaderId: { $nin: blocked } });
  if (and.length) filter.$and = and;

  const all = await Opportunity.find(filter).limit(2000).lean();
  const rows = role ? all.filter((o) => o.openRoles.some((r) => r.role === role && r.filled < r.slots)) : all;
  const sort = qstr(req.query.sort) || 'match';
  const mine = await Application.find({ applicantId: v.id, opportunityId: { $in: rows.map((r) => r._id) } }, { opportunityId: 1, status: 1 }).lean();
  const myApps = new Map(mine.map((a) => [String(a.opportunityId), a.status]));
  const scored = rows.map((o) => {
    const isLeader = String(o.leaderId) === v.id;
    const match = v.profile && !isLeader ? scoreWith(c, requirementFromOpportunity(o), candidateFromProfile(v.profile)) : null;
    return { o, match, isLeader };
  });
  if (sort === 'deadline') scored.sort((a, b) => +a.o.deadline - +b.o.deadline);
  else if (sort === 'new') scored.sort((a, b) => +(b.o as unknown as { createdAt: Date }).createdAt - +(a.o as unknown as { createdAt: Date }).createdAt);
  else scored.sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1) || +a.o.deadline - +b.o.deadline);

  const slice = scored.slice(skip, skip + limit);
  const leaders = await leaderCards(slice.map((s) => String(s.o.leaderId)));
  res.json({
    items: slice.map((s) =>
      oppDto(s.o, {
        leader: leaders.get(String(s.o.leaderId)) ?? null,
        isLeader: s.isLeader,
        match: s.match,
        myApplicationStatus: myApps.get(String(s.o._id)) ?? null,
      }),
    ),
    total: scored.length,
    page: p,
    pages: Math.max(1, Math.ceil(scored.length / limit)),
  });
});

/** Posts I lead + teams I'm in (all statuses). */
opportunitiesRouter.get('/mine', requireAuth, async (req, res) => {
  const v = me(req);
  await expireDuePosts();
  const led = await Opportunity.find({ leaderId: v._id, status: { $ne: 'removed' } }).sort({ createdAt: -1 }).lean();
  const memberships = await TeamMember.find({ userId: v._id, isLeader: false }).lean();
  const memberOf = await Opportunity.find({ _id: { $in: memberships.map((m) => m.opportunityId) }, status: { $ne: 'removed' } }).lean();
  const pendingCounts = await Application.aggregate<{ _id: unknown; n: number }>([
    { $match: { opportunityId: { $in: led.map((o) => o._id) }, status: 'pending' } },
    { $group: { _id: '$opportunityId', n: { $sum: 1 } } },
  ]);
  const pc = new Map(pendingCounts.map((p) => [String(p._id), p.n]));
  const leaders = await leaderCards(memberOf.map((o) => String(o.leaderId)));
  res.json({
    led: led.map((o) => oppDto(o, { pendingApplications: pc.get(String(o._id)) ?? 0, rejectionReason: o.rejectionReason, isLeader: true })),
    memberOf: memberOf.map((o) =>
      oppDto(o, { leader: leaders.get(String(o.leaderId)) ?? null, myRole: memberships.find((m) => String(m.opportunityId) === String(o._id))?.role }),
    ),
  });
});

// ---------------------------------------------------------------- create (FR16)
opportunitiesRouter.post('/', requireVerified, async (req, res) => {
  const user = me(req);
  const data = await normalizeInput(req.body);
  const opp = await Opportunity.create({ ...data, leaderId: user._id, status: 'pending_approval', memberCount: 0 });
  await TeamMember.create({ opportunityId: opp._id, userId: user._id, role: 'leader', isLeader: true });
  await ensureTeamConversation(opp);
  const admins = await User.find({ role: 'admin', status: 'active' }, { _id: 1 }).lean();
  await notifyMany(
    admins.map((a) => a._id),
    { type: 'post_pending', title: `New team post awaiting approval: "${opp.title}"`, body: `${user.name} posted for ${opp.eventName}.`, link: '/admin/posts' },
  );
  res.status(201).json(oppDto(opp, { isLeader: true }));
});

// ---------------------------------------------------------------- details
opportunitiesRouter.get('/:id', requireAuth, async (req, res) => {
  const v = await viewerOf(req);
  const opp = await loadOpportunity(objectId(req.params.id, 'Opportunity'));
  const isLeader = String(opp.leaderId) === v.id;
  const membership = await TeamMember.findOne({ opportunityId: opp._id, userId: v.id }).lean();
  const isMember = !!membership;
  const publicStatuses = ['open', 'closed', 'expired'];
  if (!publicStatuses.includes(opp.status) && !isLeader && !v.isAdmin) throw notFound('Opportunity not found');
  if (!isLeader && !v.isAdmin && (await isBlockedBetween(v.id, opp.leaderId))) throw notFound('Opportunity not found');
  const c = await getCatalog();
  const members = await teamMembers(opp._id);
  const myApplication = await Application.findOne({ opportunityId: opp._id, applicantId: v.id }).lean();
  const myInvitation = await TeamInvitation.findOne({ opportunityId: opp._id, inviteeId: v.id, status: 'pending' }).lean();
  const leaders = await leaderCards([String(opp.leaderId)]);
  const match = v.profile && !isLeader ? scoreWith(c, requirementFromOpportunity(opp), candidateFromProfile(v.profile)) : null;
  const pendingApplications = isLeader ? await Application.countDocuments({ opportunityId: opp._id, status: 'pending' }) : undefined;
  const n = nameLookup(c);
  const canApply =
    !isLeader && !isMember && opp.status === 'open' && opp.deadline > new Date() && spotsLeft(opp) > 0 &&
    (!myApplication || myApplication.status === 'withdrawn');
  res.json(
    oppDto(opp, {
      leader: leaders.get(String(opp.leaderId)) ?? null,
      members,
      isLeader,
      isMember,
      myRole: membership?.role ?? null,
      canApply,
      myApplication: myApplication
        ? { id: String(myApplication._id), status: myApplication.status, role: myApplication.role, message: myApplication.message, createdAt: (myApplication as unknown as { createdAt: Date }).createdAt }
        : null,
      myInvitation: myInvitation ? { id: String(myInvitation._id), role: myInvitation.role, message: myInvitation.message } : null,
      match,
      pendingApplications,
      rejectionReason: isLeader || v.isAdmin ? opp.rejectionReason : undefined,
      conversationId: isLeader || isMember ? String(opp.conversationId ?? '') : null,
      names: Object.fromEntries([...opp.requiredSkills.map((s) => [s, n.skill(s)]), ...opp.openRoles.map((r) => [r.role, n.role(r.role)]), ...opp.domains.map((d) => [d, n.interest(d)])]),
    }),
  );
});

// ---------------------------------------------------------------- edit / close (FR18)
opportunitiesRouter.put('/:id', requireVerified, async (req, res) => {
  const user = me(req);
  const opp = await loadOpportunity(objectId(req.params.id, 'Opportunity'));
  if (String(opp.leaderId) !== String(user._id)) throw forbidden('Only the team leader can edit this post');
  if (['removed', 'expired'].includes(opp.status)) throw badRequest(`An ${opp.status} post can't be edited`);
  const data = await normalizeInput(req.body);
  if (data.teamSize - 1 < opp.memberCount) {
    throw badRequest('Please fix the highlighted fields', 'VALIDATION_ERROR', { teamSize: `Your team already has ${opp.memberCount + 1} people` });
  }
  const roles = data.openRoles.map((r) => {
    const prev = opp.openRoles.find((x) => x.role === r.role);
    return { ...r, filled: prev?.filled ?? 0 };
  });
  for (const prev of opp.openRoles) {
    const next = roles.find((r) => r.role === prev.role);
    if (prev.filled > 0 && (!next || next.slots < prev.filled)) {
      throw badRequest('Please fix the highlighted fields', 'VALIDATION_ERROR', { openRoles: `You can't reduce a role below its filled positions (${prev.role}: ${prev.filled} filled)` });
    }
  }
  const wasRejected = opp.status === 'rejected';
  Object.assign(opp, { ...data, openRoles: roles });
  opp.markModified('openRoles');
  if (wasRejected) {
    opp.status = 'pending_approval'; // resubmitted for moderation
    opp.rejectionReason = '';
  } else if (opp.status === 'closed' && spotsLeft(opp) > 0 && roles.some((r) => r.filled < r.slots)) {
    opp.status = 'open';
  } else if (opp.status === 'open' && (spotsLeft(opp) === 0 || roles.every((r) => r.filled >= r.slots))) {
    opp.status = 'closed';
  }
  await opp.save();
  if (wasRejected) {
    const admins = await User.find({ role: 'admin', status: 'active' }, { _id: 1 }).lean();
    await notifyMany(admins.map((a) => a._id), { type: 'post_pending', title: `Post resubmitted: "${opp.title}"`, link: '/admin/posts' });
  }
  res.json(oppDto(opp, { isLeader: true }));
});

opportunitiesRouter.post('/:id/close', requireAuth, async (req, res) => {
  const user = me(req);
  const opp = await loadOpportunity(objectId(req.params.id, 'Opportunity'));
  if (String(opp.leaderId) !== String(user._id)) throw forbidden('Only the team leader can close this post');
  if (opp.status !== 'open') throw badRequest('Only open posts can be closed');
  opp.status = 'closed';
  await opp.save();
  const pending = await Application.find({ opportunityId: opp._id, status: 'pending' }, { applicantId: 1 }).lean();
  await Application.updateMany({ opportunityId: opp._id, status: 'pending' }, { $set: { status: 'rejected', decidedAt: new Date() } });
  await notifyMany(pending.map((p) => p.applicantId), { type: 'application_rejected', title: `"${opp.title}" stopped recruiting`, body: 'The leader closed the post, so your application was closed.', link: '/applications' });
  res.json(oppDto(opp, { isLeader: true }));
});

opportunitiesRouter.post('/:id/reopen', requireAuth, async (req, res) => {
  const user = me(req);
  const opp = await loadOpportunity(objectId(req.params.id, 'Opportunity'));
  if (String(opp.leaderId) !== String(user._id)) throw forbidden('Only the team leader can reopen this post');
  if (opp.status !== 'closed') throw badRequest('Only closed posts can be reopened');
  if (spotsLeft(opp) === 0 || opp.openRoles.every((r) => r.filled >= r.slots)) throw badRequest('The team is full. Edit the post to add positions first.');
  opp.status = 'open';
  await opp.save();
  res.json(oppDto(opp, { isLeader: true }));
});

opportunitiesRouter.delete('/:id', requireAuth, async (req, res) => {
  const user = me(req);
  const opp = await loadOpportunity(objectId(req.params.id, 'Opportunity'));
  if (String(opp.leaderId) !== String(user._id)) throw forbidden('Only the team leader can delete this post');
  opp.status = 'removed';
  await opp.save();
  await Application.updateMany({ opportunityId: opp._id, status: 'pending' }, { $set: { status: 'rejected', decidedAt: new Date() } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- apply (FR10, QR2)
opportunitiesRouter.post('/:id/apply', requireVerified, async (req, res) => {
  const user = me(req);
  const input = parse(applySchema, req.body);
  const opp = await loadOpportunity(objectId(req.params.id, 'Opportunity'));
  if (String(opp.leaderId) === String(user._id)) throw badRequest("You can't apply to your own team");
  if (opp.status === 'expired') throw badRequest('The deadline for this team has passed', 'EXPIRED');
  if (opp.status !== 'open') throw badRequest('This team is not accepting applications', 'NOT_OPEN');
  if (spotsLeft(opp) === 0) throw badRequest('This team is full', 'TEAM_FULL');
  if (await TeamMember.exists({ opportunityId: opp._id, userId: user._id })) throw badRequest("You're already in this team");
  if (await isBlockedBetween(user._id, opp.leaderId)) throw forbidden('You cannot apply to this team');
  const slot = opp.openRoles.find((r) => r.role === input.role);
  if (!slot || slot.filled >= slot.slots) {
    throw badRequest('Please fix the highlighted fields', 'VALIDATION_ERROR', { role: 'That role is not open' });
  }
  const profile = await Profile.findOne({ userId: user._id }).lean();
  const c = await getCatalog();
  const score = profile ? scoreWith(c, requirementFromOpportunity(opp, input.role), candidateFromProfile(profile as ProfileLike)).score : 0;

  const existing = await Application.findOne({ opportunityId: opp._id, applicantId: user._id });
  let app;
  if (existing) {
    if (existing.status !== 'withdrawn') throw conflict("You've already applied to this team", 'ALREADY_APPLIED');
    existing.set({ status: 'pending', role: input.role, message: input.message, matchScore: score, decidedAt: null });
    app = await existing.save();
  } else {
    try {
      app = await Application.create({ opportunityId: opp._id, applicantId: user._id, role: input.role, message: input.message, matchScore: score });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw conflict("You've already applied to this team", 'ALREADY_APPLIED');
      throw e;
    }
  }
  await notify({
    userId: opp.leaderId,
    type: 'application_received',
    title: `New application for "${opp.title}"`,
    body: `${profile?.name ?? user.name} applied as ${nameLookup(c).role(input.role)} · ${score}% match`,
    link: `/opportunities/${opp._id}/applications`,
    email: true,
  });
  res.status(201).json({ id: String(app._id), status: app.status, role: app.role, matchScore: score });
});

// ---------------------------------------------------------------- applications for a post (FR17)
opportunitiesRouter.get('/:id/applications', requireAuth, async (req, res) => {
  const user = me(req);
  const opp = await loadOpportunity(objectId(req.params.id, 'Opportunity'));
  if (String(opp.leaderId) !== String(user._id) && user.role !== 'admin') throw forbidden('Only the team leader can view applications');
  const status = qstr(req.query.status);
  const apps = await Application.find({ opportunityId: opp._id, ...(status ? { status } : { status: { $ne: 'withdrawn' } }) }).sort({ createdAt: -1 }).lean();
  const profiles = await Profile.find({ userId: { $in: apps.map((a) => a.applicantId) } }).lean();
  const users = await User.find({ _id: { $in: apps.map((a) => a.applicantId) } }, { institutionVerified: 1, status: 1 }).lean();
  const pm = new Map(profiles.map((p) => [String(p.userId), p]));
  const um = new Map(users.map((u) => [String(u._id), u]));
  const c = await getCatalog();
  res.json({
    opportunity: oppDto(opp, { isLeader: true }),
    items: apps
      .map((a) => {
        const p = pm.get(String(a.applicantId));
        if (!p) return null;
        const match = scoreWith(c, requirementFromOpportunity(opp, a.role), candidateFromProfile(p as ProfileLike));
        return {
          id: String(a._id),
          status: a.status,
          role: a.role,
          message: a.message,
          createdAt: (a as unknown as { createdAt: Date }).createdAt,
          decidedAt: a.decidedAt,
          applicant: {
            id: String(p.userId),
            name: p.name,
            headline: p.headline,
            college: p.college,
            branch: p.branch,
            year: p.year,
            avatarUrl: avatarUrl(p),
            skills: p.skillSlugs,
            roles: p.preferredRoles,
            availabilityHours: p.availabilityHours,
            institutionVerified: !!um.get(String(a.applicantId))?.institutionVerified,
          },
          match,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a!.status === 'pending' ? 0 : 1) - (b!.status === 'pending' ? 0 : 1) || b!.match.score - a!.match.score),
  });
});

// ---------------------------------------------------------------- team & skill gap (FR18, FR19)
opportunitiesRouter.get('/:id/team', requireAuth, async (req, res) => {
  const user = me(req);
  const opp = await loadOpportunity(objectId(req.params.id, 'Opportunity'));
  const isMember = await TeamMember.exists({ opportunityId: opp._id, userId: user._id });
  if (!isMember && user.role !== 'admin') throw forbidden('Only team members can open the team page');
  const members = await teamMembers(opp._id);
  const invitations = String(opp.leaderId) === String(user._id)
    ? await TeamInvitation.find({ opportunityId: opp._id, status: 'pending' }).lean()
    : [];
  const inviteeProfiles = await Profile.find({ userId: { $in: invitations.map((i) => i.inviteeId) } }).lean();
  res.json({
    opportunity: oppDto(opp, { isLeader: String(opp.leaderId) === String(user._id) }),
    members,
    conversationId: String(await ensureTeamConversation(opp)),
    invitations: invitations.map((i) => {
      const p = inviteeProfiles.find((x) => String(x.userId) === String(i.inviteeId));
      return { id: String(i._id), role: i.role, user: p ? { id: String(p.userId), name: p.name, avatarUrl: avatarUrl(p) } : null };
    }),
  });
});

opportunitiesRouter.get('/:id/skill-gap', requireAuth, async (req, res) => {
  const user = me(req);
  const opp = await loadOpportunity(objectId(req.params.id, 'Opportunity'));
  const isMember = await TeamMember.exists({ opportunityId: opp._id, userId: user._id });
  if (!isMember && user.role !== 'admin') throw forbidden('Only team members can view the skill gap');
  const limit = req.query.all === '1' ? 50 : 5;
  res.json({ opportunity: oppDto(opp, { isLeader: String(opp.leaderId) === String(user._id) }), ...(await skillGap(opp, limit)) });
});

opportunitiesRouter.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  const user = me(req);
  const opp = await loadOpportunity(objectId(req.params.id, 'Opportunity'));
  if (String(opp.leaderId) !== String(user._id)) throw forbidden('Only the team leader can remove members');
  await removeMember(opp._id, objectId(req.params.userId, 'Member'), { id: user._id, isLeaderAction: true });
  res.json({ ok: true });
});

opportunitiesRouter.post('/:id/leave', requireAuth, async (req, res) => {
  const user = me(req);
  const opp = await loadOpportunity(objectId(req.params.id, 'Opportunity'));
  await removeMember(opp._id, user._id, { id: user._id, isLeaderAction: false });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- invitations (team invites)
opportunitiesRouter.post('/:id/invite', requireVerified, async (req, res) => {
  const user = me(req);
  const input = parse(z.object({ userId: z.string(), role: z.string().min(1), message: z.string().trim().max(500).optional().default('') }), req.body);
  const opp = await loadOpportunity(objectId(req.params.id, 'Opportunity'));
  if (String(opp.leaderId) !== String(user._id)) throw forbidden('Only the team leader can send invitations');
  if (opp.status !== 'open') throw badRequest('Only open teams can invite members');
  const inviteeId = objectId(input.userId, 'User');
  if (String(inviteeId) === String(user._id)) throw badRequest("You can't invite yourself");
  const invitee = await User.findOne({ _id: inviteeId, status: 'active' });
  if (!invitee) throw notFound('User not found');
  if (await TeamMember.exists({ opportunityId: opp._id, userId: inviteeId })) throw badRequest('They are already in this team');
  if (await isBlockedBetween(user._id, inviteeId)) throw forbidden('You cannot invite this user');
  const slot = opp.openRoles.find((r) => r.role === input.role);
  if (!slot || slot.filled >= slot.slots) throw badRequest('That role is not open');
  try {
    await TeamInvitation.create({ opportunityId: opp._id, inviterId: user._id, inviteeId, role: input.role, message: input.message });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw conflict('You have already invited this person');
    throw e;
  }
  const c = await getCatalog();
  await notify({
    userId: inviteeId,
    type: 'team_invite',
    title: `${user.name} invited you to join "${opp.title}"`,
    body: `Role: ${nameLookup(c).role(input.role)} · ${opp.eventName}${input.message ? ` — "${input.message}"` : ''}`,
    link: `/opportunities/${opp._id}`,
    email: true,
  });
  res.status(201).json({ ok: true });
});

void refreshStatus;
void acceptApplication;
