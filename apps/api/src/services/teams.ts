import mongoose, { type Types } from 'mongoose';
import { analyzeSkillGap } from '@pip/shared';
import {
  Opportunity, TeamMember, Application, Conversation, Profile, User, TeamInvitation, type OpportunityDoc,
} from '../models';
import { AppError, badRequest, forbidden, notFound } from '../lib/http';
import { getCatalog, nameLookup } from '../lib/catalog';
import { notify, notifyMany } from '../lib/notify';
import { emitToUsers } from '../lib/realtime';
import {
  avatarUrl, candidateFromProfile, requirementFromOpportunity, scoreWith, blockedIdsFor, type ProfileLike,
} from '../lib/people';

type Id = Types.ObjectId | string;

/** FR18: posts whose deadline has passed become "Expired" (checked on read and by the hourly cron). */
export async function expireDuePosts(): Promise<number> {
  const due = await Opportunity.find({ status: { $in: ['open', 'closed'] }, deadline: { $lt: new Date() } }, { _id: 1, leaderId: 1, title: 1, status: 1 }).lean();
  if (!due.length) return 0;
  const ids = due.filter((d) => d.status === 'open').map((d) => d._id);
  if (ids.length) {
    await Opportunity.updateMany({ _id: { $in: ids }, status: 'open' }, { $set: { status: 'expired' } });
    await Application.updateMany(
      { opportunityId: { $in: ids }, status: 'pending' },
      { $set: { status: 'rejected', decidedAt: new Date() } },
    );
  }
  return ids.length;
}

export async function refreshStatus(opp: OpportunityDoc): Promise<OpportunityDoc> {
  if (opp.status === 'open' && opp.deadline < new Date()) {
    opp.status = 'expired';
    await opp.save();
    await Application.updateMany({ opportunityId: opp._id, status: 'pending' }, { $set: { status: 'rejected', decidedAt: new Date() } });
  }
  return opp;
}

export async function loadOpportunity(id: Id): Promise<OpportunityDoc> {
  const opp = await Opportunity.findById(id);
  if (!opp || opp.hiddenByBan) throw notFound('Opportunity not found');
  return refreshStatus(opp);
}

export function spotsLeft(o: { teamSize: number; memberCount: number }): number {
  return Math.max(0, o.teamSize - 1 - o.memberCount);
}

export async function ensureTeamConversation(opp: OpportunityDoc): Promise<Types.ObjectId> {
  if (opp.conversationId) return opp.conversationId as Types.ObjectId;
  const members = await TeamMember.find({ opportunityId: opp._id }, { userId: 1 }).lean();
  const conv = await Conversation.findOneAndUpdate(
    { opportunityId: opp._id },
    {
      $setOnInsert: { type: 'team', opportunityId: opp._id, lastMessageAt: new Date() },
      $set: { title: opp.title },
      $addToSet: { participants: { $each: [opp.leaderId, ...members.map((m) => m.userId)] } },
    },
    { upsert: true, new: true },
  );
  opp.conversationId = conv._id;
  await opp.save();
  return conv._id;
}

async function addToConversation(opp: OpportunityDoc, userId: Id) {
  const convId = await ensureTeamConversation(opp);
  await Conversation.updateOne({ _id: convId }, { $addToSet: { participants: userId } });
}

async function removeFromConversation(opp: OpportunityDoc, userId: Id) {
  if (opp.conversationId) await Conversation.updateOne({ _id: opp.conversationId }, { $pull: { participants: userId } });
}

/**
 * Adds a member to a team atomically (transaction): checks the role still has a slot and
 * the team is not full, increments counters, closes the post when the team becomes full.
 */
