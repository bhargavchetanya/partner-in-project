import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity, Ban, BookOpen, Briefcase, Check, CheckCircle2, ClipboardCheck, Flag, Github, MessageSquare, Plus, Search, Shield,
  ShieldAlert, Trash2, UserCheck, UserX, Users, X, AlertTriangle,
} from 'lucide-react';
import { api, errorMessage, qs } from '@/lib/api';
import { useCatalog, useDebounced, useDocumentTitle, useUser } from '@/lib/hooks';
import { formatDate, timeAgo, TYPE_LABEL } from '@/lib/utils';
import { Avatar, Badge, Button, Card, CardHeader, Chip, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, Stat, Tabs, Textarea } from '@/components/ui';

type Tab = 'overview' | 'posts' | 'reports' | 'users' | 'catalog';

export default function Admin() {
  useDocumentTitle('Admin dashboard');
  const { tab: raw } = useParams();
  const nav = useNavigate();
  const tab = (['overview', 'posts', 'reports', 'users', 'catalog'].includes(raw ?? '') ? raw : 'overview') as Tab;
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api.get<Stats>('/admin/stats'), refetchInterval: 60_000 });
  return (
    <div>
      <PageHeader eyebrow="Administrator" title="Admin dashboard" subtitle="Moderate team posts, handle reports, manage accounts and the skill catalogue." />
      <Tabs
        className="mb-6 w-full sm:w-fit"
        value={tab}
        onChange={(t) => nav(t === 'overview' ? '/admin' : `/admin/${t}`)}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'posts', label: 'Post approvals', count: stats.data?.opportunities.pending_approval },
          { value: 'reports', label: 'Reports', count: stats.data?.openReports },
          { value: 'users', label: 'Users' },
          { value: 'catalog', label: 'Skills & roles' },
        ]}
      />
      {tab === 'overview' && <Overview stats={stats} />}
      {tab === 'posts' && <Posts />}
      {tab === 'reports' && <Reports />}
      {tab === 'users' && <UsersTab />}
      {tab === 'catalog' && <CatalogTab />}
    </div>
  );
}

// ================================================================ overview
interface Stats {
  users: { total: number; verified: number; banned: number; deactivated: number; newLast7Days: number; githubLinked: number };
  opportunities: Record<string, number>;
  applications: { total: number; accepted: number };
  messages: number;
  connections: number;
  openReports: number;
  githubRequestsLastHour: number;
  activity: { date: string; signups: number; posts: number; applications: number }[];
}

