import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus, Radar, UsersRound } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useCatalog, useDocumentTitle } from '@/lib/hooks';
import type { Opportunity } from '@/lib/types';
import { deadlineLabel, STATUS_LABEL } from '@/lib/utils';
import { Badge, ButtonLink, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { statusTone } from './OpportunityDetail';

function TeamRow({ o, leader }: { o: Opportunity; leader: boolean }) {
  const { roleName } = useCatalog();
  const dl = deadlineLabel(o.deadline);
  return (
    <Card className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Badge>
          <span className="text-[12.5px] text-muted">{o.eventName} · {dl.text}</span>
        </div>
        <Link to={`/opportunities/${o.id}`} className="mt-1.5 block font-display text-[17px] font-semibold hover:text-primary">{o.title}</Link>
        <div className="mt-1 text-[13px] text-muted">
          {leader ? 'You lead this team' : `Your role: ${roleName(o.myRole ?? '')}`} · {o.memberCount + 1}/{o.teamSize} members
          {leader && o.status === 'rejected' && o.rejectionReason && <span className="text-danger"> · Not approved: {o.rejectionReason}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {leader && !['pending_approval', 'rejected'].includes(o.status) && (
          <ButtonLink to={`/opportunities/${o.id}/applications`} size="sm" variant={o.pendingApplications ? 'primary' : 'secondary'} icon={<ClipboardList className="size-3.5" />}>
            Applications{o.pendingApplications ? ` (${o.pendingApplications})` : ''}
          </ButtonLink>
        )}
        <ButtonLink to={`/opportunities/${o.id}/skill-gap`} size="sm" variant="secondary" icon={<Radar className="size-3.5" />}>Skill gap</ButtonLink>
        <ButtonLink to={`/opportunities/${o.id}/team`} size="sm" variant="secondary" icon={<UsersRound className="size-3.5" />}>Team</ButtonLink>
      </div>
    </Card>
  );
}

export default function Teams() {
  useDocumentTitle('My teams');
  const q = useQuery({ queryKey: ['opportunities', 'mine'], queryFn: () => api.get<{ led: Opportunity[]; memberOf: Opportunity[] }>('/opportunities/mine') });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="My teams" subtitle="Teams you lead and teams you've joined." actions={<ButtonLink to="/opportunities/new" icon={<Plus className="size-4" />}>Create team post</ButtonLink>} />
      {q.isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-10">
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">Teams I lead</h2>
            {q.data!.led.length === 0 ? (
              <EmptyState icon={<UsersRound />} title="You don't lead any teams yet" body="Post a hackathon or project — you become its team leader and can review applicants." action={<ButtonLink to="/opportunities/new">Create team post</ButtonLink>} />
            ) : (
              <div className="space-y-3">{q.data!.led.map((o) => <TeamRow key={o.id} o={o} leader />)}</div>
            )}
          </section>
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">Teams I've joined</h2>
            {q.data!.memberOf.length === 0 ? (
              <EmptyState icon={<UsersRound />} title="Not part of a team yet" body="Apply to an open team that matches your skills." action={<ButtonLink to="/opportunities" variant="secondary">Browse Team Finder</ButtonLink>} />
            ) : (
              <div className="space-y-3">{q.data!.memberOf.map((o) => <TeamRow key={o.id} o={o} leader={false} />)}</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
