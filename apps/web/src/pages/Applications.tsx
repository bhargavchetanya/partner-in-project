import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Mail } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useCatalog, useDocumentTitle } from '@/lib/hooks';
import { deadlineLabel, STATUS_LABEL, timeAgo } from '@/lib/utils';
import { Avatar, Badge, Button, ButtonLink, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton, Tabs } from '@/components/ui';
import { MatchPill } from '@/components/match';
import { statusTone } from './OpportunityDetail';

interface MyApp {
  id: string;
  status: string;
  role: string;
  message: string;
  matchScore: number;
  createdAt: string;
  decidedAt: string | null;
  opportunity: { id: string; title: string; eventName: string; deadline: string; status: string; leader: { id: string; name: string; avatarUrl: string | null } | null };
}
interface Invitation {
  id: string;
  status: string;
  role: string;
  message: string;
  createdAt: string;
  opportunity: { id: string; title: string; eventName: string; deadline: string; status: string };
  inviter: { id: string; name: string; avatarUrl: string | null } | null;
}

export default function MyApplications() {
  useDocumentTitle('My applications');
  const qc = useQueryClient();
  const { roleName } = useCatalog();
  const [tab, setTab] = useState<'applications' | 'invitations'>('applications');
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected' | 'withdrawn'>('all');
  const [confirm, setConfirm] = useState<string | null>(null);
  const apps = useQuery({ queryKey: ['applications', 'mine'], queryFn: () => api.get<{ items: MyApp[] }>('/applications/mine') });
  const invs = useQuery({ queryKey: ['invitations', 'mine'], queryFn: () => api.get<{ items: Invitation[] }>('/invitations/mine') });
  const withdraw = useMutation({ mutationFn: (id: string) => api.post(`/applications/${id}/withdraw`), onSuccess: () => { toast.success('Application withdrawn'); setConfirm(null); qc.invalidateQueries({ queryKey: ['applications'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => api.post(`/invitations/${id}/${accept ? 'accept' : 'decline'}`),
    onSuccess: (_, v) => { toast.success(v.accept ? "You've joined the team!" : 'Invitation declined'); qc.invalidateQueries({ queryKey: ['invitations'] }); qc.invalidateQueries({ queryKey: ['opportunities'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const items = (apps.data?.items ?? []).filter((a) => filter === 'all' || a.status === filter);
  const pendingInv = (invs.data?.items ?? []).filter((i) => i.status === 'pending').length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Applications & invitations" subtitle="Track every team you've applied to and every invitation you've received." actions={<ButtonLink to="/opportunities" variant="secondary">Find more teams</ButtonLink>} />
      <Tabs className="mb-5 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'applications', label: 'My applications' }, { value: 'invitations', label: 'Invitations', count: pendingInv }]} />

      {tab === 'applications' ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {(['all', 'pending', 'accepted', 'rejected', 'withdrawn'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1.5 text-[13px] ${filter === f ? 'border-primary bg-primary-soft text-primary' : 'border-line text-fg-2 hover:text-fg'}`}>
                {f === 'all' ? 'All' : STATUS_LABEL[f]} {f !== 'all' && `(${(apps.data?.items ?? []).filter((a) => a.status === f).length})`}
              </button>
            ))}
          </div>
          {apps.isLoading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          ) : apps.isError ? (
            <ErrorState message={errorMessage(apps.error)} onRetry={() => apps.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState icon={<FileText />} title={filter === 'all' ? 'No applications yet' : `No ${STATUS_LABEL[filter].toLowerCase()} applications`} body="Browse Team Finder and apply to teams that match your skills." action={<ButtonLink to="/opportunities">Browse teams</ButtonLink>} />
          ) : (
            <div className="space-y-3">
              {items.map((a) => {
                const dl = deadlineLabel(a.opportunity.deadline);
                return (
                  <Card key={a.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={statusTone(a.status)}>{STATUS_LABEL[a.status]}</Badge>
                        <MatchPill score={a.matchScore} />
                        <span className="text-[12.5px] text-muted">applied {timeAgo(a.createdAt)}{a.decidedAt && a.status !== 'pending' ? ` · decided ${timeAgo(a.decidedAt)}` : ''}</span>
                      </div>
                      <Link to={`/opportunities/${a.opportunity.id}`} className="mt-2 block font-display text-[16px] font-semibold hover:text-primary">{a.opportunity.title}</Link>
                      <div className="text-[13px] text-muted">{a.opportunity.eventName} · {roleName(a.role)} · {dl.text}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.opportunity.leader && <Link to={`/u/${a.opportunity.leader.id}`} title={`Leader: ${a.opportunity.leader.name}`}><Avatar name={a.opportunity.leader.name} src={a.opportunity.leader.avatarUrl} size={32} /></Link>}
                      {a.status === 'accepted' && <ButtonLink to={`/opportunities/${a.opportunity.id}/team`} size="sm">Open team</ButtonLink>}
                      {a.status === 'pending' && <Button size="sm" variant="secondary" onClick={() => setConfirm(a.id)}>Withdraw</Button>}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : invs.isLoading ? (
        <Skeleton className="h-24" />
      ) : (invs.data?.items ?? []).length === 0 ? (
        <EmptyState icon={<Mail />} title="No invitations yet" body="Team leaders can invite you straight from your profile. A complete profile with confirmed skills gets more invites." action={<ButtonLink to="/profile">View my profile</ButtonLink>} />
      ) : (
        <div className="space-y-3">
          {invs.data!.items.map((i) => (
            <Card key={i.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              {i.inviter && <Avatar name={i.inviter.name} src={i.inviter.avatarUrl} size={44} />}
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-muted"><b className="text-fg">{i.inviter?.name}</b> invited you as <b className="text-fg">{roleName(i.role)}</b> · {timeAgo(i.createdAt)}</div>
                <Link to={`/opportunities/${i.opportunity.id}`} className="mt-1 block font-display text-[16px] font-semibold hover:text-primary">{i.opportunity.title}</Link>
                <div className="text-[13px] text-muted">{i.opportunity.eventName}</div>
                {i.message && <p className="mt-2 text-[13px] italic text-fg-2">“{i.message}”</p>}
              </div>
              {i.status === 'pending' ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => respond.mutate({ id: i.id, accept: false })}>Decline</Button>
                  <Button size="sm" loading={respond.isPending && respond.variables?.id === i.id && respond.variables.accept} onClick={() => respond.mutate({ id: i.id, accept: true })}>Accept</Button>
                </div>
              ) : (
                <Badge tone={i.status === 'accepted' ? 'accent' : 'neutral'}>{i.status[0].toUpperCase() + i.status.slice(1)}</Badge>
              )}
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && withdraw.mutate(confirm)} loading={withdraw.isPending} title="Withdraw application?" body="You can apply again while the team is still open." confirmLabel="Withdraw" danger />
    </div>
  );
}
