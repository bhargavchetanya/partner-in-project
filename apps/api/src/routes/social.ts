import { Router } from 'express';
import { z } from 'zod';
import { reportSchema, messageSchema } from '@pip/shared';
import {
  CollaborationRequest, Connection, Block, Profile, User, Report, Conversation, Message, Notification, Opportunity,
} from '../models';
import { parse, badRequest, forbidden, notFound, conflict, objectId } from '../lib/http';
import { requireAuth, me } from '../lib/auth';
import { notify } from '../lib/notify';
import { emitToUser, emitToUsers, getIO } from '../lib/realtime';
import { avatarUrl, pairKey, areConnected, isBlockedBetween, cardsFor } from '../lib/people';

export const connectionsRouter = Router();
export const blocksRouter = Router();
export const reportsRouter = Router();
export const conversationsRouter = Router();
export const notificationsRouter = Router();

// ================================================================ connections (FR12)
connectionsRouter.get('/', requireAuth, async (req, res) => {
  const user = me(req);
  const rows = await Connection.find({ $or: [{ userA: user._id }, { userB: user._id }] }).sort({ createdAt: -1 }).lean();
  const others = rows.map((r) => (String(r.userA) === String(user._id) ? r.userB : r.userA));
  const cards = await cardsFor(others);
  res.json({
    items: rows
      .map((r) => {
        const other = String(r.userA) === String(user._id) ? r.userB : r.userA;
        const card = cards.get(String(other));
        return card && card.status === 'active' ? { ...card, connectedAt: (r as unknown as { createdAt: Date }).createdAt } : null;
      })
      .filter(Boolean),
  });
});

connectionsRouter.get('/requests', requireAuth, async (req, res) => {
  const user = me(req);
  const [incoming, outgoing] = await Promise.all([
    CollaborationRequest.find({ toId: user._id, status: 'pending' }).sort({ createdAt: -1 }).lean(),
    CollaborationRequest.find({ fromId: user._id, status: 'pending' }).sort({ createdAt: -1 }).lean(),
  ]);
  const cards = await cardsFor([...incoming.map((r) => r.fromId), ...outgoing.map((r) => r.toId)]);
  const dto = (r: (typeof incoming)[number], other: unknown) => ({
    id: String(r._id),
    message: r.message,
    createdAt: (r as unknown as { createdAt: Date }).createdAt,
    user: cards.get(String(other)) ?? null,
  });
  res.json({
    incoming: incoming.map((r) => dto(r, r.fromId)).filter((r) => r.user),
    outgoing: outgoing.map((r) => dto(r, r.toId)).filter((r) => r.user),
  });
});

connectionsRouter.post('/requests', requireAuth, async (req, res) => {
  const user = me(req);
  const input = parse(z.object({ userId: z.string(), message: z.string().trim().max(500).optional().default('') }), req.body);
  const toId = objectId(input.userId, 'User');
  if (String(toId) === String(user._id)) throw badRequest("You can't connect with yourself");
  const target = await User.findOne({ _id: toId, status: 'active' }).lean();
  if (!target) throw notFound('User not found');
  if (await isBlockedBetween(user._id, toId)) throw forbidden('You cannot send a request to this user', 'BLOCKED'); // FR15
  if (await areConnected(user._id, toId)) throw conflict("You're already connected");
  const reverse = await CollaborationRequest.findOne({ fromId: toId, toId: user._id, status: 'pending' });
  if (reverse) {
    // They already asked us — accept instead of creating a duplicate.
    reverse.status = 'accepted';
    await reverse.save();
    const [a, b] = pairKey(user._id, toId);
    await Connection.updateOne({ userA: a, userB: b }, { $setOnInsert: { userA: a, userB: b } }, { upsert: true });
    await notify({ userId: toId, type: 'collab_accepted', title: `${user.name} accepted your collaboration request`, link: `/u/${user._id}` });
    res.status(201).json({ status: 'connected' });
    return;
  }
  try {
    await CollaborationRequest.create({ fromId: user._id, toId, message: input.message });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw conflict('Request already sent');
    throw e;
  }
  await notify({
    userId: toId,
    type: 'collab_request',
    title: `${user.name} wants to collaborate with you`,
    body: input.message || 'Open your requests to accept or decline.',
    link: '/connections',
    email: true,
  });
  res.status(201).json({ status: 'pending_out' });
});

