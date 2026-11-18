import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, BadgeCheck, Github, Link2, RefreshCw, Search, Sparkles, Star, Unlink } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useDocumentTitle, useMe } from '@/lib/hooks';
import type { Repo } from '@/lib/types';
import { formatDate, timeAgo } from '@/lib/utils';
import { Avatar, Badge, Button, Card, CardSkeletons, ConfirmDialog, EmptyState, ErrorState, Field, Input, PageHeader, PageLoader, Select, Toggle } from '@/components/ui';
import { RepoCard } from '@/components/cards';

interface GithubStatus {
  connected: boolean;
  oauthAvailable: boolean;
  login?: string;
  name?: string;
  avatarUrl?: string;
  profileUrl?: string;
  bio?: string;
  followers?: number;
  publicRepos?: number;
  linkMethod?: 'oauth' | 'username';
  verified?: boolean;
  lastSyncedAt?: string | null;
  nextAutoRefreshAt?: string | null;
  syncStatus?: 'idle' | 'syncing' | 'ok' | 'error';
  syncError?: string;
  includeForks?: boolean;
  repoCount?: number;
}

const errorText: Record<string, string> = {
  oauth_not_configured: 'GitHub sign-in is not configured on this server yet — link by username instead.',
  cancelled: 'GitHub connection was cancelled.',
  failed: 'Connecting GitHub failed. Please try again.',
  expired: 'The connection attempt expired. Please try again.',
  taken: 'That GitHub account is already linked to another user.',
};

function LinkForm({ onDone, oauthAvailable }: { onDone?: () => void; oauthAvailable: boolean }) {
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const link = useMutation({
    mutationFn: () => api.post<GithubStatus>('/github/link', { username }),
    onSuccess: (s) => {
      qc.setQueryData(['github', 'status'], { ...s, syncStatus: 'syncing' });
      toast.success(`Linked ${s.login}. Fetching all your repositories…`);
      onDone?.();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-line bg-surface-2/40 p-5">
        <div className="flex items-center gap-2 font-display font-semibold"><BadgeCheck className="size-4 text-accent" /> Connect with GitHub</div>
        <p className="mt-1.5 text-[13px] text-muted">Sign in with GitHub to prove the account is yours. Your profile shows a “verified” GitHub link. We only request read access to your public profile.</p>
        <Button className="mt-4 w-full" icon={<Github className="size-4" />} onClick={() => (oauthAvailable ? (location.href = '/api/github/connect') : toast.error(errorText.oauth_not_configured))}>
          Connect GitHub account
        </Button>
      </div>
      <form
        className="rounded-2xl border border-line bg-surface-2/40 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!username.trim()) return setError('Enter your GitHub username or profile link');
          setError('');
          link.mutate();
        }}
      >
        <div className="flex items-center gap-2 font-display font-semibold"><Link2 className="size-4 text-primary" /> Or use your username</div>
        <p className="mt-1.5 text-[13px] text-muted">Paste a username or a link like github.com/octocat. Only public repositories are shown.</p>
        <Field error={error} className="mt-4">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="octocat or https://github.com/octocat" leftIcon={<Github className="size-4" />} invalid={!!error} />
        </Field>
        <Button type="submit" variant="secondary" className="mt-3 w-full" loading={link.isPending}>Link username</Button>
      </form>
    </div>
  );
}

