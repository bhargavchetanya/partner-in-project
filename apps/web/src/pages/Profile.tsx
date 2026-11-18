import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Award, Ban, Clock, ExternalLink, Flag, FolderGit2, Github, Globe, Mail, MapPin, MessageSquare, MoreHorizontal, Pencil,
  Sparkles, UserCheck, UserPlus, UsersRound, CalendarDays,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useCatalog, useDocumentTitle, useUser } from '@/lib/hooks';
import type { FullProfile } from '@/lib/types';
import { cn, formatDate, timeAgo, yearLabel } from '@/lib/utils';
import { Avatar, Badge, Button, ButtonLink, Card, CardHeader, Chip, ConfirmDialog, EmptyState, ErrorState, PageLoader, VerifiedBadge } from '@/components/ui';
import { RepoCard } from '@/components/cards';
import { InviteDialog, ReportDialog } from '@/components/dialogs';

const profIndex: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 };

export default function ProfilePage() {
  const { userId } = useParams();
  const me = useUser()!;
  const isSelf = !userId || userId === me.id;
  const qc = useQueryClient();
  const nav = useNavigate();
  const { skillName, skillCategory, categoryName, roleName, interestName, catalog } = useCatalog();
  const q = useQuery({ queryKey: ['profile', isSelf ? 'me' : userId], queryFn: () => api.get<FullProfile>(isSelf ? '/profiles/me' : `/profiles/${userId}`) });
  useDocumentTitle(q.data?.name ?? 'Profile');
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);
  const [invite, setInvite] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ['profile', userId] });
  const connect = useMutation({ mutationFn: () => api.post('/connections/requests', { userId }), onSuccess: () => { toast.success('Collaboration request sent'); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const accept = useMutation({ mutationFn: () => api.post(`/connections/requests/${q.data!.requestId}/accept`), onSuccess: () => { toast.success('Connected!'); refresh(); qc.invalidateQueries({ queryKey: ['connections'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const cancel = useMutation({ mutationFn: () => api.post(`/connections/requests/${q.data!.requestId}/cancel`), onSuccess: () => refresh() });
  const message = useMutation({ mutationFn: () => api.post<{ id: string }>('/conversations/direct', { userId }), onSuccess: (c) => nav(`/messages/${c.id}`), onError: (e) => toast.error(errorMessage(e)) });
  const block = useMutation({
    mutationFn: () => (q.data?.blockedByMe ? api.del(`/blocks/${userId}`) : api.post(`/blocks/${userId}`)),
    onSuccess: () => { toast.success(q.data?.blockedByMe ? 'User unblocked' : 'User blocked — they can no longer message you or send requests.'); setConfirmBlock(false); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const p = q.data!;
  const confirmed = p.skills.filter((s) => s.status === 'confirmed');
  const grouped = new Map<string, typeof confirmed>();
  for (const s of confirmed) {
    const c = skillCategory(s.skill);
    grouped.set(c, [...(grouped.get(c) ?? []), s]);
  }
  const catOrder = new Map(catalog?.categories.map((c) => [c.slug, c.order]) ?? []);
  const repos = p.featuredRepos.length ? p.featuredRepos : p.topRepos;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="relative h-32 sm:h-40">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-primary/10 to-accent/30" />
          <div className="absolute inset-0 bg-grid opacity-40" />
        </div>
        <div className="px-5 pb-6 sm:px-8">
          <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <Avatar name={p.name} src={p.avatarUrl} size={112} className="ring-4 ring-surface" />
              <div className="pb-1">
                <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl font-semibold sm:text-[28px]">
                  {p.name}
                  {p.institutionVerified && <VerifiedBadge />}
                </h1>
                <p className="text-fg-2">{p.headline || p.preferredRoles.map(roleName).join(' · ') || 'Student'}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isSelf ? (
                <>
                  <ButtonLink to="/profile/edit" icon={<Pencil className="size-4" />}>Edit profile</ButtonLink>
                  <ButtonLink to="/skills" variant="secondary" icon={<Sparkles className="size-4" />}>Manage skills</ButtonLink>
                </>
              ) : p.blocked ? (
                p.blockedByMe ? <Button variant="secondary" onClick={() => block.mutate()} loading={block.isPending}>Unblock</Button> : <Badge tone="danger">Unavailable</Badge>
              ) : (
                <>
                  {p.connection === 'connected' && <Button icon={<MessageSquare className="size-4" />} onClick={() => message.mutate()} loading={message.isPending}>Message</Button>}
                  {p.connection === 'none' && <Button icon={<UserPlus className="size-4" />} onClick={() => connect.mutate()} loading={connect.isPending}>Connect</Button>}
                  {p.connection === 'pending_out' && <Button variant="secondary" onClick={() => cancel.mutate()} loading={cancel.isPending}>Cancel request</Button>}
                  {p.connection === 'pending_in' && <Button icon={<UserCheck className="size-4" />} onClick={() => accept.mutate()} loading={accept.isPending}>Accept request</Button>}
                  <Button variant="secondary" icon={<UsersRound className="size-4" />} onClick={() => setInvite(true)}>Invite to team</Button>
                  <div className="relative">
                    <Button variant="ghost" onClick={() => setMenu((m) => !m)} aria-label="More actions"><MoreHorizontal className="size-4" /></Button>
                    {menu && (
                      <div className="card absolute right-0 z-20 mt-1 w-44 p-1.5" onMouseLeave={() => setMenu(false)}>
                        <button onClick={() => { setReport(true); setMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] hover:bg-surface-2"><Flag className="size-4" /> Report</button>
                        <button onClick={() => { setConfirmBlock(true); setMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-danger hover:bg-danger-soft"><Ban className="size-4" /> Block</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-muted">
            {p.college && <span className="flex items-center gap-1.5"><Award className="size-4" />{p.college}{p.branch && ` · ${p.branch}`}{p.year ? ` · ${yearLabel(p.year)}` : ''}</span>}
            {p.location && <span className="flex items-center gap-1.5"><MapPin className="size-4" />{p.location}</span>}
            <span className="flex items-center gap-1.5"><Clock className="size-4" />{p.availabilityHours} h/week available</span>
            {p.github && <a href={p.github.profileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-fg"><Github className="size-4" />{p.github.login}{p.github.linkMethod === 'oauth' && <BadgeIcon />}</a>}
            {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-fg"><Globe className="size-4" />Website</a>}
            {p.email && <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 hover:text-fg"><Mail className="size-4" />{p.email}</a>}
            <span className="flex items-center gap-1.5"><CalendarDays className="size-4" />Joined {formatDate(p.memberSince)}</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader title="About" />
            <div className="px-5 pb-5 pt-3">
              {p.bio ? <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-fg-2">{p.bio}</p> : <p className="text-sm text-muted">{isSelf ? <>No bio yet. <Link to="/profile/edit" className="text-primary">Add one</Link> so teammates know what you're about.</> : 'No bio yet.'}</p>}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Skills"
              subtitle={`${confirmed.length} confirmed skill${confirmed.length === 1 ? '' : 's'}`}
              icon={<Sparkles className="size-4" />}
              action={isSelf ? <Link to="/skills" className="text-[13px] font-medium text-primary">Manage</Link> : undefined}
            />
            <div className="space-y-4 px-5 pb-5 pt-4">
              {confirmed.length === 0 ? (
                <p className="text-sm text-muted">{isSelf ? <>No confirmed skills yet. <Link to="/skills" className="text-primary">Add skills</Link> or link GitHub to get suggestions.</> : 'No skills listed yet.'}</p>
              ) : (
                [...grouped.entries()]
                  .sort((a, b) => (catOrder.get(a[0]) ?? 99) - (catOrder.get(b[0]) ?? 99))
                  .map(([cat, list]) => (
                    <div key={cat}>
                      <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">{categoryName(cat)}</div>
                      <div className="flex flex-wrap gap-2">
                        {list.map((s) => (
                          <span key={s.id} className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[13px]">
                            {skillName(s.skill)}
                            <span className="flex gap-0.5" title={s.proficiency}>
                              {[1, 2, 3, 4].map((i) => <span key={i} className={cn('h-2.5 w-1 rounded-full', i <= profIndex[s.proficiency] ? 'bg-primary' : 'bg-surface-3')} />)}
                            </span>
                            {s.source !== 'manual' && <Github className="size-3 text-muted" aria-label="Also found on GitHub" />}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title={p.featuredRepos.length ? 'Featured repositories' : 'GitHub repositories'}
              subtitle={p.github ? `${p.repoCount} public repositories` : undefined}
              icon={<FolderGit2 className="size-4" />}
              action={p.github ? <Link to={isSelf ? '/github' : `/github?userId=${p.id}`} className="text-[13px] font-medium text-primary">View all {p.repoCount}</Link> : undefined}
            />
            <div className="px-5 pb-5 pt-4">
              {!p.github ? (
                isSelf ? (
                  <EmptyState icon={<Github />} title="Show your real work" body="Link GitHub to display your repositories and get skill suggestions." action={<ButtonLink to="/github">Link GitHub</ButtonLink>} className="py-8" />
                ) : (
                  <p className="text-sm text-muted">No GitHub account linked.</p>
                )
              ) : repos.length === 0 ? (
                <p className="text-sm text-muted">No public repositories yet.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">{repos.map((r) => <RepoCard key={r.id} r={r} />)}</div>
              )}
            </div>
          </Card>

          {(p.projects.length > 0 || isSelf) && (
            <Card>
              <CardHeader title="Projects" icon={<FolderGit2 className="size-4" />} action={isSelf ? <Link to="/profile/edit#projects" className="text-[13px] font-medium text-primary">Edit</Link> : undefined} />
              <div className="space-y-3 px-5 pb-5 pt-4">
                {p.projects.length === 0 ? (
                  <p className="text-sm text-muted">Showcase projects that aren't on GitHub — hackathon builds, research, designs.</p>
                ) : (
                  p.projects.map((pr, i) => (
                    <div key={pr._id ?? i} className="rounded-xl border border-line bg-surface-2/50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-medium">{pr.title}</div>
                        {pr.url && <a href={pr.url} target="_blank" rel="noreferrer" className="text-primary"><ExternalLink className="size-4" /></a>}
                      </div>
                      {pr.description && <p className="mt-1 text-[13.5px] text-muted">{pr.description}</p>}
                      {pr.tech.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{pr.tech.map((t) => <Chip key={t}>{t}</Chip>)}</div>}
                    </div>
                  ))
                )}
              </div>
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Looking to work on" />
            <div className="space-y-4 px-5 pb-5 pt-3">
              <div>
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">Preferred roles</div>
                <div className="flex flex-wrap gap-1.5">{p.preferredRoles.length ? p.preferredRoles.map((r) => <Chip key={r} tone="primary">{roleName(r)}</Chip>) : <span className="text-sm text-muted">Not set</span>}</div>
              </div>
              <div>
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">Interests</div>
                <div className="flex flex-wrap gap-1.5">{p.interests.length ? p.interests.map((r) => <Chip key={r} tone="accent">{interestName(r)}</Chip>) : <span className="text-sm text-muted">Not set</span>}</div>
              </div>
              {p.lookingForSkills.length > 0 && (
                <div>
                  <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">Wants teammates with</div>
                  <div className="flex flex-wrap gap-1.5">{p.lookingForSkills.map((r) => <Chip key={r}>{skillName(r)}</Chip>)}</div>
                </div>
              )}
              <div>
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">Availability</div>
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-warn" style={{ width: `${Math.min(100, (p.availabilityHours / 40) * 100)}%` }} /></div>
                  <span className="text-sm font-medium">{p.availabilityHours} h/wk</span>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Achievements" icon={<Award className="size-4" />} />
            <div className="space-y-3 px-5 pb-5 pt-3">
              {p.achievements.length === 0 ? (
                <p className="text-sm text-muted">{isSelf ? 'Add hackathon wins, certifications or publications.' : 'None listed.'}</p>
              ) : (
                p.achievements.map((a, i) => (
                  <div key={a._id ?? i} className="flex gap-3">
                    <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-warn-soft text-warn"><Award className="size-3.5" /></span>
                    <div>
                      <div className="text-[14px] font-medium">{a.title}</div>
                      {a.date && <div className="text-[12px] text-muted">{a.date}</div>}
                      {a.description && <p className="mt-0.5 text-[13px] text-muted">{a.description}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {p.teams.length > 0 && (
            <Card>
              <CardHeader title="Teams" icon={<UsersRound className="size-4" />} />
              <div className="space-y-1 px-3 pb-3 pt-2">
                {p.teams.map((t) => (
                  <Link key={t.id} to={`/opportunities/${t.id}`} className="block rounded-xl px-2 py-2 hover:bg-surface-2">
                    <div className="text-[13.5px] font-medium">{t.title}</div>
                    <div className="text-[12px] text-muted">{t.eventName} · {t.role === 'leader' ? 'Leader' : roleName(t.role ?? '')}</div>
                  </Link>
                ))}
              </div>
            </Card>
          )}
          {p.lastSeenAt && !isSelf && <p className="px-1 text-[12px] text-muted">Active {timeAgo(p.lastSeenAt)}</p>}
        </aside>
      </div>

      {!isSelf && (
        <>
          <ReportDialog open={report} onClose={() => setReport(false)} targetType="user" targetId={p.id} label={p.name} />
          <InviteDialog open={invite} onClose={() => setInvite(false)} userId={p.id} userName={p.name} />
          <ConfirmDialog open={confirmBlock} onClose={() => setConfirmBlock(false)} onConfirm={() => block.mutate()} loading={block.isPending} danger confirmLabel="Block" title={`Block ${p.name}?`} body="They won't be able to message you or send you requests, and your connection will be removed." />
        </>
      )}
    </div>
  );
}

function BadgeIcon() {
  return <span title="Ownership verified via GitHub sign-in" className="rounded bg-accent-soft px-1 text-[10px] font-semibold text-accent">verified</span>;
}
