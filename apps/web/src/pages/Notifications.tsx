import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Bell, CheckCheck, CheckCircle2, ClipboardList, Mail, MessageSquare, ShieldAlert, Trash2, UserPlus, Users, XCircle } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import type { NotificationDto } from '@/lib/types';
import { cn, formatDate, timeAgo } from '@/lib/utils';
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, Tabs } from '@/components/ui';

const icons: Record<string, { icon: typeof Bell; tone: string }> = {
  application_received: { icon: ClipboardList, tone: 'bg-primary-soft text-primary' },
  application_accepted: { icon: CheckCircle2, tone: 'bg-accent-soft text-accent' },
  application_rejected: { icon: XCircle, tone: 'bg-danger-soft text-danger' },
  application_withdrawn: { icon: XCircle, tone: 'bg-surface-3 text-muted' },
  post_approved: { icon: CheckCircle2, tone: 'bg-accent-soft text-accent' },
  post_rejected: { icon: XCircle, tone: 'bg-danger-soft text-danger' },
  post_pending: { icon: ShieldAlert, tone: 'bg-warn-soft text-warn' },
  post_closed: { icon: Users, tone: 'bg-accent-soft text-accent' },
  deadline_reminder: { icon: AlarmClock, tone: 'bg-warn-soft text-warn' },
  collab_request: { icon: UserPlus, tone: 'bg-primary-soft text-primary' },
  collab_accepted: { icon: UserPlus, tone: 'bg-accent-soft text-accent' },
  team_invite: { icon: Mail, tone: 'bg-primary-soft text-primary' },
  invite_accepted: { icon: Users, tone: 'bg-accent-soft text-accent' },
  new_message: { icon: MessageSquare, tone: 'bg-primary-soft text-primary' },
  content_removed: { icon: ShieldAlert, tone: 'bg-danger-soft text-danger' },
  account_warning: { icon: ShieldAlert, tone: 'bg-danger-soft text-danger' },
};

export default function Notifications() {
  useDocumentTitle('Notifications');
  const qc = useQueryClient();
  const nav = useNavigate();
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const q = useQuery({ queryKey: ['notifications', 'list'], queryFn: () => api.get<{ items: NotificationDto[]; unread: number }>('/notifications') });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: invalidate });
  const read = useMutation({ mutationFn: (id: string) => api.post(`/notifications/${id}/read`), onSuccess: invalidate });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/notifications/${id}`), onSuccess: invalidate });
  const items = (q.data?.items ?? []).filter((n) => tab === 'all' || !n.readAt);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" subtitle="Applications, decisions, invitations, messages and deadline reminders." actions={<Button variant="secondary" size="sm" icon={<CheckCheck className="size-4" />} disabled={!q.data?.unread} loading={readAll.isPending} onClick={() => readAll.mutate()}>Mark all as read</Button>} />
      <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: q.data?.unread }]} />
      {q.isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Bell />} title={tab === 'unread' ? "You're all caught up" : 'No notifications yet'} body="We'll let you know when something needs your attention." />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {items.map((n) => {
            const meta = icons[n.type] ?? { icon: Bell, tone: 'bg-surface-3 text-fg-2' };
            const Icon = meta.icon;
            return (
              <div key={n.id} className={cn('group flex gap-3.5 px-4 py-3.5 transition hover:bg-surface-2/60', !n.readAt && 'bg-primary-soft/40')}>
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', meta.tone)}><Icon className="size-4.5" /></span>
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    if (!n.readAt) read.mutate(n.id);
                    if (n.link) nav(n.link);
                  }}
                >
                  <div className={cn('text-[14px]', n.readAt ? 'text-fg-2' : 'font-semibold text-fg')}>{n.title}</div>
                  {n.body && <div className="mt-0.5 line-clamp-2 text-[13px] text-muted">{n.body}</div>}
                  <div className="mt-1 text-[11.5px] text-muted" title={formatDate(n.createdAt, true)}>{timeAgo(n.createdAt)}</div>
                </button>
                <div className="flex items-start gap-1 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                  {!n.readAt && <button onClick={() => read.mutate(n.id)} className="rounded-lg p-1.5 text-muted hover:bg-surface-3 hover:text-fg" aria-label="Mark as read"><CheckCheck className="size-4" /></button>}
                  <button onClick={() => del.mutate(n.id)} className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger" aria-label="Delete notification"><Trash2 className="size-4" /></button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
