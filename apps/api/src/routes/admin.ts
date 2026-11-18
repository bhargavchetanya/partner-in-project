import { Router, type Request } from 'express';
import { z } from 'zod';
import { slugify } from '@pip/shared';
import {
  User, Profile, Opportunity, Application, Report, AdminAction, Session, Message, Conversation, Skill, SkillCategory,
  Role, Interest, InstitutionDomain, GithubAccount, Connection, TeamMember,
} from '../models';
import { parse, badRequest, notFound, objectId, page, qstr, escapeRegex, conflict } from '../lib/http';
import { requireAdmin, me } from '../lib/auth';
import { notify } from '../lib/notify';
import { avatarUrl } from '../lib/people';
import { invalidateCatalog, getCatalog } from '../lib/catalog';
import { ensureTeamConversation } from '../services/teams';
import { githubRequestsLastHour } from '../services/github';

export const adminRouter = Router();
adminRouter.use(requireAdmin); // FR20 / QR24

async function log(req: Request, action: string, targetType: string, targetId: unknown, reason = '', meta: Record<string, unknown> = {}) {
  await AdminAction.create({ adminId: me(req)._id, action, targetType, targetId: String(targetId), reason, meta });
}

const reasonSchema = z.object({ reason: z.string().trim().max(500).optional().default('') });

// ---------------------------------------------------------------- dashboard
adminRouter.get('/stats', async (_req, res) => {
  const since7 = new Date(Date.now() - 7 * 86400_000);
  const since14 = new Date(Date.now() - 14 * 86400_000);
  const [
    users, verified, banned, deactivated, newUsers, oppByStatus, apps, accepted, messages, openReports, gh, connections,
    signupsDaily, postsDaily, appsDaily,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ emailVerified: true }),
    User.countDocuments({ status: 'banned' }),
    User.countDocuments({ status: 'deactivated' }),
    User.countDocuments({ createdAt: { $gte: since7 } }),
    Opportunity.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Application.countDocuments(),
    Application.countDocuments({ status: 'accepted' }),
    Message.countDocuments(),
    Report.countDocuments({ status: 'open' }),
    GithubAccount.countDocuments(),
    Connection.countDocuments(),
    daily(User, since14),
    daily(Opportunity, since14),
    daily(Application, since14),
  ]);
  res.json({
    users: { total: users, verified, banned, deactivated, newLast7Days: newUsers, githubLinked: gh },
    opportunities: Object.fromEntries(oppByStatus.map((o) => [o._id, o.n])),
    applications: { total: apps, accepted },
    messages,
    connections,
    openReports,
    githubRequestsLastHour: githubRequestsLastHour(),
    activity: mergeDaily(since14, { signups: signupsDaily, posts: postsDaily, applications: appsDaily }),
  });
});

async function daily(model: typeof User | typeof Opportunity | typeof Application, since: Date) {
  return (model as typeof User).aggregate<{ _id: string; n: number }>([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } },
  ]);
}

function mergeDaily(since: Date, series: Record<string, { _id: string; n: number }[]>) {
  const out: Record<string, number | string>[] = [];
  for (let d = new Date(since); d <= new Date(); d = new Date(d.getTime() + 86400_000)) {
    const key = d.toISOString().slice(0, 10);
    const row: Record<string, number | string> = { date: key };
    for (const [name, rows] of Object.entries(series)) row[name] = rows.find((r) => r._id === key)?.n ?? 0;
    out.push(row);
  }
  return out;
}

adminRouter.get('/activity', async (_req, res) => {
  const [actions, recentUsers, recentPosts] = await Promise.all([
    AdminAction.find().sort({ createdAt: -1 }).limit(30).lean(),
    User.find({}, { name: 1, email: 1, createdAt: 1, emailVerified: 1 }).sort({ createdAt: -1 }).limit(8).lean(),
    Opportunity.find({}, { title: 1, status: 1, createdAt: 1, eventName: 1 }).sort({ createdAt: -1 }).limit(8).lean(),
  ]);
  const admins = await Profile.find({ userId: { $in: actions.map((a) => a.adminId) } }, { userId: 1, name: 1 }).lean();
  res.json({
    actions: actions.map((a) => ({ ...a, id: String(a._id), adminName: admins.find((p) => String(p.userId) === String(a.adminId))?.name ?? 'Admin' })),
    recentUsers,
    recentPosts,
  });
});

