import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Compass, Filter, MessageSquare, RotateCcw, Search, SlidersHorizontal, UserPlus, X } from 'lucide-react';
import { api, errorMessage, qs } from '@/lib/api';
import { useCatalog, useDebounced, useDocumentTitle } from '@/lib/hooks';
import type { Opportunity, PersonCard } from '@/lib/types';
import { cn, YEAR_LABELS } from '@/lib/utils';
import { Button, ButtonLink, Card, CardSkeletons, Chip, EmptyState, ErrorState, Field, Input, PageHeader, Select } from '@/components/ui';
import { ChipSelect, SkillPicker } from '@/components/pickers';
import { PersonCardView } from '@/components/cards';

interface DiscoverResponse {
  context: { type: string; label: string; id?: string; missingSkills?: string[] };
  items: PersonCard[];
  total: number;
  page: number;
  pages: number;
}

export default function Discover() {
  useDocumentTitle('Discover collaborators');
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { catalog, skillName, roleName, interestName } = useCatalog();
  const [showFilters, setShowFilters] = useState(false);
  const get = (k: string) => params.get(k) ?? '';
  const getList = (k: string) => (params.get(k) ? params.get(k)!.split(',').filter(Boolean) : []);
  const setParam = (k: string, v: string | string[]) => {
    const next = new URLSearchParams(params);
    const val = Array.isArray(v) ? v.join(',') : v;
    if (val) next.set(k, val);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const [q, setQ] = useState(get('q'));
  const dq = useDebounced(q, 350);
  const [college, setCollege] = useState(get('college'));
  const dcollege = useDebounced(college, 400);

  const filters = {
    q: dq,
    skills: getList('skills'),
    interests: getList('interests'),
    roles: getList('roles'),
    college: dcollege,
    years: getList('years'),
    minHours: get('minHours'),
    context: get('context') || 'profile',
    sort: get('sort') || 'match',
    page: get('page') || '1',
    limit: 12,
  };
  const query = useQuery({
    queryKey: ['discover', filters],
    queryFn: () => api.get<DiscoverResponse>(`/discover${qs(filters)}`),
    placeholderData: keepPreviousData,
  });
  const mine = useQuery({ queryKey: ['opportunities', 'mine'], queryFn: () => api.get<{ led: Opportunity[] }>('/opportunities/mine') });
  const myTeams = (mine.data?.led ?? []).filter((o) => ['open', 'closed', 'pending_approval'].includes(o.status));

  const connect = useMutation({
    mutationFn: (userId: string) => api.post('/connections/requests', { userId }),
    onSuccess: () => { toast.success('Collaboration request sent'); qc.invalidateQueries({ queryKey: ['discover'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const message = useMutation({
    mutationFn: (userId: string) => api.post<{ id: string }>('/conversations/direct', { userId }),
    onSuccess: (c) => nav(`/messages/${c.id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const activeCount = filters.skills.length + filters.interests.length + filters.roles.length + filters.years.length + (filters.college ? 1 : 0) + (filters.minHours ? 1 : 0);
  const activeChips = useMemo(
    () => [
      ...filters.skills.map((s) => ({ k: 'skills', v: s, label: skillName(s) })),
      ...filters.roles.map((s) => ({ k: 'roles', v: s, label: roleName(s) })),
      ...filters.interests.map((s) => ({ k: 'interests', v: s, label: interestName(s) })),
      ...filters.years.map((s) => ({ k: 'years', v: s, label: YEAR_LABELS[Number(s)] })),
    ],
    [params, catalog],
  );

  const filterPanel = (
    <div className="space-y-5">
      <Field label="Skills (has all)">
        <SkillPicker value={filters.skills} onChange={(v) => setParam('skills', v)} placeholder="e.g. React, Docker" />
      </Field>
      <Field label="Preferred role">
        <ChipSelect options={(catalog?.roles ?? []).map((r) => ({ value: r.slug, label: r.name }))} value={filters.roles} onChange={(v) => setParam('roles', v)} />
      </Field>
      <Field label="Interests">
        <ChipSelect options={(catalog?.interests ?? []).map((r) => ({ value: r.slug, label: r.name }))} value={filters.interests} onChange={(v) => setParam('interests', v)} />
      </Field>
      <Field label="College">
        <Input value={college} onChange={(e) => { setCollege(e.target.value); setParam('college', e.target.value); }} placeholder="e.g. Thapar, IIT" />
      </Field>
      <Field label="Academic year">
        <ChipSelect options={Object.entries(YEAR_LABELS).map(([v, l]) => ({ value: v, label: l }))} value={filters.years} onChange={(v) => setParam('years', v)} />
      </Field>
      <Field label="Availability">
        <Select value={filters.minHours} onChange={(e) => setParam('minHours', e.target.value)}>
          <option value="">Any</option>
          {[4, 8, 12, 16, 20].map((h) => <option key={h} value={h}>{h}+ hours/week</option>)}
        </Select>
      </Field>
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => { setCollege(''); setQ(''); setParams(new URLSearchParams(), { replace: true }); }}>
          Clear all filters
        </Button>
      )}
    </div>
  );

  const data = query.data;
  return (
    <div>
      <PageHeader title="Discover collaborators" subtitle="Search students across colleges. Every result matches all of your filters and shows how well they fit." />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setParam('q', e.target.value); }} placeholder="Search by name or skill — try “React” or “Ananya”" leftIcon={<Search className="size-4" />} className="h-12 text-[15px]" aria-label="Search students" />
        <div className="flex min-w-0 gap-2 [&>*]:min-w-0 [&>select]:flex-1 lg:[&>select]:flex-none">
          <Select value={filters.context} onChange={(e) => setParam('context', e.target.value === 'profile' ? '' : e.target.value)} className="h-12 lg:w-64" aria-label="Match against">
            <option value="profile">Match against: my profile</option>
            {myTeams.map((t) => <option key={t.id} value={t.id}>Match against: {t.title}</option>)}
          </Select>
          <Select value={filters.sort} onChange={(e) => setParam('sort', e.target.value === 'match' ? '' : e.target.value)} className="h-12 lg:w-44" aria-label="Sort">
            <option value="match">Best match</option>
            <option value="availability">Most available</option>
            <option value="name">Name</option>
          </Select>
          <Button variant="secondary" className="h-12 lg:hidden" onClick={() => setShowFilters(true)} icon={<SlidersHorizontal className="size-4" />}>
            {activeCount ? activeCount : ''}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="hidden lg:block">
          <Card className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto scrollbar-thin p-5">
            <div className="mb-4 flex items-center gap-2 font-display font-semibold"><Filter className="size-4" /> Filters</div>
            {filterPanel}
          </Card>
        </aside>

        <section className="min-w-0">
          {data?.context.type === 'team' && (
            <div className="mb-4 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3 text-[13.5px]">
              Ranking for <b>{data.context.label}</b> by its missing skills:{' '}
              {data.context.missingSkills?.length ? data.context.missingSkills.map(skillName).join(', ') : 'none — your team covers everything, ranking by all required skills'}
            </div>
          )}
          {activeChips.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {activeChips.map((c) => <Chip key={c.k + c.v} tone="primary" onRemove={() => setParam(c.k, getList(c.k).filter((x) => x !== c.v))}>{c.label}</Chip>)}
            </div>
          )}
          <div className="mb-3 flex items-center justify-between text-[13px] text-muted">
            <span>{data ? `${data.total} student${data.total === 1 ? '' : 's'} found` : 'Searching…'}</span>
            {query.isFetching && !query.isLoading && <span>Updating…</span>}
          </div>
          {query.isLoading ? (
            <CardSkeletons count={6} className="xl:grid-cols-2 2xl:grid-cols-3" />
          ) : query.isError ? (
            <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
          ) : data!.items.length === 0 ? (
            <EmptyState icon={<Compass />} title="No students match these filters" body="Try removing a filter or searching for a different skill. Your search and filters are kept so you can adjust them." />
          ) : (
            <>
              <div className={cn('grid gap-4 xl:grid-cols-2 2xl:grid-cols-3', query.isFetching && 'opacity-70 transition')}>
                {data!.items.map((p, i) => (
                  <PersonCardView
                    key={p.id}
                    p={p}
                    index={i}
                    actions={
                      <>
                        <ButtonLink to={`/u/${p.id}`} size="sm" variant="secondary">View profile</ButtonLink>
                        {p.connection === 'connected' ? (
                          <Button size="sm" variant="ghost" icon={<MessageSquare className="size-3.5" />} onClick={() => message.mutate(p.id)}>Message</Button>
                        ) : p.connection === 'pending_out' ? (
                          <Button size="sm" variant="ghost" disabled icon={<Check className="size-3.5" />}>Requested</Button>
                        ) : p.connection === 'pending_in' ? (
                          <ButtonLink to="/connections" size="sm" variant="ghost">Respond</ButtonLink>
                        ) : (
                          <Button size="sm" variant="ghost" icon={<UserPlus className="size-3.5" />} loading={connect.isPending && connect.variables === p.id} onClick={() => connect.mutate(p.id)}>Connect</Button>
                        )}
                      </>
                    }
                  />
                ))}
              </div>
              {data!.pages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  <Button variant="secondary" size="sm" disabled={data!.page <= 1} onClick={() => setParam('page', String(data!.page - 1))}>Previous</Button>
                  <span className="px-3 text-sm text-muted">Page {data!.page} of {data!.pages}</span>
                  <Button variant="secondary" size="sm" disabled={data!.page >= data!.pages} onClick={() => setParam('page', String(data!.page + 1))}>Next</Button>
                </div>
              )}
            </>
          )}
          <p className="mt-6 text-center text-[12.5px] text-muted">Can't find who you need? <Link to="/opportunities/new" className="text-primary">Post a team opportunity</Link> and let them find you.</p>
        </section>
      </div>

      {showFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowFilters(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-bg p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-lg font-semibold">Filters</span>
              <button onClick={() => setShowFilters(false)} className="rounded-lg p-2 hover:bg-surface-2" aria-label="Close filters"><X className="size-5" /></button>
            </div>
            {filterPanel}
            <Button className="mt-6 w-full" onClick={() => setShowFilters(false)}>Show {data?.total ?? ''} results</Button>
          </div>
        </div>
      )}
    </div>
  );
}
