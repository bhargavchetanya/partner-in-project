import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, MessageSquare, Users, X, Ban } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import type { PersonCard } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import { Avatar, Button, ButtonLink, Card, EmptyState, ErrorState, PageHeader, Skeleton, Tabs } from '@/components/ui';
import { SkillChips } from '@/components/match';

interface Req { id: string; message: string; createdAt: string; user: PersonCard }

export default function Connections() {
  useDocumentTitle('Connections');
  const qc = useQueryClient();
  const nav = useNavigate();
  const [tab, setTab] = useState<'connections' | 'incoming' | 'outgoing' | 'blocked'>('connections');
  const conns = useQuery({ queryKey: ['connections', 'list'], queryFn: () => api.get<{ items: (PersonCard & { connectedAt: string })[] }>('/connections') });
  const reqs = useQuery({ queryKey: ['connections', 'requests'], queryFn: () => api.get<{ incoming: Req[]; outgoing: Req[] }>('/connections/requests') });
  const blocks = useQuery({ queryKey: ['connections', 'blocks'], queryFn: () => api.get<{ items: PersonCard[] }>('/blocks'), enabled: tab === 'blocked' });
  const refresh = () => qc.invalidateQueries({ queryKey: ['connections'] });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'reject' | 'cancel' }) => api.post(`/connections/requests/${id}/${action}`),
    onSuccess: (_, v) => { toast.success(v.action === 'accept' ? 'Connected! You can now message each other.' : v.action === 'reject' ? 'Request declined' : 'Request cancelled'); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const message = useMutation({ mutationFn: (userId: string) => api.post<{ id: string }>('/conversations/direct', { userId }), onSuccess: (c) => nav(`/messages/${c.id}`), onError: (e) => toast.error(errorMessage(e)) });
  const removeConn = useMutation({ mutationFn: (userId: string) => api.del(`/connections/${userId}`), onSuccess: () => { toast.success('Connection removed'); refresh(); } });
  const unblock = useMutation({ mutationFn: (userId: string) => api.del(`/blocks/${userId}`), onSuccess: () => { toast.success('Unblocked'); refresh(); } });

  const row = (p: PersonCard, right: React.ReactNode, sub?: React.ReactNode) => (
    <Card key={p.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <Link to={`/u/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={p.name} src={p.avatarUrl} size={48} />
        <div className="min-w-0">
          <div className="font-medium">{p.name}</div>
          <div className="truncate text-[13px] text-muted">{p.headline || p.college}</div>
          {sub}
        </div>
      </Link>
      <SkillChips slugs={p.skills} max={3} className="hidden lg:flex" />
      <div className="flex gap-2">{right}</div>
    </Card>
  );

  const loading = tab === 'connections' ? conns.isLoading : tab === 'blocked' ? blocks.isLoading : reqs.isLoading;
  const error = conns.error ?? reqs.error;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Connections" subtitle="Students you're connected with can message you directly." actions={<ButtonLink to="/discover" variant="secondary">Find people</ButtonLink>} />
      <Tabs
        className="mb-5 w-fit"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'connections', label: `Connections (${conns.data?.items.length ?? 0})` },
          { value: 'incoming', label: 'Requests', count: reqs.data?.incoming.length },
          { value: 'outgoing', label: `Sent (${reqs.data?.outgoing.length ?? 0})` },
          { value: 'blocked', label: 'Blocked' },
        ]}
      />
      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => { conns.refetch(); reqs.refetch(); }} />
      ) : tab === 'connections' ? (
        conns.data!.items.length === 0 ? (
          <EmptyState icon={<Users />} title="No connections yet" body="Send collaboration requests from Discover or someone's profile." action={<ButtonLink to="/discover">Discover students</ButtonLink>} />
        ) : (
          <div className="space-y-3">{conns.data!.items.map((p) => row(p, <><Button size="sm" icon={<MessageSquare className="size-3.5" />} onClick={() => message.mutate(p.id)}>Message</Button><Button size="sm" variant="ghost" onClick={() => removeConn.mutate(p.id)}>Remove</Button></>, <div className="text-[11.5px] text-muted">Connected {timeAgo(p.connectedAt)}</div>))}</div>
        )
      ) : tab === 'incoming' ? (
        reqs.data!.incoming.length === 0 ? (
          <EmptyState icon={<Users />} title="No pending requests" />
        ) : (
          <div className="space-y-3">{reqs.data!.incoming.map((r) => row(r.user, <><Button size="sm" variant="secondary" icon={<X className="size-3.5" />} onClick={() => act.mutate({ id: r.id, action: 'reject' })}>Decline</Button><Button size="sm" icon={<Check className="size-3.5" />} onClick={() => act.mutate({ id: r.id, action: 'accept' })}>Accept</Button></>, r.message ? <div className="mt-1 text-[12.5px] italic text-fg-2">“{r.message}”</div> : <div className="text-[11.5px] text-muted">{timeAgo(r.createdAt)}</div>))}</div>
        )
      ) : tab === 'outgoing' ? (
        reqs.data!.outgoing.length === 0 ? (
          <EmptyState icon={<Users />} title="No sent requests" />
        ) : (
          <div className="space-y-3">{reqs.data!.outgoing.map((r) => row(r.user, <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: r.id, action: 'cancel' })}>Cancel</Button>, <div className="text-[11.5px] text-muted">Sent {timeAgo(r.createdAt)}</div>))}</div>
        )
      ) : (blocks.data?.items ?? []).length === 0 ? (
        <EmptyState icon={<Ban />} title="You haven't blocked anyone" />
      ) : (
        <div className="space-y-3">{blocks.data!.items.map((p) => row(p, <Button size="sm" variant="secondary" onClick={() => unblock.mutate(p.id)}>Unblock</Button>))}</div>
      )}
    </div>
  );
}