async function addMemberTx(oppId: Id, userId: Id, role: string, onCommit: (session: mongoose.ClientSession) => Promise<void>) {
  const session = await mongoose.startSession();
  let becameFull = false;
  try {
    await session.withTransaction(async () => {
      const opp = await Opportunity.findById(oppId).session(session);
      if (!opp) throw notFound('Opportunity not found');
      if (opp.status !== 'open') throw badRequest('This team is no longer accepting members', 'NOT_OPEN');
      if (opp.deadline < new Date()) throw badRequest('The deadline for this team has passed', 'EXPIRED');
      if (await TeamMember.exists({ opportunityId: opp._id, userId }).session(session)) throw badRequest('Already a member of this team', 'ALREADY_MEMBER');
      const slot = opp.openRoles.find((r) => r.role === role);
      if (!slot) throw badRequest('That role is not open in this team', 'ROLE_NOT_OPEN');
      if (slot.filled >= slot.slots) throw badRequest('That role has already been filled', 'ROLE_FULL');
      if (opp.memberCount >= opp.teamSize - 1) throw badRequest('This team is already full', 'TEAM_FULL');
      slot.filled += 1;
      opp.memberCount += 1;
      const allFilled = opp.openRoles.every((r) => r.filled >= r.slots);
      if (opp.memberCount >= opp.teamSize - 1 || allFilled) {
        opp.status = 'closed'; // FR18: team is full
        becameFull = true;
      }
      opp.markModified('openRoles');
      await opp.save({ session });
      await TeamMember.create([{ opportunityId: opp._id, userId, role }], { session });
      await onCommit(session);
    });
  } finally {
    await session.endSession();
  }
  const opp = (await Opportunity.findById(oppId))!;
  await addToConversation(opp, userId);
  if (becameFull) {
    const pending = await Application.find({ opportunityId: opp._id, status: 'pending' }, { applicantId: 1 }).lean();
    await Application.updateMany({ opportunityId: opp._id, status: 'pending' }, { $set: { status: 'rejected', decidedAt: new Date() } });
    await TeamInvitation.updateMany({ opportunityId: opp._id, status: 'pending' }, { $set: { status: 'cancelled' } });
    await notifyMany(
      pending.map((p) => p.applicantId),
      { type: 'application_rejected', title: `"${opp.title}" is now full`, body: 'The team filled all its positions, so your application was closed.', link: '/applications' },
    );
    await notify({ userId: opp.leaderId, type: 'post_closed', title: `Your team "${opp.title}" is full`, body: 'The post was closed automatically because all positions are filled.', link: `/opportunities/${opp._id}/team` });
  }
  return { opp, becameFull };
}

export async function acceptApplication(applicationId: Id, leaderId: Id) {
  const app = await Application.findById(applicationId);
  if (!app) throw notFound('Application not found');
  const opp = await loadOpportunity(app.opportunityId);
  if (String(opp.leaderId) !== String(leaderId)) throw forbidden('Only the team leader can review applications');
  if (app.status !== 'pending') throw badRequest(`This application is already ${app.status}`, 'NOT_PENDING');
  await addMemberTx(opp._id, app.applicantId, app.role, async (session) => {
    const res = await Application.updateOne({ _id: app._id, status: 'pending' }, { $set: { status: 'accepted', decidedAt: new Date() } }, { session });
    if (res.modifiedCount !== 1) throw new AppError(409, 'This application was already decided', 'NOT_PENDING');
  });
  const c = await getCatalog();
  await notify({
    userId: app.applicantId,
    type: 'application_accepted',
    title: `You're in! Welcome to "${opp.title}"`,
    body: `Your application for the ${nameLookup(c).role(app.role)} role was accepted. Say hi in the team chat.`,
    link: `/opportunities/${opp._id}/team`,
    email: true,
  });
  emitToUsers([app.applicantId, opp.leaderId], 'team:updated', { opportunityId: String(opp._id) });
}

export async function acceptInvitation(invitationId: Id, userId: Id) {
  const inv = await TeamInvitation.findById(invitationId);
  if (!inv || String(inv.inviteeId) !== String(userId)) throw notFound('Invitation not found');
  if (inv.status !== 'pending') throw badRequest(`This invitation is already ${inv.status}`, 'NOT_PENDING');
  const opp = await loadOpportunity(inv.opportunityId);
  await addMemberTx(opp._id, userId, inv.role, async (session) => {
    const res = await TeamInvitation.updateOne({ _id: inv._id, status: 'pending' }, { $set: { status: 'accepted' } }, { session });
    if (res.modifiedCount !== 1) throw new AppError(409, 'This invitation was already answered', 'NOT_PENDING');
    await Application.updateOne({ opportunityId: opp._id, applicantId: userId, status: 'pending' }, { $set: { status: 'accepted', decidedAt: new Date() } }, { session });
  });
  const profile = await Profile.findOne({ userId }).lean();
  await notify({
    userId: opp.leaderId,
    type: 'invite_accepted',
    title: `${profile?.name ?? 'Someone'} joined "${opp.title}"`,
    body: 'Your team invitation was accepted.',
    link: `/opportunities/${opp._id}/team`,
    email: true,
  });
  emitToUsers([userId, opp.leaderId], 'team:updated', { opportunityId: String(opp._id) });
}

