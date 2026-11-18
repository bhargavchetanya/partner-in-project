import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Briefcase, Filter, Plus, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { api, errorMessage, qs } from '@/lib/api';
import { useCatalog, useDebounced, useDocumentTitle } from '@/lib/hooks';
import type { Opportunity } from '@/lib/types';
import { cn, TYPE_LABEL } from '@/lib/utils';
import { Button, ButtonLink, Card, CardSkeletons, EmptyState, ErrorState, Field, Input, PageHeader, Select } from '@/components/ui';
import { ChipSelect, SkillPicker } from '@/components/pickers';
import { OpportunityCard } from '@/components/cards';

export default function Opportunities() {
  useDocumentTitle('Team Finder');
  const [params, setParams] = useSearchParams();
  const { catalog } = useCatalog();
  const [mobileFilters, setMobileFilters] = useState(false);
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
  const [event, setEvent] = useState(get('event'));
  const dq = useDebounced(q, 350);
  const devent = useDebounced(event, 400);
  const filters = {
    q: dq,
    event: devent,
    skills: getList('skills'),
    role: get('role'),
    domains: getList('domains'),
    type: get('type'),
    deadlineBefore: get('deadlineBefore'),
    sort: get('sort') || 'match',
    page: get('page') || '1',
    limit: 12,
  };
  const query = useQuery({
    queryKey: ['opportunities', 'browse', filters],
    queryFn: () => api.get<{ items: Opportunity[]; total: number; page: number; pages: number }>(`/opportunities${qs(filters)}`),
    placeholderData: keepPreviousData,
  });
  const active = filters.skills.length + filters.domains.length + (filters.role ? 1 : 0) + (filters.type ? 1 : 0) + (filters.deadlineBefore ? 1 : 0) + (filters.event ? 1 : 0);

  const panel = (
    <div className="space-y-5">
      <Field label="Event / hackathon">
        <Input value={event} onChange={(e) => { setEvent(e.target.value); setParam('event', e.target.value); }} placeholder="e.g. Smart India Hackathon" />
      </Field>
      <Field label="Type">
        <Select value={filters.type} onChange={(e) => setParam('type', e.target.value)}>
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Requires skills (all of)">
        <SkillPicker value={filters.skills} onChange={(v) => setParam('skills', v)} placeholder="e.g. React" />
      </Field>
      <Field label="Open role">
        <Select value={filters.role} onChange={(e) => setParam('role', e.target.value)}>
          <option value="">Any role</option>
          {(catalog?.roles ?? []).map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
        </Select>
      </Field>
      <Field label="Domain">
        <ChipSelect options={(catalog?.interests ?? []).map((r) => ({ value: r.slug, label: r.name }))} value={filters.domains} onChange={(v) => setParam('domains', v)} />
      </Field>
      <Field label="Deadline before">
        <Input type="date" value={filters.deadlineBefore} onChange={(e) => setParam('deadlineBefore', e.target.value)} />
      </Field>
      {active > 0 && (
        <Button variant="ghost" size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => { setQ(''); setEvent(''); setParams(new URLSearchParams(), { replace: true }); }}>Clear filters</Button>
      )}
    </div>
  );

  const data = query.data;
  return (
    <div>
      <PageHeader
        title="Team Finder"
        subtitle="Open hackathon, project and research teams — ranked by how well you fit. Apply in a couple of clicks."
        actions={<ButtonLink to="/opportunities/new" icon={<Plus className="size-4" />}>Create team post</ButtonLink>}
      />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setParam('q', e.target.value); }} placeholder="Search titles, events, ideas or a skill…" leftIcon={<Search className="size-4" />} className="h-12 text-[15px]" aria-label="Search opportunities" />
        <div className="flex min-w-0 gap-2 [&>*]:min-w-0 [&>select]:flex-1 lg:[&>select]:flex-none">
          <Select value={filters.sort} onChange={(e) => setParam('sort', e.target.value === 'match' ? '' : e.target.value)} className="h-12 lg:w-48" aria-label="Sort">
            <option value="match">Best match</option>
            <option value="deadline">Closing soon</option>
            <option value="new">Newest</option>
          </Select>
          <Button variant="secondary" className="h-12 lg:hidden" icon={<SlidersHorizontal className="size-4" />} onClick={() => setMobileFilters(true)}>{active || ''}</Button>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="hidden lg:block">
          <Card className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto scrollbar-thin p-5">
            <div className="mb-4 flex items-center gap-2 font-display font-semibold"><Filter className="size-4" /> Filters</div>
            {panel}
          </Card>
        </aside>
        <section className="min-w-0">
          <div className="mb-3 text-[13px] text-muted">{data ? `${data.total} open team${data.total === 1 ? '' : 's'}` : 'Searching…'}</div>
          {query.isLoading ? (
            <CardSkeletons count={6} className="xl:grid-cols-2" />
          ) : query.isError ? (
            <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
          ) : data!.items.length === 0 ? (
            <EmptyState icon={<Briefcase />} title="No open teams match" body="Adjust your filters, or start your own team and let others apply." action={<ButtonLink to="/opportunities/new" icon={<Plus className="size-4" />}>Create team post</ButtonLink>} />
          ) : (
            <>
              <div className={cn('grid gap-4 xl:grid-cols-2', query.isFetching && 'opacity-70')}>{data!.items.map((o, i) => <OpportunityCard key={o.id} o={o} index={i} />)}</div>
              {data!.pages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  <Button variant="secondary" size="sm" disabled={data!.page <= 1} onClick={() => setParam('page', String(data!.page - 1))}>Previous</Button>
                  <span className="px-3 text-sm text-muted">Page {data!.page} of {data!.pages}</span>
                  <Button variant="secondary" size="sm" disabled={data!.page >= data!.pages} onClick={() => setParam('page', String(data!.page + 1))}>Next</Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      {mobileFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileFilters(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-bg p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-lg font-semibold">Filters</span>
              <button onClick={() => setMobileFilters(false)} className="rounded-lg p-2 hover:bg-surface-2" aria-label="Close filters"><X className="size-5" /></button>
            </div>
            {panel}
            <Button className="mt-6 w-full" onClick={() => setMobileFilters(false)}>Show {data?.total ?? ''} results</Button>
          </div>
        </div>
      )}
    </div>
  );
}