// ---------------------------------------------------------------- users (FR23, FR22)
adminRouter.get('/users', async (req, res) => {
  const { limit, page: p, skip } = page(req, 20, 100);
  const filter: Record<string, unknown> = {};
  const q = qstr(req.query.q);
  if (q) filter.$or = [{ name: new RegExp(escapeRegex(q), 'i') }, { email: new RegExp(escapeRegex(q), 'i') }];
  const status = qstr(req.query.status);
  if (status) filter.status = status;
  const role = qstr(req.query.role);
  if (role) filter.role = role;
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  const profiles = await Profile.find({ userId: { $in: items.map((u) => u._id) } }).lean();
  const reports = await Report.aggregate<{ _id: unknown; n: number }>([
    { $match: { targetOwnerId: { $in: items.map((u) => u._id) } } },
    { $group: { _id: '$targetOwnerId', n: { $sum: 1 } } },
  ]);
  res.json({
    items: items.map((u) => {
      const pr = profiles.find((x) => String(x.userId) === String(u._id));
      return {
        id: String(u._id),
        name: pr?.name ?? u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        statusReason: u.statusReason,
        emailVerified: u.emailVerified,
        institutionVerified: u.institutionVerified,
        college: pr?.college ?? '',
        avatarUrl: pr ? avatarUrl(pr) : null,
        warnings: u.warnings,
        reports: reports.find((r) => String(r._id) === String(u._id))?.n ?? 0,
        createdAt: (u as unknown as { createdAt: Date }).createdAt,
        lastLoginAt: u.lastLoginAt,
      };
    }),
    total,
    page: p,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

async function setUserStatus(req: Request, userId: unknown, status: 'active' | 'deactivated' | 'banned', reason: string) {
  const admin = me(req);
  const user = await User.findById(userId);
  if (!user) throw notFound('User not found');
  if (String(user._id) === String(admin._id)) throw badRequest("You can't change your own account status");
  user.status = status;
  user.statusReason = reason;
  await user.save();
  if (status !== 'active') {
    await Session.deleteMany({ userId: user._id }); // cannot log in / signed out everywhere
  }
  // FR22: a banned user's team posts are hidden; restored if re-activated
  await Opportunity.updateMany({ leaderId: user._id }, { $set: { hiddenByBan: status === 'banned' } });
  await log(req, `user_${status === 'active' ? 'activate' : status === 'banned' ? 'ban' : 'deactivate'}`, 'user', user._id, reason);
}

adminRouter.patch('/users/:id/status', async (req, res) => {
  const { status, reason } = parse(z.object({ status: z.enum(['active', 'deactivated', 'banned']), reason: z.string().trim().max(500).optional().default('') }), req.body);
  await setUserStatus(req, objectId(req.params.id, 'User'), status, reason);
  res.json({ ok: true });
});

adminRouter.patch('/users/:id/role', async (req, res) => {
  const { role } = parse(z.object({ role: z.enum(['student', 'admin']) }), req.body);
  const user = await User.findById(objectId(req.params.id, 'User'));
  if (!user) throw notFound('User not found');
  if (String(user._id) === String(me(req)._id)) throw badRequest("You can't change your own role");
  user.role = role;
  await user.save();
  await log(req, `role_${role}`, 'user', user._id);
  res.json({ ok: true });
});

adminRouter.post('/users/:id/warn', async (req, res) => {
  const { reason } = parse(reasonSchema, req.body);
  const user = await User.findByIdAndUpdate(objectId(req.params.id, 'User'), { $inc: { warnings: 1 } }, { new: true });
  if (!user) throw notFound('User not found');
  await notify({ userId: user._id, type: 'account_warning', title: 'You received a warning from the moderators', body: reason || 'Please follow the community guidelines.', link: '/notifications', email: true });
  await log(req, 'user_warn', 'user', user._id, reason);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- posts (FR21)
adminRouter.get('/opportunities', async (req, res) => {
  const status = qstr(req.query.status) || 'pending_approval';
  const { limit, page: p, skip } = page(req, 20, 100);
  const filter = status === 'all' ? {} : { status };
  const [items, total] = await Promise.all([
    Opportunity.find(filter).sort({ createdAt: status === 'pending_approval' ? 1 : -1 }).skip(skip).limit(limit).lean(),
    Opportunity.countDocuments(filter),
  ]);
  const leaders = await Profile.find({ userId: { $in: items.map((o) => o.leaderId) } }).lean();
  const users = await User.find({ _id: { $in: items.map((o) => o.leaderId) } }, { email: 1, institutionVerified: 1 }).lean();
  res.json({
    items: items.map((o) => {
      const l = leaders.find((x) => String(x.userId) === String(o.leaderId));
      const u = users.find((x) => String(x._id) === String(o.leaderId));
      return {
        id: String(o._id),
        title: o.title,
        description: o.description,
        eventName: o.eventName,
        type: o.type,
        domains: o.domains,
        deadline: o.deadline,
        teamSize: o.teamSize,
        requiredSkills: o.requiredSkills,
        openRoles: o.openRoles,
        status: o.status,
        rejectionReason: o.rejectionReason,
        hiddenByBan: o.hiddenByBan,
        createdAt: (o as unknown as { createdAt: Date }).createdAt,
        leader: l ? { id: String(l.userId), name: l.name, college: l.college, avatarUrl: avatarUrl(l), email: u?.email, institutionVerified: !!u?.institutionVerified } : null,
      };
    }),
    total,
    page: p,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

adminRouter.post('/opportunities/:id/approve', async (req, res) => {
  const opp = await Opportunity.findById(objectId(req.params.id, 'Post'));
  if (!opp) throw notFound('Post not found');
  if (opp.status !== 'pending_approval') throw badRequest(`This post is ${opp.status.replace('_', ' ')}`);
  opp.status = opp.deadline > new Date() ? 'open' : 'expired';
  opp.approvedAt = new Date();
  await opp.save();
  await ensureTeamConversation(opp);
  await notify({ userId: opp.leaderId, type: 'post_approved', title: `Your post "${opp.title}" is live`, body: 'Students can now find it and apply.', link: `/opportunities/${opp._id}`, email: true });
  await log(req, 'post_approve', 'opportunity', opp._id);
  res.json({ ok: true, status: opp.status });
});

adminRouter.post('/opportunities/:id/reject', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'Give a reason so the leader can fix the post').max(500) }), req.body);
  const opp = await Opportunity.findById(objectId(req.params.id, 'Post'));
  if (!opp) throw notFound('Post not found');
  if (opp.status !== 'pending_approval') throw badRequest(`This post is ${opp.status.replace('_', ' ')}`);
  opp.status = 'rejected';
  opp.rejectionReason = reason;
  await opp.save();
  await notify({ userId: opp.leaderId, type: 'post_rejected', title: `Your post "${opp.title}" was not approved`, body: `Reason: ${reason}. You can edit and resubmit it.`, link: `/opportunities/${opp._id}/edit`, email: true });
  await log(req, 'post_reject', 'opportunity', opp._id, reason);
  res.json({ ok: true });
});

adminRouter.post('/opportunities/:id/remove', async (req, res) => {
  const { reason } = parse(reasonSchema, req.body);
  const opp = await Opportunity.findById(objectId(req.params.id, 'Post'));
  if (!opp) throw notFound('Post not found');
  opp.status = 'removed';
  await opp.save();
  await Application.updateMany({ opportunityId: opp._id, status: 'pending' }, { $set: { status: 'rejected', decidedAt: new Date() } });
  await notify({ userId: opp.leaderId, type: 'content_removed', title: `Your post "${opp.title}" was removed by a moderator`, body: reason, email: true });
  await log(req, 'post_remove', 'opportunity', opp._id, reason);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- reports (FR22)
adminRouter.get('/reports', async (req, res) => {
  const status = qstr(req.query.status) || 'open';
  const filter = status === 'all' ? {} : { status };
  const items = await Report.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  const peopleIds = [...items.map((r) => r.reporterId), ...items.map((r) => r.targetOwnerId).filter(Boolean)];
  const profiles = await Profile.find({ userId: { $in: peopleIds } }).lean();
  const owners = await User.find({ _id: { $in: items.map((r) => r.targetOwnerId).filter(Boolean) } }, { status: 1, warnings: 1 }).lean();
  const opps = await Opportunity.find({ _id: { $in: items.filter((r) => r.targetType === 'opportunity').map((r) => r.targetId) } }, { title: 1, status: 1 }).lean();
  const msgs = await Message.find({ _id: { $in: items.filter((r) => r.targetType === 'message').map((r) => r.targetId) } }, { body: 1, removed: 1 }).lean();
  const person = (id: unknown) => {
    const p = profiles.find((x) => String(x.userId) === String(id));
    return p ? { id: String(p.userId), name: p.name, avatarUrl: avatarUrl(p) } : null;
  };
  res.json({
    items: items.map((r) => {
      let target: Record<string, unknown> = { id: String(r.targetId) };
      if (r.targetType === 'user') target = { ...target, label: person(r.targetId)?.name ?? 'Deleted user', link: `/u/${r.targetId}` };
      if (r.targetType === 'opportunity') {
        const o = opps.find((x) => String(x._id) === String(r.targetId));
        target = { ...target, label: o?.title ?? 'Deleted post', status: o?.status, link: `/opportunities/${r.targetId}` };
      }
      if (r.targetType === 'message') {
        const m = msgs.find((x) => String(x._id) === String(r.targetId));
        target = { ...target, label: m ? `“${m.body.slice(0, 160)}”` : 'Deleted message', removed: m?.removed };
      }
      const owner = owners.find((o) => String(o._id) === String(r.targetOwnerId));
      return {
        id: String(r._id),
        targetType: r.targetType,
        reason: r.reason,
        details: r.details,
        status: r.status,
        resolution: r.resolution,
        createdAt: (r as unknown as { createdAt: Date }).createdAt,
        reporter: person(r.reporterId),
        owner: r.targetOwnerId ? { ...person(r.targetOwnerId), status: owner?.status, warnings: owner?.warnings ?? 0 } : null,
        target,
      };
    }),
  });
});

async function loadOpenReport(id: unknown) {
  const r = await Report.findById(id);
  if (!r) throw notFound('Report not found');
  if (r.status !== 'open') throw conflict('This report has already been handled');
  return r;
}

adminRouter.post('/reports/:id/dismiss', async (req, res) => {
  const { reason } = parse(reasonSchema, req.body);
  const r = await loadOpenReport(objectId(req.params.id, 'Report'));
  r.status = 'closed';
  r.resolution = reason || 'Dismissed — no action needed';
  r.handledBy = me(req)._id;
  r.handledAt = new Date();
  await r.save();
  await log(req, 'report_dismiss', 'report', r._id, reason);
  res.json({ ok: true });
});

/** Remove the reported post or message, and warn its owner. */
adminRouter.post('/reports/:id/remove-content', async (req, res) => {
  const { reason } = parse(reasonSchema, req.body);
  const r = await loadOpenReport(objectId(req.params.id, 'Report'));
  if (r.targetType === 'opportunity') {
    await Opportunity.updateOne({ _id: r.targetId }, { $set: { status: 'removed' } });
    await Application.updateMany({ opportunityId: r.targetId, status: 'pending' }, { $set: { status: 'rejected', decidedAt: new Date() } });
  } else if (r.targetType === 'message') {
    const m = await Message.findByIdAndUpdate(r.targetId, { $set: { removed: true } });
    if (m) await Conversation.updateOne({ _id: m.conversationId }, { $set: { lastMessagePreview: 'Message removed by a moderator' } });
  } else {
    throw badRequest('For user reports, use warn or ban instead');
  }
  if (r.targetOwnerId) {
    await User.updateOne({ _id: r.targetOwnerId }, { $inc: { warnings: 1 } });
    await notify({
      userId: r.targetOwnerId,
      type: 'content_removed',
      title: `Your ${r.targetType === 'message' ? 'message' : 'post'} was removed by a moderator`,
      body: `${reason || `Reported for ${r.reason.replace('_', ' ')}`}. This counts as a warning.`,
      email: true,
    });
  }
  await Report.updateMany({ targetType: r.targetType, targetId: r.targetId, status: 'open' }, { $set: { status: 'actioned', resolution: `Content removed. ${reason}`.trim(), handledBy: me(req)._id, handledAt: new Date() } });
  await log(req, 'report_remove_content', r.targetType, r.targetId, reason, { reportId: String(r._id) });
  res.json({ ok: true });
});

adminRouter.post('/reports/:id/warn', async (req, res) => {
  const { reason } = parse(reasonSchema, req.body);
  const r = await loadOpenReport(objectId(req.params.id, 'Report'));
  if (!r.targetOwnerId) throw badRequest('Nobody to warn');
  await User.updateOne({ _id: r.targetOwnerId }, { $inc: { warnings: 1 } });
  await notify({ userId: r.targetOwnerId, type: 'account_warning', title: 'You received a warning from the moderators', body: reason || `Reported for ${r.reason.replace('_', ' ')}.`, email: true });
  r.status = 'actioned';
  r.resolution = `Owner warned. ${reason}`.trim();
  r.handledBy = me(req)._id;
  r.handledAt = new Date();
  await r.save();
  await log(req, 'report_warn', 'user', r.targetOwnerId, reason, { reportId: String(r._id) });
  res.json({ ok: true });
});

adminRouter.post('/reports/:id/ban', async (req, res) => {
  const { reason } = parse(reasonSchema, req.body);
  const r = await loadOpenReport(objectId(req.params.id, 'Report'));
  if (!r.targetOwnerId) throw badRequest('Nobody to ban');
  await setUserStatus(req, r.targetOwnerId, 'banned', reason || `Reported for ${r.reason}`);
  await Report.updateMany({ targetOwnerId: r.targetOwnerId, status: 'open' }, { $set: { status: 'actioned', resolution: `User banned. ${reason}`.trim(), handledBy: me(req)._id, handledAt: new Date() } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- catalogue management
adminRouter.get('/catalog', async (_req, res) => {
  const [skills, categories, roles, interests, domains] = await Promise.all([
    Skill.find().sort({ name: 1 }).lean(),
    SkillCategory.find().sort({ order: 1 }).lean(),
    Role.find().sort({ name: 1 }).lean(),
    Interest.find().sort({ name: 1 }).lean(),
    InstitutionDomain.find().sort({ domain: 1 }).lean(),
  ]);
  const usage = await (await import('../models')).UserSkill.aggregate<{ _id: string; n: number }>([
    { $match: { status: 'confirmed' } },
    { $group: { _id: '$skill', n: { $sum: 1 } } },
  ]);
  const um = new Map(usage.map((u) => [u._id, u.n]));
  res.json({
    skills: skills.map((s) => ({ id: String(s._id), slug: s.slug, name: s.name, category: s.category, aliases: s.aliases, active: s.active, custom: s.custom, users: um.get(s.slug) ?? 0 })),
    categories: categories.map((c) => ({ id: String(c._id), slug: c.slug, name: c.name, order: c.order })),
    roles: roles.map((r) => ({ id: String(r._id), slug: r.slug, name: r.name, active: r.active })),
    interests: interests.map((r) => ({ id: String(r._id), slug: r.slug, name: r.name, active: r.active })),
    domains: domains.map((d) => ({ id: String(d._id), domain: d.domain })),
  });
});

const skillInput = z.object({
  name: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1).max(60),
  aliases: z.array(z.string().trim().max(60)).max(20).optional().default([]),
  active: z.boolean().optional().default(true),
});

adminRouter.post('/skills', async (req, res) => {
  const input = parse(skillInput, req.body);
  const c = await getCatalog();
  if (!c.categories.some((x) => x.slug === input.category)) throw badRequest('Unknown category');
  const slug = slugify(input.name);
  if (await Skill.exists({ slug })) throw conflict('A skill with this name already exists');
  const s = await Skill.create({ ...input, slug });
  invalidateCatalog();
  await log(req, 'skill_create', 'skill', s._id, '', { name: s.name });
  res.status(201).json({ ok: true });
});

adminRouter.patch('/skills/:id', async (req, res) => {
  const input = parse(skillInput.partial(), req.body);
  const s = await Skill.findByIdAndUpdate(objectId(req.params.id, 'Skill'), { $set: { ...input, custom: false } }, { new: true });
  if (!s) throw notFound('Skill not found');
  invalidateCatalog();
  await log(req, 'skill_update', 'skill', s._id, '', input);
  res.json({ ok: true });
});

const namedInput = z.object({ name: z.string().trim().min(1).max(60), active: z.boolean().optional() });
const orderInput = z.object({ name: z.string().trim().min(1).max(60), order: z.coerce.number().int().min(0).max(999).optional() });

adminRouter.post('/categories', async (req, res) => {
  const input = parse(orderInput, req.body);
  const slug = slugify(input.name);
  if (await SkillCategory.exists({ slug })) throw conflict('Category already exists');
  await SkillCategory.create({ slug, name: input.name, order: input.order ?? 50 });
  invalidateCatalog();
  await log(req, 'category_create', 'category', slug);
  res.status(201).json({ ok: true });
});
adminRouter.patch('/categories/:id', async (req, res) => {
  const input = parse(orderInput.partial(), req.body);
  const c = await SkillCategory.findByIdAndUpdate(objectId(req.params.id, 'Category'), { $set: input }, { new: true });
  if (!c) throw notFound('Category not found');
  invalidateCatalog();
  await log(req, 'category_update', 'category', c.slug);
  res.json({ ok: true });
});

for (const [path, model, label] of [['roles', Role, 'role'], ['interests', Interest, 'interest']] as const) {
  adminRouter.post(`/${path}`, async (req, res) => {
    const input = parse(namedInput, req.body);
    const slug = slugify(input.name);
    if (await (model as typeof Role).exists({ slug })) throw conflict(`This ${label} already exists`);
    await (model as typeof Role).create({ slug, name: input.name });
    invalidateCatalog();
    await log(req, `${label}_create`, label, slug);
    res.status(201).json({ ok: true });
  });
  adminRouter.patch(`/${path}/:id`, async (req, res) => {
    const input = parse(namedInput.partial(), req.body);
    const doc = await (model as typeof Role).findByIdAndUpdate(objectId(req.params.id, label), { $set: input }, { new: true });
    if (!doc) throw notFound(`${label} not found`);
    invalidateCatalog();
    await log(req, `${label}_update`, label, doc.slug, '', input);
    res.json({ ok: true });
  });
}

adminRouter.post('/domains', async (req, res) => {
  const { domain } = parse(z.object({ domain: z.string().trim().toLowerCase().regex(/^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Use a domain like college.edu or *.ac.in') }), req.body);
  if (await InstitutionDomain.exists({ domain })) throw conflict('Domain already listed');
  await InstitutionDomain.create({ domain });
  invalidateCatalog();
  await log(req, 'domain_add', 'domain', domain);
  res.status(201).json({ ok: true });
});
adminRouter.delete('/domains/:id', async (req, res) => {
  const d = await InstitutionDomain.findByIdAndDelete(objectId(req.params.id, 'Domain'));
  if (d) {
    invalidateCatalog();
    await log(req, 'domain_remove', 'domain', d.domain);
  }
  res.json({ ok: true });
});

void TeamMember;
