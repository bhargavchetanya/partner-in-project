import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, Flag, Hourglass, MapPin, MessageSquare, Pencil, Radar, Send, Trash2, Users,
  XCircle, Lock, Unlock, ClipboardList,
} from 'lucide-react';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { useCatalog, useDocumentTitle, useUser } from '@/lib/hooks';
import type { OpportunityDetail as Detail } from '@/lib/types';
import { cn, deadlineLabel, formatDate, STATUS_LABEL, timeAgo, TYPE_LABEL } from '@/lib/utils';
import { Avatar, Badge, Button, ButtonLink, Card, CardHeader, Chip, ConfirmDialog, ErrorState, Field, PageLoader, Select, Textarea, VerifiedBadge } from '@/components/ui';
import { MatchBreakdown } from '@/components/match';
import { ReportDialog } from '@/components/dialogs';

export function statusTone(s: string): 'accent' | 'warn' | 'danger' | 'neutral' | 'primary' {
  return s === 'open' || s === 'accepted' ? 'accent' : s === 'pending_approval' || s === 'pending' ? 'warn' : s === 'rejected' || s === 'removed' ? 'danger' : 'neutral';
}

export default function OpportunityDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const user = useUser()!;
  const { skillName, roleName, interestName } = useCatalog();
  const q = useQuery({ queryKey: ['opportunity', id], queryFn: () => api.get<Detail>(`/opportunities/${id}`) });
  useDocumentTitle(q.data?.title ?? 'Opportunity');
  const [role, setRole] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [report, setReport] = useState(false);
  const [confirm, setConfirm] = useState<null | 'withdraw' | 'delete' | 'close' | 'leave'>(null);

  const o = q.data;
  const openRoles = o?.openRoles.filter((r) => r.remaining > 0) ?? [];
  useEffect(() => {
    if (!o || role) return;
    const preferred = o.match?.matchedRoles?.[0];
    setRole(preferred && openRoles.some((r) => r.role === preferred) ? preferred : openRoles[0]?.role ?? '');
  }, [o?.id]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['opportunity', id] });
    qc.invalidateQueries({ queryKey: ['opportunities'] });
    qc.invalidateQueries({ queryKey: ['applications'] });
  };
  const apply = useMutation({
    mutationFn: () => api.post(`/opportunities/${id}/apply`, { role, message }),
    onSuccess: () => { toast.success('Application sent! The team leader has been notified.'); setMessage(''); refresh(); },
    onError: (e) => { setErrors(fieldErrors(e)); toast.error(errorMessage(e)); },
  });
  const withdraw = useMutation({ mutationFn: () => api.post(`/applications/${o!.myApplication!.id}/withdraw`), onSuccess: () => { toast.success('Application withdrawn'); setConfirm(null); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const acceptInv = useMutation({ mutationFn: () => api.post(`/invitations/${o!.myInvitation!.id}/accept`), onSuccess: () => { toast.success("You've joined the team!"); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const declineInv = useMutation({ mutationFn: () => api.post(`/invitations/${o!.myInvitation!.id}/decline`), onSuccess: () => { toast.success('Invitation declined'); refresh(); } });
  const close = useMutation({ mutationFn: () => api.post(`/opportunities/${id}/close`), onSuccess: () => { toast.success('Post closed'); setConfirm(null); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const reopen = useMutation({ mutationFn: () => api.post(`/opportunities/${id}/reopen`), onSuccess: () => { toast.success('Post reopened'); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const del = useMutation({ mutationFn: () => api.del(`/opportunities/${id}`), onSuccess: () => { toast.success('Post deleted'); nav('/teams'); qc.invalidateQueries({ queryKey: ['opportunities'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const leave = useMutation({ mutationFn: () => api.post(`/opportunities/${id}/leave`), onSuccess: () => { toast.success('You left the team'); setConfirm(null); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });

  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = o!;
  const dl = deadlineLabel(d.deadline);
  const matched = new Set(d.match?.matchedSkills ?? []);

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-0 glow opacity-70" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{TYPE_LABEL[d.type]}</Badge>
            <Badge tone={statusTone(d.status)}>{STATUS_LABEL[d.status]}</Badge>
            <span className="text-sm text-muted">{d.eventName}</span>
          </div>
          <h1 className="mt-3 font-display text-2xl font-semibold leading-tight sm:text-[32px]">{d.title}</h1>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-fg-2">
            <span className={cn('flex items-center gap-1.5', dl.urgent && 'text-warn', dl.past && 'text-danger')}><CalendarClock className="size-4" />{formatDate(d.deadline, true)} · {dl.text}</span>
            <span className="flex items-center gap-1.5"><Users className="size-4" />{d.memberCount + 1} of {d.teamSize} members · {d.spotsLeft} spot{d.spotsLeft === 1 ? '' : 's'} left</span>
            <span className="flex items-center gap-1.5"><Clock className="size-4" />{d.commitmentHours} h/week</span>
            <span className="flex items-center gap-1.5"><MapPin className="size-4" />{d.location}</span>
          </div>
          {d.leader && (
            <Link to={`/u/${d.leader.id}`} className="mt-5 inline-flex items-center gap-2.5 rounded-full border border-line bg-surface/60 py-1 pl-1 pr-3.5 text-sm hover:border-line-strong">
              <Avatar name={d.leader.name} src={d.leader.avatarUrl} size={28} />
              <span>Led by <b>{d.leader.name}</b></span>
              {d.leader.institutionVerified && <VerifiedBadge small />}
            </Link>
          )}
        </div>
      </Card>

      {d.isLeader && d.status === 'pending_approval' && (
        <div className="flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn-soft px-5 py-4 text-sm">
          <Hourglass className="mt-0.5 size-5 shrink-0 text-warn" />
          <div><b>Waiting for admin approval.</b> Your post isn't visible to other students yet. You'll get a notification as soon as it's reviewed.</div>
        </div>
      )}
      {d.isLeader && d.status === 'rejected' && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-danger/30 bg-danger-soft px-5 py-4 text-sm">
          <div className="flex items-start gap-3"><XCircle className="mt-0.5 size-5 shrink-0 text-danger" /><div><b>Not approved.</b> Reason: {d.rejectionReason || 'not given'}. Edit the post to resubmit it.</div></div>
          <ButtonLink to={`/opportunities/${d.id}/edit`} size="sm" variant="secondary">Edit &amp; resubmit</ButtonLink>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader title="Project idea" />
            <div className="px-5 pb-5 pt-3"><p className="whitespace-pre-line text-[15px] leading-relaxed text-fg-2">{d.description}</p></div>
          </Card>
          <Card>
            <CardHeader title="Required skills" subtitle={d.match ? `You have ${d.match.matchedSkills.length} of ${d.requiredSkills.length}` : undefined} />
            <div className="flex flex-wrap gap-2 px-5 pb-5 pt-4">
              {d.requiredSkills.map((s) => (
                <Chip key={s} tone={d.match ? (matched.has(s) ? 'accent' : 'warn') : 'neutral'}>
                  {d.match && (matched.has(s) ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />)}
                  {skillName(s)}
                </Chip>
              ))}
            </div>
          </Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="Open roles" />
              <ul className="space-y-2 px-5 pb-5 pt-4">
                {d.openRoles.map((r) => (
                  <li key={r.role} className="flex items-center justify-between rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm">
                    <span className="font-medium">{roleName(r.role)}</span>
                    <span className={cn('text-[12.5px]', r.remaining ? 'text-accent' : 'text-muted')}>{r.remaining ? `${r.remaining} of ${r.slots} open` : 'Filled'}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Domains" />
              <div className="flex flex-wrap gap-2 px-5 pb-5 pt-4">{d.domains.map((x) => <Chip key={x} tone="accent">{interestName(x)}</Chip>)}</div>
            </Card>
          </div>
          <Card>
            <CardHeader title="Team" subtitle={`${d.members.length} of ${d.teamSize}`} icon={<Users className="size-4" />} />
            <ul className="grid gap-3 px-5 pb-5 pt-4 sm:grid-cols-2">
              {d.members.map((m) => (
                <li key={m.userId}>
                  <Link to={`/u/${m.userId}`} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-line-strong">
                    <Avatar name={m.name} src={m.avatarUrl} size={40} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate text-sm font-medium">{m.name}{m.institutionVerified && <VerifiedBadge small />}</div>
                      <div className="text-[12px] text-muted">{m.isLeader ? 'Team Leader' : roleName(m.role)}</div>
                    </div>
                  </Link>
                </li>
              ))}
              {Array.from({ length: d.spotsLeft }).map((_, i) => (
                <li key={`open${i}`} className="flex items-center gap-3 rounded-xl border border-dashed border-line-strong p-3 text-sm text-muted">
                  <span className="flex size-10 items-center justify-center rounded-full border border-dashed border-line-strong">+</span> Open spot
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <aside className="space-y-6">
          {d.isLeader ? (
            <Card className="p-5">
              <h3 className="font-display font-semibold">Manage your team</h3>
              <div className="mt-4 grid gap-2">
                <ButtonLink to={`/opportunities/${d.id}/applications`} icon={<ClipboardList className="size-4" />}>Review applications {d.pendingApplications ? `(${d.pendingApplications})` : ''}</ButtonLink>
                <ButtonLink to={`/opportunities/${d.id}/skill-gap`} variant="secondary" icon={<Radar className="size-4" />}>Skill gap analysis</ButtonLink>
                <ButtonLink to={`/opportunities/${d.id}/team`} variant="secondary" icon={<MessageSquare className="size-4" />}>Team page &amp; chat</ButtonLink>
                <ButtonLink to={`/opportunities/${d.id}/edit`} variant="outline" icon={<Pencil className="size-4" />}>Edit post</ButtonLink>
                {d.status === 'open' && <Button variant="ghost" icon={<Lock className="size-4" />} onClick={() => setConfirm('close')}>Close recruitment</Button>}
                {d.status === 'closed' && <Button variant="ghost" icon={<Unlock className="size-4" />} loading={reopen.isPending} onClick={() => reopen.mutate()}>Reopen recruitment</Button>}
                <Button variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirm('delete')}>Delete post</Button>
              </div>
            </Card>
          ) : d.isMember ? (
            <Card className="p-5">
              <div className="flex items-center gap-2 font-display font-semibold text-accent"><CheckCircle2 className="size-5" /> You're on this team</div>
              <p className="mt-1 text-sm text-muted">Role: {roleName(d.myRole ?? '')}</p>
              <div className="mt-4 grid gap-2">
                <ButtonLink to={`/opportunities/${d.id}/team`} icon={<MessageSquare className="size-4" />}>Team page &amp; chat</ButtonLink>
                <ButtonLink to={`/opportunities/${d.id}/skill-gap`} variant="secondary" icon={<Radar className="size-4" />}>Skill gap</ButtonLink>
                <Button variant="ghost" className="text-danger" onClick={() => setConfirm('leave')}>Leave team</Button>
              </div>
            </Card>
          ) : d.myInvitation ? (
            <Card className="border-primary/40 p-5">
              <h3 className="font-display font-semibold">You're invited! 🎉</h3>
              <p className="mt-1 text-sm text-muted">Role: <b className="text-fg">{roleName(d.myInvitation.role)}</b></p>
              {d.myInvitation.message && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm italic text-fg-2">“{d.myInvitation.message}”</p>}
              {!user.emailVerified && <p className="mt-3 text-[13px] text-warn">Verify your email to accept. <Link to="/verify-email" className="underline">Verify now</Link></p>}
              <div className="mt-4 flex gap-2">
                <Button className="flex-1" loading={acceptInv.isPending} disabled={!user.emailVerified} onClick={() => acceptInv.mutate()}>Accept</Button>
                <Button variant="secondary" className="flex-1" loading={declineInv.isPending} onClick={() => declineInv.mutate()}>Decline</Button>
              </div>
            </Card>
          ) : d.myApplication && d.myApplication.status !== 'withdrawn' ? (
            <Card className="p-5">
              <h3 className="font-display font-semibold">Your application</h3>
              <div className="mt-3 flex items-center gap-2"><Badge tone={statusTone(d.myApplication.status)}>{STATUS_LABEL[d.myApplication.status]}</Badge><span className="text-[13px] text-muted">for {roleName(d.myApplication.role)} · {timeAgo(d.myApplication.createdAt)}</span></div>
              {d.myApplication.message && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-fg-2">“{d.myApplication.message}”</p>}
              {d.myApplication.status === 'pending' && <Button variant="secondary" className="mt-4 w-full" onClick={() => setConfirm('withdraw')}>Withdraw application</Button>}
              <ButtonLink to="/applications" variant="ghost" className="mt-2 w-full">All my applications</ButtonLink>
            </Card>
          ) : d.canApply ? (
            <Card className="p-5">
              <h3 className="font-display text-lg font-semibold">Apply to join</h3>
              {!user.emailVerified ? (
                <div className="mt-3 rounded-xl border border-warn/30 bg-warn-soft p-3 text-[13px] text-warn">
                  Verify your email to apply to teams. <Link to="/verify-email" className="font-semibold underline">Verify now</Link>
                </div>
              ) : (
                <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); if (!role) return setErrors({ role: 'Choose a role' }); apply.mutate(); }}>
                  <Field label="Role" error={errors.role}>
                    <Select value={role} onChange={(e) => setRole(e.target.value)} invalid={!!errors.role}>
                      {openRoles.map((r) => <option key={r.role} value={r.role}>{roleName(r.role)} ({r.remaining} open)</option>)}
                    </Select>
                  </Field>
                  <Field label="Message (optional)" error={errors.message} hint="Tell them what you'd bring.">
                    <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} placeholder="Hi! I've built … and I'd love to work on …" className="min-h-[90px]" />
                  </Field>
                  <Button type="submit" className="w-full" size="lg" loading={apply.isPending} icon={<Send className="size-4" />}>Submit application</Button>
                </form>
              )}
            </Card>
          ) : (
            <Card className="p-5">
              <div className="flex items-center gap-2 text-sm text-muted">
                <AlertTriangle className="size-4" />
                {d.status === 'expired' || dl.past ? 'The deadline has passed — applications are closed.' : d.status === 'closed' || d.spotsLeft === 0 ? 'This team is full and no longer recruiting.' : d.myApplication?.status === 'rejected' ? 'Your earlier application was not accepted.' : 'Applications are not open.'}
              </div>
            </Card>
          )}

          {d.match && !d.isMember && (
            <Card className="p-5">
              <MatchBreakdown match={d.match} title="Your match" />
            </Card>
          )}
          {!d.isLeader && (
            <button onClick={() => setReport(true)} className="flex items-center gap-1.5 px-1 text-[12.5px] text-muted hover:text-danger"><Flag className="size-3.5" /> Report this post</button>
          )}
        </aside>
      </div>

      <ReportDialog open={report} onClose={() => setReport(false)} targetType="opportunity" targetId={d.id} label="this post" />
      <ConfirmDialog open={confirm === 'withdraw'} onClose={() => setConfirm(null)} onConfirm={() => withdraw.mutate()} loading={withdraw.isPending} title="Withdraw application?" body="You can apply again later while the team is still open." confirmLabel="Withdraw" danger />
      <ConfirmDialog open={confirm === 'close'} onClose={() => setConfirm(null)} onConfirm={() => close.mutate()} loading={close.isPending} title="Close recruitment?" body="The post stops accepting applications and pending applicants are notified." confirmLabel="Close post" />
      <ConfirmDialog open={confirm === 'delete'} onClose={() => setConfirm(null)} onConfirm={() => del.mutate()} loading={del.isPending} title="Delete this post?" body="The post disappears for everyone. This can't be undone." confirmLabel="Delete" danger />
      <ConfirmDialog open={confirm === 'leave'} onClose={() => setConfirm(null)} onConfirm={() => leave.mutate()} loading={leave.isPending} title="Leave this team?" body="Your spot opens up again and the leader is notified." confirmLabel="Leave team" danger />
    </div>
  );
}