async function decide(req: import('express').Request, accept: boolean) {
  const user = me(req);
  const r = await CollaborationRequest.findById(objectId(req.params.id, 'Request'));
  if (!r || String(r.toId) !== String(user._id)) throw notFound('Request not found');
  if (r.status !== 'pending') throw badRequest(`This request is already ${r.status}`);
  r.status = accept ? 'accepted' : 'rejected';
  await r.save();
  if (accept) {
    const [a, b] = pairKey(r.fromId, r.toId);
    await Connection.updateOne({ userA: a, userB: b }, { $setOnInsert: { userA: a, userB: b } }, { upsert: true });
    await notify({ userId: r.fromId, type: 'collab_accepted', title: `${user.name} accepted your collaboration request`, body: 'You can now message each other.', link: `/messages?with=${user._id}`, email: true });
  }
}

connectionsRouter.post('/requests/:id/accept', requireAuth, async (req, res) => {
  await decide(req, true);
  res.json({ ok: true });
});
connectionsRouter.post('/requests/:id/reject', requireAuth, async (req, res) => {
  await decide(req, false);
  res.json({ ok: true });
});
connectionsRouter.post('/requests/:id/cancel', requireAuth, async (req, res) => {
  const user = me(req);
  const r = await CollaborationRequest.findById(objectId(req.params.id, 'Request'));
  if (!r || String(r.fromId) !== String(user._id)) throw notFound('Request not found');
  if (r.status === 'pending') {
    r.status = 'cancelled';
    await r.save();
  }
  res.json({ ok: true });
});
connectionsRouter.delete('/:userId', requireAuth, async (req, res) => {
  const user = me(req);
  const [a, b] = pairKey(user._id, objectId(req.params.userId, 'User'));
  await Connection.deleteOne({ userA: a, userB: b });
  res.json({ ok: true });
});

// ================================================================ blocks (FR15)
blocksRouter.get('/', requireAuth, async (req, res) => {
  const user = me(req);
  const rows = await Block.find({ blockerId: user._id }).lean();
  const cards = await cardsFor(rows.map((r) => r.blockedId));
  res.json({ items: rows.map((r) => cards.get(String(r.blockedId))).filter(Boolean) });
});
blocksRouter.post('/:userId', requireAuth, async (req, res) => {
  const user = me(req);
  const target = objectId(req.params.userId, 'User');
  if (String(target) === String(user._id)) throw badRequest("You can't block yourself");
  await Block.updateOne({ blockerId: user._id, blockedId: target }, { $setOnInsert: { blockerId: user._id, blockedId: target } }, { upsert: true });
  const [a, b] = pairKey(user._id, target);
  await Connection.deleteOne({ userA: a, userB: b });
  await CollaborationRequest.updateMany(
    { status: 'pending', $or: [{ fromId: user._id, toId: target }, { fromId: target, toId: user._id }] },
    { $set: { status: 'cancelled' } },
  );
  res.json({ ok: true });
});
blocksRouter.delete('/:userId', requireAuth, async (req, res) => {
  const user = me(req);
  await Block.deleteOne({ blockerId: user._id, blockedId: objectId(req.params.userId, 'User') });
  res.json({ ok: true });
});

// ================================================================ reports (FR15)
reportsRouter.post('/', requireAuth, async (req, res) => {
  const user = me(req);
  const input = parse(reportSchema, req.body);
  const targetId = objectId(input.targetId, 'Target');
  let ownerId: unknown = null;
  if (input.targetType === 'user') {
    if (!(await User.exists({ _id: targetId }))) throw notFound('User not found');
    if (String(targetId) === String(user._id)) throw badRequest("You can't report yourself");
    ownerId = targetId;
  } else if (input.targetType === 'opportunity') {
    const o = await Opportunity.findById(targetId).lean();
    if (!o) throw notFound('Post not found');
    ownerId = o.leaderId;
  } else {
    const m = await Message.findById(targetId).lean();
    if (!m) throw notFound('Message not found');
    const conv = await Conversation.exists({ _id: m.conversationId, participants: user._id });
    if (!conv) throw forbidden('You can only report messages you can see');
    ownerId = m.senderId;
  }
  const dup = await Report.findOne({ reporterId: user._id, targetType: input.targetType, targetId, status: 'open' });
  if (dup) throw conflict("You've already reported this. Our admins will review it.");
  await Report.create({ reporterId: user._id, targetType: input.targetType, targetId, targetOwnerId: ownerId, reason: input.reason, details: input.details });
  const admins = await User.find({ role: 'admin', status: 'active' }, { _id: 1 }).lean();
  for (const a of admins) await notify({ userId: a._id, type: 'system', title: `New report: ${input.targetType} (${input.reason.replace('_', ' ')})`, link: '/admin/reports' });
  res.status(201).json({ ok: true });
});

