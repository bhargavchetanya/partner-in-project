import { Router } from 'express';
import mongoose from 'mongoose';
import { config } from '../config';
import { Opportunity, TeamMember } from '../models';
import { forbidden } from '../lib/http';
import { safeEqual } from '../lib/crypto';
import { notifyMany } from '../lib/notify';
import { expireDuePosts } from '../services/teams';

export const internalRouter = Router();

/** FR14: deadline within the next 48 hours -> remind the leader and members (once). */
export async function sendDeadlineReminders(): Promise<number> {
  const soon = new Date(Date.now() + 48 * 3600 * 1000);
  const due = await Opportunity.find({ status: { $in: ['open', 'closed'] }, deadline: { $gt: new Date(), $lte: soon }, reminderSentAt: null });
  for (const o of due) {
    const members = await TeamMember.find({ opportunityId: o._id }, { userId: 1 }).lean();
    const hours = Math.max(1, Math.round((o.deadline.getTime() - Date.now()) / 3600_000));
    await notifyMany(members.map((m) => m.userId), {
      type: 'deadline_reminder',
      title: `⏰ "${o.title}" deadline in ${hours} hour${hours === 1 ? '' : 's'}`,
      body: `${o.eventName} — deadline ${o.deadline.toUTCString()}.`,
      link: `/opportunities/${o._id}/team`,
      email: true,
    });
    o.reminderSentAt = new Date();
    await o.save();
  }
  return due.length;
}

/** Hourly job, triggered by GitHub Actions (free) — see .github/workflows/cron.yml. */
internalRouter.post('/cron', async (req, res) => {
  const secret = String(req.headers['x-cron-secret'] ?? '');
  if (!config.cronSecret || !safeEqual(secret, config.cronSecret)) throw forbidden('Invalid cron secret');
  const expired = await expireDuePosts();
  const reminders = await sendDeadlineReminders();
  res.json({ ok: true, expired, reminders, at: new Date().toISOString() });
});

internalRouter.get('/health', async (_req, res) => {
  const db = mongoose.connection.readyState === 1 ? 'up' : 'down';
  res.status(db === 'up' ? 200 : 503).json({ status: db === 'up' ? 'ok' : 'degraded', db, time: new Date().toISOString() });
});
