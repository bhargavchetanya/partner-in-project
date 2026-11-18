import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, Briefcase, CheckCircle2, Circle, Compass, FileText, Github, Plus, Search, Sparkles, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useDocumentTitle, useUser } from '@/lib/hooks';
import type { FullProfile, NotificationDto, Opportunity, PersonCard } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';
import { Button, ButtonLink, Card, CardHeader, CardSkeletons, EmptyState, ErrorState, Skeleton, Stat } from '@/components/ui';
import { OpportunityCard, PersonCardView } from '@/components/cards';
import { Avatar } from '@/components/ui';

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const user = useUser()!;
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const profile = useQuery({ queryKey: ['profile', 'me'], queryFn: () => api.get<FullProfile>('/profiles/me') });
  const teams = useQuery({ queryKey: ['opportunities', 'recommended'], queryFn: () => api.get<{ items: Opportunity[]; total: number }>('/opportunities?sort=match&limit=4&mine=exclude') });
  const people = useQuery({ queryKey: ['discover', 'recommended'], queryFn: () => api.get<{ items: PersonCard[] }>('/discover?limit=4') });
  const notifs = useQuery({ queryKey: ['notifications', 'list'], queryFn: () => api.get<{ items: NotificationDto[]; unread: number }>('/notifications') });
  const mine = useQuery({ queryKey: ['opportunities', 'mine'], queryFn: () => api.get<{ led: Opportunity[]; memberOf: Opportunity[] }>('/opportunities/mine') });
  const apps = useQuery({ queryKey: ['applications', 'mine'], queryFn: () => api.get<{ items: { status: string }[] }>('/applications/mine') });

  const p = profile.data;
  const checklist = p
    ? [
        { done: !!(p.college && p.branch && p.year), label: 'Basic details', to: '/profile/edit' },
        { done: p.bio.length >= 20, label: 'Write a short bio', to: '/profile/edit' },
        { done: p.skills.filter((s) => s.status === 'confirmed').length >= 3, label: 'Add 3+ confirmed skills', to: '/skills' },
        { done: !!p.github, label: 'Link your GitHub', to: '/github' },
        { done: p.preferredRoles.length > 0 && p.interests.length > 0, label: 'Roles & interests', to: '/profile/edit' },
        { done: !!p.avatarUrl, label: 'Add a profile photo', to: '/profile/edit' },
      ]
    : [];
  const pendingLed = mine.data?.led.reduce((s, o) => s + (o.pendingApplications ?? 0), 0) ?? 0;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-line">
        <div className="absolute inset-0 glow" />
        <div className="absolute inset-0 bg-grid opacity-50" />
        <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h1 className="mt-1 font-display text-3xl font-semibold sm:text-[34px]">Hey {user.name.split(' ')[0]} 👋</h1>
            <p className="mt-2 max-w-lg text-fg-2">Here are teams and people that fit your skills right now.</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              nav(`/opportunities?q=${encodeURIComponent(q)}`);
            }}
            className="flex w-full max-w-lg items-center gap-2 rounded-2xl border border-line bg-surface/80 p-2 backdrop-blur"
            role="search"
          >
            <Search className="ml-2 size-5 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hackathons, projects, skills…" className="h-10 min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-muted focus:outline-none" aria-label="Search opportunities" />
            <Button type="submit">Search</Button>
          </form>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Profile strength" value={`${p?.completeness ?? user.completeness}%`} icon={<Sparkles />} tone="primary" hint={<Link to="/profile" className="text-primary">View profile</Link>} />
        <Stat label="My teams" value={(mine.data?.led.filter((o) => ['open', 'closed', 'pending_approval'].includes(o.status)).length ?? 0) + (mine.data?.memberOf.length ?? 0)} icon={<UsersRound />} tone="accent" hint={<Link to="/teams" className="text-primary">Manage teams</Link>} />
        <Stat label="My applications" value={apps.data?.items.filter((a) => a.status === 'pending').length ?? 0} icon={<FileText />} tone="warn" hint="pending decision" />
        <Stat label="To review" value={pendingLed} icon={<Bell />} tone="danger" hint="applications for your posts" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8 min-w-0">
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold">Recommended teams</h2>
              <Link to="/opportunities" className="flex items-center gap-1 text-sm font-medium text-primary">See all <ArrowRight className="size-4" /></Link>
            </div>
            {teams.isLoading ? (
              <CardSkeletons count={2} className="xl:grid-cols-2" />
            ) : teams.isError ? (
              <ErrorState message="Couldn't load recommendations" onRetry={() => teams.refetch()} />
            ) : teams.data!.items.length === 0 ? (
              <EmptyState icon={<Briefcase />} title="No open teams yet" body="Be the first — post your hackathon or project and recruit teammates." action={<ButtonLink to="/opportunities/new" icon={<Plus className="size-4" />}>Create a team post</ButtonLink>} />
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">{teams.data!.items.map((o, i) => <OpportunityCard key={o.id} o={o} index={i} />)}</div>
            )}
          </section>

          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold">People you might team up with</h2>
              <Link to="/discover" className="flex items-center gap-1 text-sm font-medium text-primary">Discover <ArrowRight className="size-4" /></Link>
            </div>
            {people.isLoading ? (
              <CardSkeletons count={2} className="xl:grid-cols-2" />
            ) : people.isError ? (
              <ErrorState message="Couldn't load collaborators" onRetry={() => people.refetch()} />
            ) : people.data!.items.length === 0 ? (
              <EmptyState icon={<Compass />} title="No students to show yet" body="Invite friends from other colleges to join." />
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">{people.data!.items.map((x, i) => <PersonCardView key={x.id} p={x} index={i} showDetails={false} actions={<ButtonLink to={`/u/${x.id}`} size="sm" variant="secondary">View profile</ButtonLink>} />)}</div>
            )}
            {p && p.lookingForSkills.length === 0 && (
              <p className="mt-3 text-[13px] text-muted">Tip: add “Skills I want in teammates” to <Link to="/profile/edit" className="text-primary">your profile</Link> to sharpen these matches.</p>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Complete your profile" subtitle="Strong profiles get better matches" icon={<Sparkles className="size-4" />} />
            <div className="p-5 pt-4">
              {profile.isLoading ? (
                <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-5" />)}</div>
              ) : (
                <>
                  <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${p?.completeness ?? 0}%` }} />
                  </div>
                  <ul className="space-y-2.5">
                    {checklist.map((c) => (
                      <li key={c.label}>
                        <Link to={c.to} className="flex items-center gap-2.5 text-[13.5px]">
                          {c.done ? <CheckCircle2 className="size-4.5 text-accent" /> : <Circle className="size-4.5 text-muted" />}
                          <span className={cn(c.done ? 'text-muted line-through' : 'text-fg hover:text-primary')}>{c.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {!p?.github && <ButtonLink to="/github" variant="secondary" size="sm" className="mt-4 w-full" icon={<Github className="size-4" />}>Link GitHub</ButtonLink>}
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Latest notifications" icon={<Bell className="size-4" />} action={<Link to="/notifications" className="text-[13px] font-medium text-primary">All</Link>} />
            <div className="p-3 pt-3">
              {notifs.isLoading ? (
                <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : notifs.data!.items.length === 0 ? (
                <p className="px-2 py-6 text-center text-[13px] text-muted">You're all caught up.</p>
              ) : (
                notifs.data!.items.slice(0, 5).map((n) => (
                  <Link key={n.id} to={n.link || '/notifications'} className="flex gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-fg">{n.title}</span>
                      <span className="block text-[11.5px] text-muted">{timeAgo(n.createdAt)}</span>
                    </span>
                  </Link>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Your teams" icon={<UsersRound className="size-4" />} action={<Link to="/opportunities/new" className="text-[13px] font-medium text-primary">+ New</Link>} />
            <div className="p-3 pt-3">
              {mine.isLoading ? (
                <Skeleton className="m-2 h-12" />
              ) : [...(mine.data?.led ?? []), ...(mine.data?.memberOf ?? [])].length === 0 ? (
                <p className="px-2 py-6 text-center text-[13px] text-muted">No teams yet. <Link to="/opportunities" className="text-primary">Find one</Link> or <Link to="/opportunities/new" className="text-primary">start one</Link>.</p>
              ) : (
                [...(mine.data?.led ?? []), ...(mine.data?.memberOf ?? [])].slice(0, 5).map((o) => (
                  <Link key={o.id} to={o.isLeader ? `/opportunities/${o.id}/team` : `/opportunities/${o.id}/team`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
                    <Avatar name={o.title} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{o.title}</span>
                      <span className="block text-[11.5px] text-muted">{o.isLeader ? 'Leader' : 'Member'} · {o.memberCount + 1}/{o.teamSize}</span>
                    </span>
                    {(o.pendingApplications ?? 0) > 0 && <span className="rounded-full bg-primary px-2 text-[11px] font-semibold text-white">{o.pendingApplications}</span>}
                  </Link>
                ))
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
