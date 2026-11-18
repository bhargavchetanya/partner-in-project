import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ClipboardList, Crown, Radar, UserMinus, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useCatalog, useDocumentTitle, useUser } from '@/lib/hooks';
import type { Opportunity, TeamMemberDto } from '@/lib/types';
import { deadlineLabel, STATUS_LABEL, timeAgo } from '@/lib/utils';
import { Avatar, Badge, Button, ButtonLink, Card, CardHeader, ConfirmDialog, ErrorState, PageLoader, VerifiedBadge } from '@/components/ui';
import { SkillChips } from '@/components/match';
import { ChatPanel } from '@/components/chat';
import { statusTone } from './OpportunityDetail';

interface TeamResponse {
  opportunity: Opportunity;
  members: TeamMemberDto[];
  conversationId: string;
  invitations: { id: string; role: string; user: { id: string; name: string; avatarUrl: string | null } | null }[];
}

export default function TeamPage() {
  const { id } = useParams();
  const me = useUser()!;
  const qc = useQueryClient();
  const nav = useNavigate();
  const { roleName } = useCatalog();
  const q = useQuery({ queryKey: ['team', id], queryFn: () => api.get<TeamResponse>(`/opportunities/${id}/team`) });
  useDocumentTitle(q.data ? `Team · ${q.data.opportunity.title}` : 'Team');
  const [remove, setRemove] = useState<TeamMemberDto | null>(null);
  const [leave, setLeave] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['team', id] });
    qc.invalidateQueries({ queryKey: ['opportunity', id] });
    qc.invalidateQueries({ queryKey: ['opportunities'] });
  };
  const removeM = useMutation({ mutationFn: (userId: string) => api.del(`/opportunities/${id}/members/${userId}`), onSuccess: () => { toast.success('Member removed — the position is open again.'); setRemove(null); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const leaveM = useMutation({ mutationFn: () => api.post(`/opportunities/${id}/leave`), onSuccess: () => { toast.success('You left the team'); nav('/teams'); }, onError: (e) => toast.error(errorMessage(e)) });
  const cancelInv = useMutation({ mutationFn: (invId: string) => api.del(`/invitations/${invId}`), onSuccess: () => { toast.success('Invitation cancelled'); refresh(); } });

  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const { opportunity: o, members, conversationId, invitations } = q.data!;
  const isLeader = o.leaderId === me.id;
  const dl = deadlineLabel(o.deadline);

  return (
    <div>
      <Link to={`/opportunities/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> Post details</Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Badge><span className="text-sm text-muted">{o.eventName} · {dl.text}</span></div>
          <h1 className="mt-2 font-display text-2xl font-semibold sm:text-[28px]">{o.title}</h1>
          <p className="text-sm text-muted">{members.length} of {o.teamSize} members · {o.spotsLeft} open spot{o.spotsLeft === 1 ? '' : 's'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={`/opportunities/${id}/skill-gap`} variant="secondary" icon={<Radar className="size-4" />}>Skill gap</ButtonLink>
          {isLeader && <ButtonLink to={`/opportunities/${id}/applications`} icon={<ClipboardList className="size-4" />}>Applications</ButtonLink>}
          {!isLeader && <Button variant="ghost" className="text-danger" onClick={() => setLeave(true)}>Leave team</Button>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Members" />
            <ul className="divide-y divide-line px-5 pb-2 pt-2">
              {members.map((m) => (
                <li key={m.userId} className="py-3.5">
                  <div className="flex items-center gap-3">
                    <Link to={`/u/${m.userId}`}><Avatar name={m.name} src={m.avatarUrl} size={42} /></Link>
                    <div className="min-w-0 flex-1">
                      <Link to={`/u/${m.userId}`} className="flex items-center gap-1.5 font-medium hover:text-primary">{m.name}{m.institutionVerified && <VerifiedBadge small />}{m.isLeader && <Crown className="size-3.5 text-warn" />}</Link>
                      <div className="text-[12.5px] text-muted">{m.isLeader ? 'Team Leader' : roleName(m.role)} · joined {timeAgo(m.joinedAt)}</div>
                    </div>
                    {isLeader && !m.isLeader && (
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRemove(m)} aria-label={`Remove ${m.name}`}><UserMinus className="size-4" /></Button>
                    )}
                  </div>
                  <SkillChips className="mt-2 pl-[54px]" slugs={m.skills} highlight={o.requiredSkills} max={6} />
                </li>
              ))}
            </ul>
          </Card>
          {isLeader && invitations.length > 0 && (
            <Card>
              <CardHeader title="Pending invitations" />
              <ul className="space-y-2 px-5 pb-5 pt-3">
                {invitations.map((i) => (
                  <li key={i.id} className="flex items-center gap-3">
                    {i.user && <Avatar name={i.user.name} src={i.user.avatarUrl} size={32} />}
                    <span className="flex-1 text-sm">{i.user?.name} <span className="text-muted">· {roleName(i.role)}</span></span>
                    <Button size="sm" variant="ghost" onClick={() => cancelInv.mutate(i.id)} aria-label="Cancel invitation"><X className="size-4" /></Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="p-5">
            <div className="text-[13px] font-medium text-fg-2">Open roles</div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {o.openRoles.map((r) => (
                <li key={r.role} className="flex justify-between"><span>{roleName(r.role)}</span><span className={r.remaining ? 'text-accent' : 'text-muted'}>{r.filled}/{r.slots} filled</span></li>
              ))}
            </ul>
          </Card>
        </div>
        <Card className="flex h-[640px] min-h-0 flex-col overflow-hidden">
          <ChatPanel conversationId={conversationId} className="min-h-0 flex-1" />
        </Card>
      </div>

      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} onConfirm={() => remove && removeM.mutate(remove.userId)} loading={removeM.isPending} danger confirmLabel="Remove" title={`Remove ${remove?.name}?`} body="They'll lose access to the team chat and the position opens up again." />
      <ConfirmDialog open={leave} onClose={() => setLeave(false)} onConfirm={() => leaveM.mutate()} loading={leaveM.isPending} danger confirmLabel="Leave team" title="Leave this team?" body="Your spot opens up again and the leader is notified." />
    </div>
  );
}