export default function Repos() {
  useDocumentTitle('GitHub repositories');
  const [params, setParams] = useSearchParams();
  const otherUser = params.get('userId');
  const qc = useQueryClient();
  const { data: me } = useMe();
  const status = useQuery({
    queryKey: ['github', 'status'],
    queryFn: () => api.get<GithubStatus>('/github/status'),
    enabled: !otherUser,
    refetchInterval: (q) => (q.state.data?.syncStatus === 'syncing' ? 2000 : false),
  });
  const s = status.data;
  const repos = useQuery({
    queryKey: ['github', 'repos', otherUser ?? 'me'],
    queryFn: () => api.get<{ repos: Repo[]; total: number }>(`/github/repos${otherUser ? `?userId=${otherUser}` : ''}`),
    enabled: !!otherUser || !!s?.connected,
  });

  const [prevSync, setPrevSync] = useState<string | undefined>();
  useEffect(() => {
    if (!s) return;
    if (prevSync === 'syncing' && s.syncStatus === 'ok') {
      qc.invalidateQueries({ queryKey: ['github', 'repos'] });
      qc.invalidateQueries({ queryKey: ['skills'] });
      qc.invalidateQueries({ queryKey: ['profile', 'me'] });
      toast.success(`Synced ${s.repoCount} repositories`);
    }
    if (prevSync === 'syncing' && s.syncStatus === 'error') toast.error(s.syncError || 'GitHub sync failed');
    setPrevSync(s.syncStatus);
  }, [s?.syncStatus]);

  useEffect(() => {
    const e = params.get('error');
    if (e) {
      toast.error(errorText[e] ?? 'GitHub connection failed');
      params.delete('error');
      setParams(params, { replace: true });
    }
    if (params.get('connected')) {
      toast.success('GitHub connected. Fetching your repositories…');
      params.delete('connected');
      setParams(params, { replace: true });
    }
  }, []);

  const skills = useQuery({ queryKey: ['skills', 'me'], queryFn: () => api.get<{ counts: { suggested: number } }>('/skills/me'), enabled: !otherUser && !!s?.connected });

  const [changing, setChanging] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const sync = useMutation({
    mutationFn: () => api.post<GithubStatus>('/github/sync'),
    onSuccess: (st) => qc.setQueryData(['github', 'status'], st),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const disconnect = useMutation({
    mutationFn: () => api.del<GithubStatus>('/github'),
    onSuccess: (st) => {
      qc.setQueryData(['github', 'status'], st);
      qc.removeQueries({ queryKey: ['github', 'repos'] });
      qc.invalidateQueries({ queryKey: ['skills'] });
      qc.invalidateQueries({ queryKey: ['profile', 'me'] });
      setConfirmDisconnect(false);
      toast.success('GitHub disconnected. Your manual and confirmed skills were kept.');
    },
  });
  const settings = useMutation({
    mutationFn: (includeForks: boolean) => api.patch<GithubStatus>('/github/settings', { includeForks }),
    onSuccess: (st) => qc.setQueryData(['github', 'status'], { ...st, syncStatus: 'syncing' }),
  });
  const feature = useMutation({
    mutationFn: (ids: string[]) => api.put<{ repos: Repo[]; total: number }>('/github/featured', { repoIds: ids }),
    onSuccess: (d) => {
      qc.setQueryData(['github', 'repos', 'me'], d);
      qc.invalidateQueries({ queryKey: ['profile', 'me'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // filters
  const [search, setSearch] = useState('');
  const [lang, setLang] = useState('');
  const [sort, setSort] = useState<'updated' | 'stars' | 'name'>('updated');
  const [showForks, setShowForks] = useState(true);
  const all = repos.data?.repos ?? [];
  const languages = useMemo(() => Array.from(new Set(all.map((r) => r.primaryLanguage).filter(Boolean) as string[])).sort(), [all]);
  const list = useMemo(() => {
    const t = search.trim().toLowerCase();
    return all
      .filter((r) => (showForks || !r.isFork) && (!lang || r.primaryLanguage === lang) && (!t || r.name.toLowerCase().includes(t) || r.description.toLowerCase().includes(t) || r.topics.some((x) => x.includes(t))))
      .sort((a, b) => (sort === 'stars' ? b.stars - a.stars : sort === 'name' ? a.name.localeCompare(b.name) : +new Date(b.updatedAt ?? 0) - +new Date(a.updatedAt ?? 0)));
  }, [all, search, lang, sort, showForks]);
  const featuredIds = all.filter((r) => r.featured).sort((a, b) => a.featuredOrder - b.featuredOrder).map((r) => r.id);

  if (!otherUser && status.isLoading) return <PageLoader />;
  if (!otherUser && status.isError) return <ErrorState message={errorMessage(status.error)} onRetry={() => status.refetch()} />;

  const repoGrid = (
    <>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search repositories, topics…" leftIcon={<Search className="size-4" />} className="lg:w-80" aria-label="Search repositories" />
        <Select value={lang} onChange={(e) => setLang(e.target.value)} className="lg:w-48" aria-label="Language"><option value="">All languages</option>{languages.map((l) => <option key={l}>{l}</option>)}</Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="lg:w-48" aria-label="Sort"><option value="updated">Recently updated</option><option value="stars">Most stars</option><option value="name">Name</option></Select>
        <label className="flex items-center gap-2 text-sm text-fg-2"><input type="checkbox" checked={showForks} onChange={(e) => setShowForks(e.target.checked)} className="accent-[var(--primary)]" /> Show forks</label>
        <span className="text-[13px] text-muted lg:ml-auto">{list.length} of {all.length} repositories{!otherUser && ` · ${featuredIds.length}/6 featured`}</span>
      </div>
      {repos.isLoading ? (
        <CardSkeletons count={6} />
      ) : repos.isError ? (
        <ErrorState message={errorMessage(repos.error)} onRetry={() => repos.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState icon={<Github />} title={s?.syncStatus === 'syncing' ? 'Fetching repositories…' : 'No public repositories'} body={s?.syncStatus === 'syncing' ? 'This usually takes a few seconds.' : 'Public repositories you own on GitHub will show up here.'} />
      ) : list.length === 0 ? (
        <EmptyState icon={<Search />} title="No repositories match" body="Try a different search or filter." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => (
            <RepoCard
              key={r.id}
              r={r}
              featuredDisabled={featuredIds.length >= 6}
              onToggleFeatured={otherUser ? undefined : () => feature.mutate(r.featured ? featuredIds.filter((i) => i !== r.id) : [...featuredIds, r.id])}
            />
          ))}
        </div>
      )}
    </>
  );

  if (otherUser) {
    return (
      <div>
        <PageHeader title="Repositories" subtitle={<Link to={`/u/${otherUser}`} className="text-primary">← Back to profile</Link>} />
        {repoGrid}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow={params.get('onboarding') ? 'Step 2 of 2' : undefined}
        title="GitHub repositories"
        subtitle="Show your real work. Every public repository you own is listed — with languages, topics, stars and forks — and used to suggest skills."
        actions={params.get('onboarding') ? <Link to="/dashboard" className="text-sm font-medium text-muted hover:text-fg">Skip for now →</Link> : undefined}
      />

      {!s?.connected || changing ? (
        <Card className="p-5 sm:p-6">
          {changing && <div className="mb-4 flex justify-between"><span className="font-display font-semibold">Change GitHub account</span><button className="text-sm text-muted" onClick={() => setChanging(false)}>Cancel</button></div>}
          <LinkForm oauthAvailable={!!s?.oauthAvailable || !!me?.features?.githubOAuth} onDone={() => setChanging(false)} />
        </Card>
      ) : (
        <>
          <Card className="mb-6 p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <Avatar name={s.login!} src={s.avatarUrl} size={60} />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={s.profileUrl} target="_blank" rel="noreferrer" className="font-display text-lg font-semibold hover:text-primary">{s.login}</a>
                    {s.verified ? <Badge tone="accent" icon={<BadgeCheck className="size-3" />}>Verified via GitHub sign-in</Badge> : <Badge>Linked by username</Badge>}
                  </div>
                  <p className="text-[13px] text-muted">
                    {s.publicRepos} public repos · {s.followers} followers ·{' '}
                    {s.syncStatus === 'syncing' ? <span className="text-primary">Syncing…</span> : s.lastSyncedAt ? <span title={formatDate(s.lastSyncedAt, true)}>synced {timeAgo(s.lastSyncedAt)}</span> : 'not synced yet'}
                  </p>
                  {s.nextAutoRefreshAt && s.syncStatus !== 'syncing' && <p className="text-[12px] text-muted">Auto-refreshes every 24 h (next after {formatDate(s.nextAutoRefreshAt, true)})</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" icon={<RefreshCw className={s.syncStatus === 'syncing' ? 'size-4 animate-spin' : 'size-4'} />} loading={sync.isPending} disabled={s.syncStatus === 'syncing'} onClick={() => sync.mutate()}>
                  {s.syncStatus === 'syncing' ? 'Syncing…' : 'Refresh'}
                </Button>
                <Button variant="ghost" onClick={() => setChanging(true)}>Change account</Button>
                <Button variant="ghost" className="text-danger" icon={<Unlink className="size-4" />} onClick={() => setConfirmDisconnect(true)}>Disconnect</Button>
              </div>
            </div>
            {s.syncStatus === 'error' && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {s.syncError || 'Last sync failed.'} Showing your last saved repositories.
              </div>
            )}
            <div className="mt-4 border-t border-line pt-4">
              <Toggle checked={!!s.includeForks} onChange={(v) => settings.mutate(v)} label="Use forked repositories for skill suggestions" description="Forks usually contain other people's code, so they are ignored by default." />
            </div>
          </Card>

          {(skills.data?.counts.suggested ?? 0) > 0 && (
            <Link to="/skills" className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary-soft to-accent-soft px-5 py-4 transition hover:border-primary">
              <span className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-white"><Sparkles className="size-5" /></span>
                <span>
                  <span className="block font-display font-semibold">{skills.data!.counts.suggested} skill suggestions from your repositories</span>
                  <span className="block text-[13px] text-muted">Review and confirm the ones you actually know — they'll count towards your matches.</span>
                </span>
              </span>
              <ArrowRight className="size-5 text-primary" />
            </Link>
          )}

          <div className="mb-3 flex items-center gap-2 text-[13px] text-muted"><Star className="size-4" /> Choose up to 6 repositories to feature on your profile.</div>
          {repoGrid}
        </>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={() => disconnect.mutate()}
        loading={disconnect.isPending}
        danger
        confirmLabel="Disconnect"
        title="Disconnect GitHub?"
        body="Your repositories and unconfirmed suggestions will be removed. Skills you added manually or confirmed stay on your profile."
      />
    </div>
  );
}