// ================================================================ messaging (FR13)
async function conversationDto(conv: { _id: unknown; type: string; participants: unknown[]; title?: string; opportunityId?: unknown; lastMessageAt: Date; lastMessagePreview?: string }, viewerId: string) {
  const others = conv.participants.map(String).filter((p) => p !== viewerId);
  const profiles = await Profile.find({ userId: { $in: others } }, { userId: 1, name: 1, avatarVersion: 1, externalAvatarUrl: 1, headline: 1 }).lean();
  const unread = await Message.countDocuments({ conversationId: conv._id, senderId: { $ne: viewerId }, readBy: { $ne: viewerId } });
  return {
    id: String(conv._id),
    type: conv.type,
    title: conv.type === 'team' ? conv.title : profiles[0]?.name ?? 'Conversation',
    opportunityId: conv.opportunityId ? String(conv.opportunityId) : null,
    participants: profiles.map((p) => ({ id: String(p.userId), name: p.name, avatarUrl: avatarUrl(p), headline: p.headline })),
    lastMessageAt: conv.lastMessageAt,
    lastMessagePreview: conv.lastMessagePreview ?? '',
    unread,
  };
}

conversationsRouter.get('/', requireAuth, async (req, res) => {
  const user = me(req);
  const convs = await Conversation.find({ participants: user._id }).sort({ lastMessageAt: -1 }).limit(100).lean();
  const items = await Promise.all(convs.map((c) => conversationDto(c, String(user._id))));
  res.json({ items });
});

conversationsRouter.get('/unread-count', requireAuth, async (req, res) => {
  const user = me(req);
  const convs = await Conversation.find({ participants: user._id }, { _id: 1 }).lean();
  const n = await Message.countDocuments({ conversationId: { $in: convs.map((c) => c._id) }, senderId: { $ne: user._id }, readBy: { $ne: user._id } });
  res.json({ count: n });
});

/** Opens (or creates) a direct conversation. Allowed between connections or teammates. */
conversationsRouter.post('/direct', requireAuth, async (req, res) => {
  const user = me(req);
  const { userId } = parse(z.object({ userId: z.string() }), req.body);
  const other = objectId(userId, 'User');
  if (String(other) === String(user._id)) throw badRequest("You can't message yourself");
  if (!(await User.exists({ _id: other, status: 'active' }))) throw notFound('User not found');
  if (await isBlockedBetween(user._id, other)) throw forbidden('You cannot message this user', 'BLOCKED');
  const connected = await areConnected(user._id, other);
  const teammates = await Conversation.exists({ type: 'team', participants: { $all: [user._id, other] } });
  if (!connected && !teammates) throw forbidden('Connect with this student first to send messages', 'NOT_CONNECTED');
  const [a, b] = pairKey(user._id, other);
  const conv = await Conversation.findOneAndUpdate(
    { directKey: `${a}:${b}` },
    { $setOnInsert: { type: 'direct', directKey: `${a}:${b}`, participants: [a, b], lastMessageAt: new Date() } },
    { upsert: true, new: true },
  ).lean();
  res.json(await conversationDto(conv!, String(user._id)));
});

async function loadConversation(id: string, userId: unknown) {
  const conv = await Conversation.findOne({ _id: objectId(id, 'Conversation'), participants: userId }).lean();
  if (!conv) throw notFound('Conversation not found');
  return conv;
}

conversationsRouter.get('/:id', requireAuth, async (req, res) => {
  const user = me(req);
  const conv = await loadConversation(String(req.params.id), user._id);
  res.json(await conversationDto(conv, String(user._id)));
});

conversationsRouter.get('/:id/messages', requireAuth, async (req, res) => {
  const user = me(req);
  const conv = await loadConversation(String(req.params.id), user._id);
  const before = typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before)) ? new Date(req.query.before) : null;
  const msgs = await Message.find({ conversationId: conv._id, ...(before ? { createdAt: { $lt: before } } : {}) })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json({
    items: msgs.reverse().map((m) => messageDto(m)),
    hasMore: msgs.length === 50,
  });
});

