import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Check, ClipboardList, Clock, Radar, X } from 'lucide-react';
import type { MatchResult } from '@pip/shared';
import { api, errorMessage } from '@/lib/api';
import { useCatalog, useDocumentTitle } from '@/lib/hooks';
import type { Opportunity } from '@/lib/types';
import { timeAgo, yearLabel, STATUS_LABEL } from '@/lib/utils';
import { Avatar, Badge, Button, ButtonLink, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, PageLoader, Tabs, VerifiedBadge } from '@/components/ui';
import { MatchBreakdown, MatchGauge, SkillChips } from '@/components/match';
import { statusTone } from './OpportunityDetail';

interface AppItem {
  id: string;
  status: string;
  role: string;
  message: string;
  createdAt: string;
  decidedAt: string | null;
  applicant: { id: string; name: string; headline: string; college: string; branch: string; year: number; avatarUrl: string | null; skills: string[]; roles: string[]; availabilityHours: number; institutionVerified: boolean };
  match: MatchResult;
}

export default function ManageApplications() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { roleName } = useCatalog();
  const [tab, setTab] = useState<'pending' | 'accepted' | 'rejected'>('pending');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; accept: boolean; name: string } | null>(null);
  const q = useQuery({ queryKey: ['applications', 'for', id], queryFn: () => api.get<{ opportunity: Opportunity; items: AppItem[] }>(`/opportunities/${id}/applications`) });
  useDocumentTitle(q.data ? `Applications · ${q.data.opportunity.title}` : 'Applications');
  const decide = useMutation({
    mutationFn: ({ id: appId, accept }: { id: string; accept: boolean }) => api.post(`/applications/${appId}/${accept ? 'accept' : 'reject'}`),
    onSuccess: (_, v) => {
      toast.success(v.accept ? 'Accepted — they have been added to the team and notified.' : 'Application rejected. The applicant was notified.');
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ['applications', 'for', id] });
      qc.invalidateQueries({ queryKey: ['opportunity', id] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
    onError: (e) => { toast.error(errorMessage(e)); setConfirm(null); },
  });

  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const { opportunity: o, items } = q.data!;
  const list = items.filter((a) => a.status === tab);
  const count = (s: string) => items.filter((a) => a.status === s).length;

  return (
    <div>
      <Link to={`/opportunities/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {o.title}</Link>
      <PageHeader
        title="Review applications"
        subtitle={`${o.spotsLeft} spot${o.spotsLeft === 1 ? '' : 's'} left · sorted by match score`}
        actions={<><ButtonLink to={`/opportunities/${id}/skill-gap`} variant="secondary" icon={<Radar className="size-4" />}>Skill gap</ButtonLink><ButtonLink to={`/opportunities/${id}/team`} variant="secondary">Team</ButtonLink></>}
      />
      {o.status !== 'open' && <div className="mb-4 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13.5px] text-warn">This post is {STATUS_LABEL[o.status].toLowerCase()}, so new members can't be accepted.</div>}
      <Tabs className="mb-5 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'pending', label: 'Pending', count: count('pending') }, { value: 'accepted', label: `Accepted (${count('accepted')})` }, { value: 'rejected', label: `Rejected (${count('rejected')})` }]} />
      {list.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title={tab === 'pending' ? 'No pending applications' : `No ${tab} applications`} body={tab === 'pending' ? 'Share your post or invite suggested students from the skill gap page.' : undefined} action={tab === 'pending' && <ButtonLink to={`/opportunities/${id}/skill-gap`}>Find people to invite</ButtonLink>} />
      ) : (
        <div className="space-y-4">
          {list.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-col gap-5 lg:flex-row">
                <div className="flex min-w-0 flex-1 gap-4">
                  <Link to={`/u/${a.applicant.id}`}><Avatar name={a.applicant.name} src={a.applicant.avatarUrl} size={56} /></Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/u/${a.applicant.id}`} className="font-display text-[17px] font-semibold hover:text-primary">{a.applicant.name}</Link>
                      {a.applicant.institutionVerified && <VerifiedBadge small />}
                      <Badge tone={statusTone(a.status)}>{STATUS_LABEL[a.status]}</Badge>
                    </div>
                    <div className="text-[13px] text-muted">{[a.applicant.college, a.applicant.branch, yearLabel(a.applicant.year)].filter(Boolean).join(' · ')}</div>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-[13px] text-fg-2">
                      <span>Applied as <b>{roleName(a.role)}</b></span>
                      <span className="flex items-center gap-1 text-muted"><Clock className="size-3.5" />{a.applicant.availabilityHours} h/week</span>
                      <span className="text-muted">{timeAgo(a.createdAt)}</span>
                    </div>
                    {a.message && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-[13.5px] text-fg-2">“{a.message}”</p>}
                    <SkillChips className="mt-3" slugs={a.applicant.skills} highlight={a.match.matchedSkills} max={10} />
                    <p className="mt-2 text-[12.5px] text-fg-2">{a.match.summary}</p>
                    <button onClick={() => setExpanded(expanded === a.id ? null : a.id)} className="mt-2 text-[12.5px] font-medium text-primary hover:underline">{expanded === a.id ? 'Hide' : 'Show'} match breakdown</button>
                  </div>
                </div>
                <div className="flex shrink-0 flex-row items-center gap-3 lg:flex-col lg:items-end">
                  <MatchGauge score={a.match.score} size={76} />
                  {a.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" icon={<X className="size-3.5" />} onClick={() => setConfirm({ id: a.id, accept: false, name: a.applicant.name })}>Reject</Button>
                      <Button size="sm" icon={<Check className="size-3.5" />} disabled={o.status !== 'open'} onClick={() => setConfirm({ id: a.id, accept: true, name: a.applicant.name })}>Accept</Button>
                    </div>
                  )}
                </div>
              </div>
              {expanded === a.id && <div className="mt-5 rounded-xl border border-line bg-surface-2/40 p-5"><MatchBreakdown match={a.match} /></div>}
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && decide.mutate({ id: confirm.id, accept: confirm.accept })}
        loading={decide.isPending}
        danger={!confirm?.accept}
        confirmLabel={confirm?.accept ? 'Accept' : 'Reject'}
        title={confirm?.accept ? `Accept ${confirm?.name}?` : `Reject ${confirm?.name}?`}
        body={confirm?.accept ? 'They will be added to the team and the team chat, and notified by email.' : 'They will be notified that the team is not moving forward with their application.'}
      />
    </div>
  );
}
