import type { Types } from 'mongoose';
import { config } from '../config';
import { Notification, User } from '../models';
import { emitToUser } from './realtime';
import { sendEmail } from './email';

export type NotificationType =
  | 'application_received'
  | 'application_accepted'
  | 'application_rejected'
  | 'application_withdrawn'
  | 'post_approved'
  | 'post_rejected'
  | 'post_pending'
  | 'post_closed'
  | 'deadline_reminder'
  | 'collab_request'
  | 'collab_accepted'
  | 'team_invite'
  | 'invite_accepted'
  | 'invite_declined'
  | 'member_removed'
  | 'member_left'
  | 'new_message'
  | 'content_removed'
  | 'account_warning'
  | 'report_update'
  | 'system';

interface NotifyInput {
  userId: Types.ObjectId | string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  /** Send an email too, if the user has email notifications on (FR14). */
  email?: boolean;
}

/** Creates an in-app notification, pushes it in real time, and optionally emails it. */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const n = await Notification.create({
      userId: input.userId,
      type: input.type,
      title: input.title.slice(0, 200),
      body: (input.body ?? '').slice(0, 500),
      link: input.link ?? '',
    });
    emitToUser(String(input.userId), 'notification:new', n.toJSON());
    if (input.email) {
      const user = await User.findById(input.userId).lean();
      if (user && user.status === 'active' && user.notificationPrefs?.email !== false) {
        const sent = await sendEmail({
          to: user.email,
          toName: user.name,
          subject: input.title,
          heading: input.title,
          paragraphs: [input.body ?? ''].filter(Boolean),
          cta: input.link ? { label: 'Open Partner in Project', url: `${config.appUrl}${input.link}` } : undefined,
        });
        if (sent) await Notification.updateOne({ _id: n._id }, { emailedAt: new Date() });
      }
    }
  } catch (e) {
    console.error('[notify] failed', e);
  }
}

export async function notifyMany(userIds: (Types.ObjectId | string)[], input: Omit<NotifyInput, 'userId'>) {
  await Promise.all(userIds.map((userId) => notify({ ...input, userId })));
}