function messageDto(m: { _id: unknown; conversationId: unknown; senderId: unknown; body: string; readBy: unknown[]; removed?: boolean; createdAt?: Date }) {
  return {
    id: String(m._id),
    conversationId: String(m.conversationId),
    senderId: String(m.senderId),
    body: m.removed ? 'This message was removed by a moderator.' : m.body,
    removed: !!m.removed,
    readBy: m.readBy.map(String),
    createdAt: m.createdAt,
  };
}

conversationsRouter.post('/:id/messages', requireAuth, async (req, res) => {
  const user = me(req);
  const conv = await loadConversation(String(req.params.id), user._id);
  const { body } = parse(messageSchema, req.body);
  const others = conv.participants.map(String).filter((p) => p !== String(user._id));
  if (conv.type === 'direct' && others[0] && (await isBlockedBetween(user._id, others[0]))) {
    throw forbidden('You cannot message this user', 'BLOCKED'); // FR15
  }
  const msg = await Message.create({ conversationId: conv._id, senderId: user._id, body, readBy: [user._id] });
  await Conversation.updateOne({ _id: conv._id }, { $set: { lastMessageAt: new Date(), lastMessagePreview: `${user.name.split(' ')[0]}: ${body.slice(0, 80)}` } });
  const dto = messageDto(msg.toObject());
  // Real-time delivery (QR8): to everyone in the conversation room + each participant's personal room
  getIO()?.to(`conv:${conv._id}`).emit('message:new', dto);
  emitToUsers(others, 'conversation:updated', { conversationId: String(conv._id) });
  emitToUser(user._id, 'conversation:updated', { conversationId: String(conv._id) });
  // In-app notification for recipients (no email for chat, to avoid spam)
  const recent = new Date(Date.now() - 10 * 60 * 1000);
  for (const o of others) {
    const already = await Notification.exists({ userId: o, type: 'new_message', link: `/messages/${conv._id}`, readAt: null, createdAt: { $gt: recent } });
    if (!already) {
      await notify({
        userId: o,
        type: 'new_message',
        title: conv.type === 'team' ? `New message in "${conv.title}"` : `New message from ${user.name}`,
        body: body.slice(0, 140),
        link: `/messages/${conv._id}`,
      });
    }
  }
  res.status(201).json(dto);
});

conversationsRouter.post('/:id/read', requireAuth, async (req, res) => {
  const user = me(req);
  const conv = await loadConversation(String(req.params.id), user._id);
  await Message.updateMany({ conversationId: conv._id, readBy: { $ne: user._id } }, { $addToSet: { readBy: user._id } });
  await Notification.updateMany({ userId: user._id, type: 'new_message', link: `/messages/${conv._id}`, readAt: null }, { $set: { readAt: new Date() } });
  getIO()?.to(`conv:${conv._id}`).emit('conversation:read', { conversationId: String(conv._id), userId: String(user._id) });
  res.json({ ok: true });
});

// ================================================================ notifications (FR14)
notificationsRouter.get('/', requireAuth, async (req, res) => {
  const user = me(req);
  const unreadOnly = req.query.unread === '1';
  const items = await Notification.find({ userId: user._id, ...(unreadOnly ? { readAt: null } : {}) }).sort({ createdAt: -1 }).limit(100).lean();
  const unread = await Notification.countDocuments({ userId: user._id, readAt: null });
  res.json({ items: items.map((n) => ({ ...n, id: String(n._id) })), unread });
});
notificationsRouter.get('/unread-count', requireAuth, async (req, res) => {
  const user = me(req);
  res.json({ count: await Notification.countDocuments({ userId: user._id, readAt: null }) });
});
notificationsRouter.post('/read-all', requireAuth, async (req, res) => {
  const user = me(req);
  await Notification.updateMany({ userId: user._id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ ok: true });
});
notificationsRouter.post('/:id/read', requireAuth, async (req, res) => {
  const user = me(req);
  await Notification.updateOne({ _id: objectId(req.params.id, 'Notification'), userId: user._id }, { $set: { readAt: new Date() } });
  res.json({ ok: true });
});
notificationsRouter.delete('/:id', requireAuth, async (req, res) => {
  const user = me(req);
  await Notification.deleteOne({ _id: objectId(req.params.id, 'Notification'), userId: user._id });
  res.json({ ok: true });
});