function Overview({ stats }: { stats: ReturnType<typeof useQuery<Stats>> }) {
  const act = useQuery({ queryKey: ['admin', 'activity'], queryFn: () => api.get<{ actions: { id: string; action: string; targetType: string; targetId: string; reason: string; createdAt: string; adminName: string }[]; recentUsers: { _id: string; name: string; email: string; createdAt: string; emailVerified: boolean }[]; recentPosts: { _id: string; title: string; status: string; createdAt: string; eventName: string }[] }>('/admin/activity') });
  if (stats.isLoading) return <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>;
  if (stats.isError) return <ErrorState message={errorMessage(stats.error)} onRetry={() => stats.refetch()} />;
  const s = stats.data!;
  const totalPosts = Object.values(s.opportunities).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...s.activity.map((d) => d.signups + d.posts + d.applications));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Registered users" value={s.users.total} icon={<Users />} hint={`${s.users.newLast7Days} new this week · ${s.users.verified} verified`} />
        <Stat label="Team posts" value={totalPosts} icon={<Briefcase />} tone="accent" hint={`${s.opportunities.open ?? 0} open · ${s.opportunities.pending_approval ?? 0} awaiting approval`} />
        <Stat label="Applications" value={s.applications.total} icon={<ClipboardCheck />} tone="warn" hint={`${s.applications.accepted} accepted`} />
        <Stat label="Open reports" value={s.openReports} icon={<Flag />} tone="danger" hint={`${s.users.banned} banned · ${s.users.deactivated} deactivated`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title="Platform activity" subtitle="Last 14 days" icon={<Activity className="size-4" />} />
          <div className="p-5">
            <div className="flex h-48 items-end gap-1.5">
              {s.activity.map((d) => {
                const tot = d.signups + d.posts + d.applications;
                return (
                  <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.date}: ${d.signups} sign-ups, ${d.posts} posts, ${d.applications} applications`}>
                    <div className="flex flex-col overflow-hidden rounded-md" style={{ height: `${(tot / max) * 100}%`, minHeight: tot ? 4 : 0 }}>
                      <div className="bg-primary" style={{ flex: d.signups }} />
                      <div className="bg-accent" style={{ flex: d.posts }} />
                      <div className="bg-warn" style={{ flex: d.applications }} />
                    </div>
                    <div className="mt-1.5 text-center text-[9.5px] text-muted">{d.date.slice(8)}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-[12px] text-muted">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary" />Sign-ups</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-accent" />Team posts</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-warn" />Applications</span>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted flex items-center gap-2"><MessageSquare className="size-4" />Messages sent</span><b>{s.messages}</b></div>
            <div className="flex justify-between"><span className="text-muted flex items-center gap-2"><Users className="size-4" />Connections</span><b>{s.connections}</b></div>
            <div className="flex justify-between"><span className="text-muted flex items-center gap-2"><Github className="size-4" />GitHub linked</span><b>{s.users.githubLinked}</b></div>
            <div className="flex justify-between"><span className="text-muted flex items-center gap-2"><Github className="size-4" />GitHub API calls (last hour)</span><b>{s.githubRequestsLastHour}</b></div>
            {Object.entries(s.opportunities).map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-muted capitalize">Posts · {k.replace('_', ' ')}</span><b>{v}</b></div>)}
          </div>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent admin actions" icon={<Shield className="size-4" />} />
          <div className="p-3">
            {act.isLoading ? <Skeleton className="m-2 h-20" /> : (act.data?.actions ?? []).length === 0 ? <p className="p-4 text-sm text-muted">No moderation actions yet.</p> : act.data!.actions.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-[13px] hover:bg-surface-2">
                <span><b>{a.adminName}</b> · {a.action.replace(/_/g, ' ')} <span className="text-muted">({a.targetType})</span>{a.reason && <span className="text-muted"> — {a.reason}</span>}</span>
                <span className="shrink-0 text-[11.5px] text-muted">{timeAgo(a.createdAt)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Newest users" />
          <div className="p-3">
            {(act.data?.recentUsers ?? []).map((u) => (
              <Link key={u._id} to={`/u/${u._id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                <Avatar name={u.name} size={30} />
                <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{u.name}</span><span className="block truncate text-[11.5px] text-muted">{u.email}</span></span>
                <span className="text-[11px] text-muted">{timeAgo(u.createdAt)}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ================================================================ posts
interface AdminPost {
  id: string; title: string; description: string; eventName: string; type: string; domains: string[]; deadline: string; teamSize: number;
  requiredSkills: string[]; openRoles: { role: string; slots: number }[]; status: string; rejectionReason: string; hiddenByBan: boolean; createdAt: string;
  leader: { id: string; name: string; college: string; avatarUrl: string | null; email?: string; institutionVerified: boolean } | null;
}

function Posts() {
  const qc = useQueryClient();
  const { skillName, roleName, interestName } = useCatalog();
  const [status, setStatus] = useState('pending_approval');
  const [reject, setReject] = useState<AdminPost | null>(null);
  const [remove, setRemove] = useState<AdminPost | null>(null);
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['admin', 'posts', status], queryFn: () => api.get<{ items: AdminPost[]; total: number }>(`/admin/opportunities?status=${status}&limit=50`) });
  const done = (msg: string) => { toast.success(msg); setReject(null); setRemove(null); setReason(''); qc.invalidateQueries({ queryKey: ['admin'] }); };
  const approve = useMutation({ mutationFn: (id: string) => api.post(`/admin/opportunities/${id}/approve`), onSuccess: () => done('Post approved and leader notified'), onError: (e) => toast.error(errorMessage(e)) });
  const rejectM = useMutation({ mutationFn: () => api.post(`/admin/opportunities/${reject!.id}/reject`, { reason }), onSuccess: () => done('Post rejected and leader notified'), onError: (e) => toast.error(errorMessage(e)) });
  const removeM = useMutation({ mutationFn: () => api.post(`/admin/opportunities/${remove!.id}/remove`, { reason }), onSuccess: () => done('Post removed'), onError: (e) => toast.error(errorMessage(e)) });
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {[['pending_approval', 'Awaiting approval'], ['open', 'Open'], ['rejected', 'Rejected'], ['closed', 'Closed'], ['expired', 'Expired'], ['removed', 'Removed'], ['all', 'All']].map(([v, l]) => (
          <button key={v} onClick={() => setStatus(v)} className={`rounded-full border px-3 py-1.5 text-[13px] ${status === v ? 'border-primary bg-primary-soft text-primary' : 'border-line text-fg-2'}`}>{l}</button>
        ))}
      </div>
      {q.isLoading ? <Skeleton className="h-40" /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.data!.items.length === 0 ? (
        <EmptyState icon={<CheckCircle2 />} title={status === 'pending_approval' ? 'Nothing waiting for approval' : 'No posts here'} body={status === 'pending_approval' ? 'New team posts will appear here for review.' : undefined} />
      ) : (
        <div className="space-y-4">
          {q.data!.items.map((p) => (
            <Card key={p.id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="primary">{TYPE_LABEL[p.type]}</Badge>
                    <Badge tone={p.status === 'open' ? 'accent' : p.status === 'pending_approval' ? 'warn' : p.status === 'rejected' || p.status === 'removed' ? 'danger' : 'neutral'}>{p.status.replace('_', ' ')}</Badge>
                    {p.hiddenByBan && <Badge tone="danger">Hidden — leader banned</Badge>}
                    <span className="text-[12.5px] text-muted">{p.eventName} · submitted {timeAgo(p.createdAt)} · deadline {formatDate(p.deadline)}</span>
                  </div>
                  <Link to={`/opportunities/${p.id}`} className="mt-2 block font-display text-lg font-semibold hover:text-primary">{p.title}</Link>
                  <p className="mt-1 line-clamp-3 text-[13.5px] text-fg-2">{p.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">{p.requiredSkills.map((s) => <Chip key={s}>{skillName(s)}</Chip>)}</div>
                  <div className="mt-2 text-[12.5px] text-muted">Roles: {p.openRoles.map((r) => `${roleName(r.role)} ×${r.slots}`).join(', ')} · Team of {p.teamSize} · {p.domains.map(interestName).join(', ')}</div>
                  {p.rejectionReason && <div className="mt-2 text-[12.5px] text-danger">Rejection reason: {p.rejectionReason}</div>}
                  {p.leader && (
                    <Link to={`/u/${p.leader.id}`} className="mt-3 inline-flex items-center gap-2 text-[13px]">
                      <Avatar name={p.leader.name} src={p.leader.avatarUrl} size={24} /> {p.leader.name} <span className="text-muted">· {p.leader.email}</span>{p.leader.institutionVerified && <Badge tone="accent">Verified student</Badge>}
                    </Link>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  {p.status === 'pending_approval' && (
                    <>
                      <Button variant="secondary" icon={<X className="size-4" />} onClick={() => setReject(p)}>Reject</Button>
                      <Button icon={<Check className="size-4" />} loading={approve.isPending && approve.variables === p.id} onClick={() => approve.mutate(p.id)}>Approve</Button>
                    </>
                  )}
                  {['open', 'closed', 'expired'].includes(p.status) && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setRemove(p)}>Remove</Button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!reject} onClose={() => setReject(null)} title={`Reject “${reject?.title}”`} description="The leader sees this reason and can edit and resubmit." footer={<><Button variant="ghost" onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" disabled={reason.trim().length < 3} loading={rejectM.isPending} onClick={() => rejectM.mutate()}>Reject post</Button></>}>
        <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Please describe the project idea in more detail." /></Field>
      </Modal>
      <Modal open={!!remove} onClose={() => setRemove(null)} title={`Remove “${remove?.title}”`} footer={<><Button variant="ghost" onClick={() => setRemove(null)}>Cancel</Button><Button variant="danger" loading={removeM.isPending} onClick={() => removeM.mutate()}>Remove post</Button></>}>
        <Field label="Reason (sent to the leader)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}

// ================================================================ reports
interface AdminReport {
  id: string; targetType: 'user' | 'opportunity' | 'message'; reason: string; details: string; status: string; resolution: string; createdAt: string;
  reporter: { id: string; name: string; avatarUrl: string | null } | null;
  owner: { id?: string; name?: string; avatarUrl?: string | null; status?: string; warnings: number } | null;
  target: { id: string; label?: string; link?: string; status?: string; removed?: boolean };
}

function Reports() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'open' | 'all'>('open');
  const [action, setAction] = useState<{ r: AdminReport; kind: 'dismiss' | 'remove-content' | 'warn' | 'ban' } | null>(null);
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['admin', 'reports', status], queryFn: () => api.get<{ items: AdminReport[] }>(`/admin/reports?status=${status}`) });
  const m = useMutation({
    mutationFn: () => api.post(`/admin/reports/${action!.r.id}/${action!.kind}`, { reason }),
    onSuccess: () => { toast.success('Report handled'); setAction(null); setReason(''); qc.invalidateQueries({ queryKey: ['admin'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const labels = { dismiss: 'Dismiss report', 'remove-content': 'Remove content & warn owner', warn: 'Warn owner', ban: 'Ban owner' } as const;
  return (
    <div>
      <Tabs className="mb-4 w-fit" value={status} onChange={setStatus} tabs={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All reports' }]} />
      {q.isLoading ? <Skeleton className="h-40" /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.data!.items.length === 0 ? (
        <EmptyState icon={<ShieldAlert />} title="No reports" body="Reports from students about users, posts and messages appear here." />
      ) : (
        <div className="space-y-4">
          {q.data!.items.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="danger" icon={<Flag className="size-3" />}>{r.reason.replace('_', ' ')}</Badge>
                    <Badge>{r.targetType}</Badge>
                    <Badge tone={r.status === 'open' ? 'warn' : 'neutral'}>{r.status}</Badge>
                    <span className="text-[12.5px] text-muted">{timeAgo(r.createdAt)} · by {r.reporter?.name ?? 'unknown'}</span>
                  </div>
                  <div className="mt-2 text-[15px] font-medium">{r.target.link ? <Link to={r.target.link} className="hover:text-primary">{r.target.label}</Link> : r.target.label}</div>
                  {r.details && <p className="mt-1 text-[13.5px] text-fg-2">“{r.details}”</p>}
                  {r.owner?.name && <div className="mt-2 text-[12.5px] text-muted">Owner: <Link to={`/u/${r.owner.id}`} className="text-fg hover:text-primary">{r.owner.name}</Link> · {r.owner.warnings} warning{r.owner.warnings === 1 ? '' : 's'} · {r.owner.status}</div>}
                  {r.resolution && <div className="mt-2 text-[12.5px] text-accent">Resolution: {r.resolution}</div>}
                </div>
                {r.status === 'open' && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setAction({ r, kind: 'dismiss' })}>Dismiss</Button>
                    {r.targetType !== 'user' && <Button size="sm" variant="secondary" icon={<Trash2 className="size-3.5" />} onClick={() => setAction({ r, kind: 'remove-content' })}>Remove content</Button>}
                    <Button size="sm" variant="secondary" icon={<AlertTriangle className="size-3.5" />} onClick={() => setAction({ r, kind: 'warn' })}>Warn</Button>
                    <Button size="sm" variant="danger" icon={<Ban className="size-3.5" />} onClick={() => setAction({ r, kind: 'ban' })}>Ban user</Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!action} onClose={() => setAction(null)} title={action ? labels[action.kind] : ''} description={action?.kind === 'ban' ? 'The user is signed out, cannot log in, and their team posts are hidden.' : undefined} footer={<><Button variant="ghost" onClick={() => setAction(null)}>Cancel</Button><Button variant={action?.kind === 'dismiss' ? 'primary' : 'danger'} loading={m.isPending} onClick={() => m.mutate()}>Confirm</Button></>}>
        <Field label={action?.kind === 'dismiss' ? 'Note (optional)' : 'Reason (shared with the user)'}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}

// ================================================================ users
interface AdminUser { id: string; name: string; email: string; role: string; status: string; statusReason: string; emailVerified: boolean; institutionVerified: boolean; college: string; avatarUrl: string | null; warnings: number; reports: number; createdAt: string; lastLoginAt: string | null }

function UsersTab() {
  const qc = useQueryClient();
  const me = useUser()!;
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [act, setAct] = useState<{ u: AdminUser; kind: 'active' | 'deactivated' | 'banned' | 'admin' | 'student' | 'warn' } | null>(null);
  const [reason, setReason] = useState('');
  const list = useQuery({ queryKey: ['admin', 'users', dq, status, page], queryFn: () => api.get<{ items: AdminUser[]; total: number; pages: number }>(`/admin/users${qs({ q: dq, status, page, limit: 20 })}`), placeholderData: keepPreviousData });
  const m = useMutation({
    mutationFn: () => {
      const { u, kind } = act!;
      if (kind === 'admin' || kind === 'student') return api.patch(`/admin/users/${u.id}/role`, { role: kind });
      if (kind === 'warn') return api.post(`/admin/users/${u.id}/warn`, { reason });
      return api.patch(`/admin/users/${u.id}/status`, { status: kind, reason });
    },
    onSuccess: () => { toast.success('User updated'); setAct(null); setReason(''); qc.invalidateQueries({ queryKey: ['admin'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const titles = { active: 'Activate account', deactivated: 'Deactivate account', banned: 'Ban user', admin: 'Make administrator', student: 'Remove admin role', warn: 'Send a warning' } as const;
  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search by name or email" leftIcon={<Search className="size-4" />} className="sm:w-80" aria-label="Search users" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sm:w-48" aria-label="Status"><option value="">All statuses</option><option value="active">Active</option><option value="deactivated">Deactivated</option><option value="banned">Banned</option></Select>
        <span className="self-center text-[13px] text-muted sm:ml-auto">{list.data?.total ?? 0} users</span>
      </div>
      {list.isLoading ? <Skeleton className="h-64" /> : list.isError ? <ErrorState message={errorMessage(list.error)} /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[13.5px]">
            <thead className="border-b border-line text-[12px] uppercase tracking-wider text-muted">
              <tr><th className="px-4 py-3 font-medium">User</th><th className="px-4 py-3 font-medium">College</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Flags</th><th className="px-4 py-3 font-medium">Joined</th><th className="px-4 py-3" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.data!.items.map((u) => (
                <tr key={u.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <Link to={`/u/${u.id}`} className="flex items-center gap-2.5">
                      <Avatar name={u.name} src={u.avatarUrl} size={32} />
                      <span className="min-w-0"><span className="block font-medium">{u.name} {u.role === 'admin' && <Badge tone="primary" className="ml-1">admin</Badge>}</span><span className="block text-[12px] text-muted">{u.email}</span></span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-fg-2">{u.college || '—'}</td>
                  <td className="px-4 py-3"><Badge tone={u.status === 'active' ? 'accent' : 'danger'}>{u.status}</Badge>{u.statusReason && <div className="mt-1 max-w-[180px] truncate text-[11.5px] text-muted" title={u.statusReason}>{u.statusReason}</div>}</td>
                  <td className="px-4 py-3 text-[12px] text-muted">{u.emailVerified ? '✓ email' : '✗ email'}{u.institutionVerified && ' · student'}<br />{u.reports} reports · {u.warnings} warnings</td>
                  <td className="px-4 py-3 text-[12.5px] text-muted">{formatDate(u.createdAt)}<br />{u.lastLoginAt ? `seen ${timeAgo(u.lastLoginAt)}` : 'never logged in'}</td>
                  <td className="px-4 py-3">
                    {u.id !== me.id && (
                      <div className="flex justify-end gap-1">
                        {u.status === 'active' ? (
                          <>
                            <Button size="sm" variant="ghost" title="Warn" onClick={() => setAct({ u, kind: 'warn' })}><AlertTriangle className="size-4" /></Button>
                            <Button size="sm" variant="ghost" title="Deactivate" onClick={() => setAct({ u, kind: 'deactivated' })}><UserX className="size-4" /></Button>
                            <Button size="sm" variant="ghost" className="text-danger" title="Ban" onClick={() => setAct({ u, kind: 'banned' })}><Ban className="size-4" /></Button>
                          </>
                        ) : (
                          <Button size="sm" variant="secondary" icon={<UserCheck className="size-4" />} onClick={() => setAct({ u, kind: 'active' })}>Activate</Button>
                        )}
                        <Button size="sm" variant="ghost" title={u.role === 'admin' ? 'Remove admin' : 'Make admin'} onClick={() => setAct({ u, kind: u.role === 'admin' ? 'student' : 'admin' })}><Shield className="size-4" /></Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data!.pages > 1 && (
            <div className="flex items-center justify-center gap-2 border-t border-line p-3">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-sm text-muted">Page {page} of {list.data!.pages}</span>
              <Button size="sm" variant="secondary" disabled={page >= list.data!.pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </Card>
      )}
      <ConfirmDialog open={!!act} onClose={() => setAct(null)} onConfirm={() => m.mutate()} loading={m.isPending} danger={act?.kind === 'banned' || act?.kind === 'deactivated'} confirmLabel="Confirm" title={act ? `${titles[act.kind]}: ${act.u.name}` : ''} body={act?.kind === 'banned' ? 'They are signed out immediately, cannot log in, and their team posts are hidden.' : act?.kind === 'deactivated' ? 'They are signed out and cannot log in until re-activated.' : undefined}>
        {act && ['banned', 'deactivated', 'warn'].includes(act.kind) && <Field label="Reason" className="mt-3"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
      </ConfirmDialog>
    </div>
  );
}

// ================================================================ catalogue
interface AdminCatalog {
  skills: { id: string; slug: string; name: string; category: string; aliases: string[]; active: boolean; custom: boolean; users: number }[];
  categories: { id: string; slug: string; name: string; order: number }[];
  roles: { id: string; slug: string; name: string; active: boolean }[];
  interests: { id: string; slug: string; name: string; active: boolean }[];
  domains: { id: string; domain: string }[];
}

function CatalogTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'catalog'], queryFn: () => api.get<AdminCatalog>('/admin/catalog') });
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [onlyCustom, setOnlyCustom] = useState(false);
  const [newSkill, setNewSkill] = useState({ name: '', category: 'other', aliases: '' });
  const [newRole, setNewRole] = useState('');
  const [newInterest, setNewInterest] = useState('');
  const [newCat, setNewCat] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin', 'catalog'] }); qc.invalidateQueries({ queryKey: ['catalog'] }); };
  const call = useMutation({
    mutationFn: ({ method, url, body }: { method: 'post' | 'patch' | 'del'; url: string; body?: Record<string, unknown> }) => (method === 'del' ? api.del(url) : api[method](url, body)),
    onSuccess: () => { toast.success('Saved'); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const skills = useMemo(() => {
    const t = search.toLowerCase();
    return (q.data?.skills ?? []).filter((s) => (!t || s.name.toLowerCase().includes(t) || s.aliases.some((a) => a.includes(t))) && (!cat || s.category === cat) && (!onlyCustom || s.custom));
  }, [q.data, search, cat, onlyCustom]);
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  const d = q.data!;
  const catName = (slug: string) => d.categories.find((c) => c.slug === slug)?.name ?? slug;
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader title="Skills" subtitle={`${d.skills.length} in the catalogue · custom = added by students, review and categorise them`} icon={<BookOpen className="size-4" />} />
        <div className="space-y-4 p-5">
          <form className="grid gap-2 rounded-xl border border-line bg-surface-2/40 p-3 md:grid-cols-[1fr_170px_1fr_auto]" onSubmit={(e) => { e.preventDefault(); if (!newSkill.name.trim()) return; call.mutate({ method: 'post', url: '/admin/skills', body: { name: newSkill.name, category: newSkill.category, aliases: newSkill.aliases.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean) } }); setNewSkill({ name: '', category: newSkill.category, aliases: '' }); }}>
            <Input value={newSkill.name} onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })} placeholder="New skill name" className="h-10" />
            <Select value={newSkill.category} onChange={(e) => setNewSkill({ ...newSkill, category: e.target.value })} className="h-10">{d.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</Select>
            <Input value={newSkill.aliases} onChange={(e) => setNewSkill({ ...newSkill, aliases: e.target.value })} placeholder="Aliases, comma separated" className="h-10" />
            <Button type="submit" icon={<Plus className="size-4" />}>Add</Button>
          </form>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search skills" leftIcon={<Search className="size-4" />} className="h-10" />
            <Select value={cat} onChange={(e) => setCat(e.target.value)} className="h-10 sm:w-56"><option value="">All categories</option>{d.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</Select>
            <label className="flex items-center gap-2 whitespace-nowrap text-sm"><input type="checkbox" checked={onlyCustom} onChange={(e) => setOnlyCustom(e.target.checked)} className="accent-[var(--primary)]" />Custom only</label>
          </div>
          <div className="max-h-[560px] overflow-y-auto scrollbar-thin rounded-xl border border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-surface text-[11.5px] uppercase tracking-wider text-muted"><tr><th className="px-3 py-2">Skill</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Users</th><th className="px-3 py-2">Active</th></tr></thead>
              <tbody className="divide-y divide-line">
                {skills.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2"><div className="font-medium">{s.name} {s.custom && <Badge tone="warn" className="ml-1">custom</Badge>}</div>{s.aliases.length > 0 && <div className="text-[11.5px] text-muted">{s.aliases.join(', ')}</div>}</td>
                    <td className="px-3 py-2"><Select value={s.category} onChange={(e) => call.mutate({ method: 'patch', url: `/admin/skills/${s.id}`, body: { category: e.target.value } })} className="h-8 text-[12.5px]" aria-label={`Category of ${s.name}`}>{d.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</Select></td>
                    <td className="px-3 py-2 text-muted">{s.users}</td>
                    <td className="px-3 py-2"><input type="checkbox" checked={s.active} onChange={(e) => call.mutate({ method: 'patch', url: `/admin/skills/${s.id}`, body: { active: e.target.checked } })} className="accent-[var(--primary)]" aria-label={`${s.name} active`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {skills.length === 0 && <p className="p-6 text-center text-sm text-muted">No skills match.</p>}
          </div>
          <p className="text-[12px] text-muted">Showing {skills.length}. Category names: {d.categories.map((c) => c.name).join(', ')}. {catName('other')} holds uncategorised skills.</p>
        </div>
      </Card>
      <div className="space-y-6">
        {([['Roles', d.roles, 'roles', newRole, setNewRole], ['Interests / domains', d.interests, 'interests', newInterest, setNewInterest]] as const).map(([title, items, path, val, setVal]) => (
          <Card key={path}>
            <CardHeader title={title} subtitle="Untick to hide from pickers" />
            <div className="space-y-3 p-5">
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (val.trim()) { call.mutate({ method: 'post', url: `/admin/${path}`, body: { name: val } }); setVal(''); } }}>
                <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder={`New ${path === 'roles' ? 'role' : 'interest'}`} className="h-10" />
                <Button type="submit" size="sm" className="h-10">Add</Button>
              </form>
              <div className="flex flex-wrap gap-1.5">
                {items.map((r) => (
                  <label key={r.id} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-[12.5px] ${r.active ? 'border-line' : 'border-dashed border-line opacity-50'}`}>
                    <input type="checkbox" checked={r.active} onChange={(e) => call.mutate({ method: 'patch', url: `/admin/${path}/${r.id}`, body: { active: e.target.checked } })} className="accent-[var(--primary)]" />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
          </Card>
        ))}
        <Card>
          <CardHeader title="Skill categories" />
          <div className="space-y-3 p-5">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newCat.trim()) { call.mutate({ method: 'post', url: '/admin/categories', body: { name: newCat } }); setNewCat(''); } }}>
              <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category" className="h-10" />
              <Button type="submit" size="sm" className="h-10">Add</Button>
            </form>
            <div className="flex flex-wrap gap-1.5">{d.categories.map((c) => <Chip key={c.id}>{c.name}</Chip>)}</div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Verified-student email domains" subtitle="Emails on these domains earn the Verified Student badge" />
          <div className="space-y-3 p-5">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newDomain.trim()) { call.mutate({ method: 'post', url: '/admin/domains', body: { domain: newDomain } }); setNewDomain(''); } }}>
              <Input value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="college.edu or *.ac.in" className="h-10" />
              <Button type="submit" size="sm" className="h-10">Add</Button>
            </form>
            <div className="flex flex-wrap gap-1.5">{d.domains.map((x) => <Chip key={x.id} onRemove={() => call.mutate({ method: 'del', url: `/admin/domains/${x.id}` })}>{x.domain}</Chip>)}</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
