import { Router } from 'express';
import { Application, Opportunity, Profile, TeamInvitation } from '../models';
import { badRequest, forbidden, notFound, objectId } from '../lib/http';
import { requireAuth, me } from '../lib/auth';
import { getCatalog, nameLookup } from '../lib/catalog';
import { notify } from '../lib/notify';
import { avatarUrl } from '../lib/people';
import { acceptApplication, acceptInvitation, loadOpportunity, expireDuePosts } from '../services/teams';

export const applicationsRouter = Router();
export const invitationsRouter = Router();

/** FR11: my applications with status. */
applicationsRouter.get('/mine', requireAuth, async (req, res) => {
  const user = me(req);
  await expireDuePosts();
  const apps = await Application.find({ applicantId: user._id }).sort({ createdAt: -1 }).lean();
  const opps = await Opportunity.find({ _id: { $in: apps.map((a) => a.opportunityId) } }).lean();
  const om = new Map(opps.map((o) => [String(o._id), o]));
  const leaders = await Profile.find({ userId: { $in: opps.map((o) => o.leaderId) } }).lean();
  const lm = new Map(leaders.map((p) => [String(p.userId), p]));
  res.json({
    items: apps
      .map((a) => {
        const o = om.get(String(a.opportunityId));
        if (!o || o.status === 'removed' || o.hiddenByBan) return null;
        const l = lm.get(String(o.leaderId));
        return {
          id: String(a._id),
          status: a.status,
          role: a.role,
          message: a.message,
          matchScore: a.matchScore,
          createdAt: (a as unknown as { createdAt: Date }).createdAt,
          decidedAt: a.decidedAt,
          opportunity: {
            id: String(o._id),
            title: o.title,
            eventName: o.eventName,
            deadline: o.deadline,
            status: o.status,
            leader: l ? { id: String(l.userId), name: l.name, avatarUrl: avatarUrl(l) } : null,
          },
        };
      })
      .filter(Boolean),
  });
});

applicationsRouter.post('/:id/withdraw', requireAuth, async (req, res) => {
  const user = me(req);
  const app = await Application.findById(objectId(req.params.id, 'Application'));
  if (!app || String(app.applicantId) !== String(user._id)) throw notFound('Application not found');
  if (app.status !== 'pending') throw badRequest('Only pending applications can be withdrawn');
  app.status = 'withdrawn';
  app.decidedAt = new Date();
  await app.save();
  const opp = await Opportunity.findById(app.opportunityId).lean();
  if (opp) {
    await notify({ userId: opp.leaderId, type: 'application_withdrawn', title: `${user.name} withdrew their application`, body: `For "${opp.title}"`, link: `/opportunities/${opp._id}/applications` });
  }
  res.json({ ok: true });
});

applicationsRouter.post('/:id/accept', requireAuth, async (req, res) => {
  const user = me(req);
  await acceptApplication(objectId(req.params.id, 'Application'), user._id);
  res.json({ ok: true });
});

applicationsRouter.post('/:id/reject', requireAuth, async (req, res) => {
  const user = me(req);
  const app = await Application.findById(objectId(req.params.id, 'Application'));
  if (!app) throw notFound('Application not found');
  const opp = await loadOpportunity(app.opportunityId);
  if (String(opp.leaderId) !== String(user._id)) throw forbidden('Only the team leader can review applications');
  if (app.status !== 'pending') throw badRequest(`This application is already ${app.status}`);
  app.status = 'rejected';
  app.decidedAt = new Date();
  await app.save();
  const c = await getCatalog();
  await notify({
    userId: app.applicantId,
    type: 'application_rejected',
    title: `Update on your application to "${opp.title}"`,
    body: `The team decided not to move forward with your application for ${nameLookup(c).role(app.role)}. Keep exploring — there are other teams looking for you.`,
    link: '/applications',
    email: true,
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- invitations
invitationsRouter.get('/mine', requireAuth, async (req, res) => {
  const user = me(req);
  const invs = await TeamInvitation.find({ inviteeId: user._id }).sort({ createdAt: -1 }).limit(100).lean();
  const opps = await Opportunity.find({ _id: { $in: invs.map((i) => i.opportunityId) } }).lean();
  const inviters = await Profile.find({ userId: { $in: invs.map((i) => i.inviterId) } }).lean();
  res.json({
    items: invs
      .map((i) => {
        const o = opps.find((x) => String(x._id) === String(i.opportunityId));
        const p = inviters.find((x) => String(x.userId) === String(i.inviterId));
        if (!o || o.status === 'removed') return null;
        return {
          id: String(i._id),
          status: i.status,
          role: i.role,
          message: i.message,
          createdAt: (i as unknown as { createdAt: Date }).createdAt,
          opportunity: { id: String(o._id), title: o.title, eventName: o.eventName, deadline: o.deadline, status: o.status },
          inviter: p ? { id: String(p.userId), name: p.name, avatarUrl: avatarUrl(p) } : null,
        };
      })
      .filter(Boolean),
  });
});

invitationsRouter.post('/:id/accept', requireAuth, async (req, res) => {
  const user = me(req);
  if (!user.emailVerified) throw forbidden('Please verify your email address first', 'EMAIL_NOT_VERIFIED');
  await acceptInvitation(objectId(req.params.id, 'Invitation'), user._id);
  res.json({ ok: true });
});

invitationsRouter.post('/:id/decline', requireAuth, async (req, res) => {
  const user = me(req);
  const inv = await TeamInvitation.findById(objectId(req.params.id, 'Invitation'));
  if (!inv || String(inv.inviteeId) !== String(user._id)) throw notFound('Invitation not found');
  if (inv.status !== 'pending') throw badRequest(`This invitation is already ${inv.status}`);
  inv.status = 'declined';
  await inv.save();
  const opp = await Opportunity.findById(inv.opportunityId).lean();
  if (opp) await notify({ userId: inv.inviterId, type: 'invite_declined', title: `${user.name} declined your invitation`, body: `For "${opp.title}"`, link: `/opportunities/${opp._id}/team` });
  res.json({ ok: true });
});

/** Leader cancels an invitation. */
invitationsRouter.delete('/:id', requireAuth, async (req, res) => {
  const user = me(req);
  const inv = await TeamInvitation.findById(objectId(req.params.id, 'Invitation'));
  if (!inv || String(inv.inviterId) !== String(user._id)) throw notFound('Invitation not found');
  if (inv.status === 'pending') {
    inv.status = 'cancelled';
    await inv.save();
  }
  res.json({ ok: true });
});