/** FR18: remove a member — the open position count increases by one. */
export async function removeMember(oppId: Id, memberId: Id, actor: { id: Id; isLeaderAction: boolean }) {
  const session = await mongoose.startSession();
  let opp: OpportunityDoc | null = null;
  let role = '';
  try {
    await session.withTransaction(async () => {
      opp = await Opportunity.findById(oppId).session(session);
      if (!opp) throw notFound('Opportunity not found');
      if (String(opp.leaderId) === String(memberId)) throw badRequest('The team leader cannot be removed', 'LEADER');
      const tm = await TeamMember.findOne({ opportunityId: opp._id, userId: memberId }).session(session);
      if (!tm) throw notFound('That user is not a member of this team');
      role = tm.role;
      await tm.deleteOne({ session });
      const slot = opp.openRoles.find((r) => r.role === tm.role);
      if (slot && slot.filled > 0) slot.filled -= 1;
      opp.memberCount = Math.max(0, opp.memberCount - 1);
      if (opp.status === 'closed' && opp.deadline > new Date()) opp.status = 'open';
      opp.markModified('openRoles');
      await opp.save({ session });
    });
  } finally {
    await session.endSession();
  }
  const o = opp as unknown as OpportunityDoc;
  await removeFromConversation(o, memberId);
  void role;
  if (actor.isLeaderAction) {
    await notify({ userId: memberId, type: 'member_removed', title: `You were removed from "${o.title}"`, body: 'The team leader removed you from the team.', link: '/teams' });
  } else {
    const p = await Profile.findOne({ userId: memberId }).lean();
    await notify({ userId: o.leaderId, type: 'member_left', title: `${p?.name ?? 'A member'} left "${o.title}"`, body: 'A position is open again.', link: `/opportunities/${o._id}/team` });
  }
  emitToUsers([memberId, o.leaderId], 'team:updated', { opportunityId: String(o._id) });
}

export async function teamMembers(oppId: Id) {
  const rows = await TeamMember.find({ opportunityId: oppId }).sort({ isLeader: -1, createdAt: 1 }).lean();
  const profiles = await Profile.find({ userId: { $in: rows.map((r) => r.userId) } }).lean();
  const users = await User.find({ _id: { $in: rows.map((r) => r.userId) } }, { institutionVerified: 1 }).lean();
  const pm = new Map(profiles.map((p) => [String(p.userId), p]));
  const um = new Map(users.map((u) => [String(u._id), u]));
  return rows
    .map((r) => {
      const p = pm.get(String(r.userId));
      if (!p) return null;
      return {
        userId: String(r.userId),
        name: p.name,
        headline: p.headline,
        college: p.college,
        avatarUrl: avatarUrl(p),
        role: r.role,
        isLeader: r.isLeader,
        skills: p.skillSlugs,
        institutionVerified: !!um.get(String(r.userId))?.institutionVerified,
        joinedAt: (r as unknown as { createdAt: Date }).createdAt,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

/** FR19: covered vs missing skills + suggested students ranked by match score. */
export async function skillGap(opp: OpportunityDoc, limit = 5) {
  const members = await teamMembers(opp._id);
  const gap = analyzeSkillGap(
    opp.requiredSkills,
    members.map((m) => ({ userId: m.userId, name: m.name, skills: m.skills })),
  );
  const c = await getCatalog();
  let suggestions: unknown[] = [];
  let totalCandidates = 0;
  if (!gap.complete) {
    const exclude = new Set([...members.map((m) => m.userId), ...(await blockedIdsFor(opp.leaderId))]);
    const candidates = await Profile.find({ skillSlugs: { $in: gap.missing } }).limit(3000).lean();
    const activeUsers = await User.find({ _id: { $in: candidates.map((p) => p.userId) }, status: 'active' }, { _id: 1, institutionVerified: 1 }).lean();
    const activeSet = new Map(activeUsers.map((u) => [String(u._id), u]));
    const applicants = await Application.find({ opportunityId: opp._id, status: 'pending' }, { applicantId: 1 }).lean();
    const invited = await TeamInvitation.find({ opportunityId: opp._id, status: 'pending' }, { inviteeId: 1 }).lean();
    const applicantSet = new Set(applicants.map((a) => String(a.applicantId)));
    const invitedSet = new Set(invited.map((a) => String(a.inviteeId)));
    const req = requirementFromOpportunity(opp, undefined, gap.missing);
    const scored = candidates
      .filter((p) => !exclude.has(String(p.userId)) && activeSet.has(String(p.userId)))
      .map((p) => {
        const m = scoreWith(c, req, candidateFromProfile(p as ProfileLike));
        const full = scoreWith(c, requirementFromOpportunity(opp), candidateFromProfile(p as ProfileLike));
        return {
          userId: String(p.userId),
          name: p.name,
          headline: p.headline,
          college: p.college,
          year: p.year,
          avatarUrl: avatarUrl(p),
          roles: p.preferredRoles,
          availabilityHours: p.availabilityHours,
          institutionVerified: !!activeSet.get(String(p.userId))?.institutionVerified,
          fillsSkills: m.matchedSkills,
          gapScore: m.score,
          overallScore: full.score,
          match: full,
          applied: applicantSet.has(String(p.userId)),
          invited: invitedSet.has(String(p.userId)),
        };
      })
      .sort((a, b) => b.gapScore - a.gapScore || b.overallScore - a.overallScore || b.fillsSkills.length - a.fillsSkills.length);
    totalCandidates = scored.length;
    suggestions = scored.slice(0, limit);
  }
  const n = nameLookup(c);
  return {
    ...gap,
    requiredNames: Object.fromEntries(gap.required.map((s) => [s, n.skill(s)])),
    members,
    suggestions,
    totalCandidates,
  };
}
