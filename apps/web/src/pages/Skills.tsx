import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronDown, Github, Info, PenLine, Plus, RotateCcw, Search, Sparkles, Trash2, X } from 'lucide-react';
import { PROFICIENCY_LEVELS } from '@pip/shared';
import { api, errorMessage } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { cn, timeAgo } from '@/lib/utils';
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorState, Input, PageHeader, PageLoader, Select, Tabs } from '@/components/ui';
import { SkillPicker } from '@/components/pickers';

interface SkillRow {
  id: string;
  skill: string;
  name: string;
  category: string;
  source: 'manual' | 'github' | 'both';
  status: 'confirmed' | 'suggested' | 'rejected';
  proficiency: string;
  detectedOnGithub: boolean;
  repoCount: number;
  codeShare: number | null;
  lastUsed: string | null;
  evidence: { repo: string; signal: string; detail: string }[];
  evidenceSummary: string;
}
interface SkillsResponse {
  skills: SkillRow[];
  counts: { confirmed: number; suggested: number; rejected: number; manual: number; github: number };
  categories: { slug: string; name: string; order: number }[];
}

function SourceBadge({ s }: { s: SkillRow }) {
  if (s.source === 'both') return <Badge tone="primary" icon={<Github className="size-3" />}>Manual + GitHub</Badge>;
  if (s.source === 'github') return <Badge tone="accent" icon={<Github className="size-3" />}>From GitHub</Badge>;
  return <Badge icon={<PenLine className="size-3" />}>Manual</Badge>;
}

export default function Skills() {
  useDocumentTitle('Skills');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['skills', 'me'], queryFn: () => api.get<SkillsResponse>('/skills/me') });
  const [tab, setTab] = useState<'confirmed' | 'suggested' | 'rejected'>('confirmed');
  const [search, setSearch] = useState('');
  const [newSkills, setNewSkills] = useState<string[]>([]);
  const [newLevel, setNewLevel] = useState('intermediate');
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);

  const update = (data: SkillsResponse) => {
    qc.setQueryData(['skills', 'me'], data);
    qc.invalidateQueries({ queryKey: ['profile', 'me'] });
    qc.invalidateQueries({ queryKey: ['me'] });
  };
  const add = useMutation({
    mutationFn: async () => {
      let last: SkillsResponse | null = null;
      const failed: string[] = [];
      for (const name of newSkills) {
        try {
          last = await api.post<SkillsResponse>('/skills/me', { name, proficiency: newLevel });
        } catch (e) {
          failed.push(`${name}: ${errorMessage(e)}`);
        }
      }
      return { last, failed };
    },
    onSuccess: ({ last, failed }) => {
      if (last) update(last);
      if (failed.length) toast.error(failed.join('\n'));
      else toast.success(newSkills.length > 1 ? `${newSkills.length} skills added` : 'Skill added');
      setNewSkills([]);
      setTab('confirmed');
    },
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, string> }) => api.patch<SkillsResponse>(`/skills/me/${id}`, body),
    onSuccess: update,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del<SkillsResponse>(`/skills/me/${id}`),
    onSuccess: (d) => { update(d); toast.success('Skill removed'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const bulk = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: 'confirmed' | 'rejected' }) => api.post<SkillsResponse>('/skills/me/bulk', { ids, status }),
    onSuccess: (d, v) => { update(d); toast.success(v.status === 'confirmed' ? `Confirmed ${v.ids.length} skills` : `Rejected ${v.ids.length} suggestions`); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const data = q.data;
  const groups = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    const rows = data.skills.filter((s) => s.status === tab && (!term || s.name.toLowerCase().includes(term) || s.skill.includes(term)));
    const map = new Map<string, SkillRow[]>();
    for (const r of rows) map.set(r.category, [...(map.get(r.category) ?? []), r]);
    const order = new Map(data.categories.map((c) => [c.slug, c]));
    return [...map.entries()]
      .sort((a, b) => (order.get(a[0])?.order ?? 99) - (order.get(b[0])?.order ?? 99))
      .map(([cat, list]) => ({ cat, name: order.get(cat)?.name ?? 'Other', list }));
  }, [data, tab, search]);

  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = data!;
  const visibleIds = groups.flatMap((g) => g.list.map((s) => s.id));
  const existing = d.skills.filter((s) => s.status === 'confirmed').map((s) => s.skill);

  return (
    <div>
      <PageHeader
        title="Skills"
        subtitle="Only confirmed skills appear on your profile and count towards match scores. GitHub detections are suggestions until you confirm them."
        actions={<ButtonLink to="/github" variant="secondary" icon={<Github className="size-4" />}>GitHub sync</ButtonLink>}
      />

      <Card className="mb-6 p-5">
        <div className="mb-3 flex items-center gap-2 font-display font-semibold"><Plus className="size-4 text-primary" /> Add skills manually</div>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <SkillPicker value={newSkills} onChange={setNewSkills} exclude={existing} placeholder="Type a skill, framework, tool…" max={15} />
          <Select value={newLevel} onChange={(e) => setNewLevel(e.target.value)} aria-label="Proficiency">
            {PROFICIENCY_LEVELS.map((l) => <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>)}
          </Select>
          <Button disabled={newSkills.length === 0} loading={add.isPending} onClick={() => add.mutate()}>Add {newSkills.length > 1 ? `${newSkills.length} skills` : 'skill'}</Button>
        </div>
        <p className="mt-2 text-[12px] text-muted">Can't find it? Type the name and choose “Add …” — new skills go into the catalogue under “Other”.</p>
      </Card>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'confirmed', label: `Confirmed (${d.counts.confirmed})` },
            { value: 'suggested', label: 'Suggestions', count: d.counts.suggested },
            { value: 'rejected', label: `Rejected (${d.counts.rejected})` },
          ]}
        />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your skills" leftIcon={<Search className="size-4" />} className="sm:w-64" aria-label="Search skills" />
      </div>

      {tab === 'suggested' && visibleIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary-soft px-4 py-3">
          <p className="flex items-center gap-2 text-[13.5px] text-fg"><Info className="size-4 text-primary" /> These were detected in your public repositories. Confirm only what you can actually work with.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => bulk.mutate({ ids: visibleIds, status: 'rejected' })} loading={bulk.isPending && bulk.variables?.status === 'rejected'}>Reject all</Button>
            <Button size="sm" onClick={() => bulk.mutate({ ids: visibleIds, status: 'confirmed' })} loading={bulk.isPending && bulk.variables?.status === 'confirmed'}>Confirm all {visibleIds.length}</Button>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        tab === 'confirmed' ? (
          <EmptyState icon={<Sparkles />} title={search ? 'No matching skills' : 'No confirmed skills yet'} body={search ? 'Try another search.' : 'Add skills above, or link GitHub to get suggestions you can confirm in one click.'} action={!search && <ButtonLink to="/github" icon={<Github className="size-4" />}>Link GitHub</ButtonLink>} />
        ) : tab === 'suggested' ? (
          <EmptyState icon={<Github />} title="No suggestions right now" body={<>Suggestions come from your GitHub repositories. <Link to="/github" className="text-primary">Sync GitHub</Link> to refresh them.</>} />
        ) : (
          <EmptyState icon={<X />} title="Nothing rejected" body="Suggestions you reject are kept here so they won't be suggested again." />
        )
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <Card key={g.cat} className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-[15px] font-semibold">{g.name}</h3>
                <span className="text-[12px] text-muted">{g.list.length}</span>
              </div>
              <ul className="divide-y divide-line">
                {g.list.map((s) => (
                  <li key={s.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{s.name}</span>
                          <SourceBadge s={s} />
                          {s.status === 'confirmed' && s.source !== 'manual' && !s.detectedOnGithub && <Badge tone="warn">No longer detected on GitHub</Badge>}
                        </div>
                        {s.detectedOnGithub && (
                          <button onClick={() => setOpenEvidence(openEvidence === s.id ? null : s.id)} className="mt-1 flex items-center gap-1 text-[12.5px] text-muted hover:text-fg">
                            {s.evidenceSummary}{s.lastUsed ? ` · last used ${timeAgo(s.lastUsed)}` : ''}
                            <ChevronDown className={cn('size-3.5 transition', openEvidence === s.id && 'rotate-180')} />
                          </button>
                        )}
                      </div>
                      {tab === 'confirmed' && (
                        <>
                          <Select value={s.proficiency} onChange={(e) => patch.mutate({ id: s.id, body: { proficiency: e.target.value } })} className="h-9 w-[150px] text-[13px]" aria-label={`Proficiency for ${s.name}`}>
                            {PROFICIENCY_LEVELS.map((l) => <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>)}
                          </Select>
                          <Button size="sm" variant="ghost" className="text-danger" onClick={() => remove.mutate(s.id)} aria-label={`Remove ${s.name}`}><Trash2 className="size-4" /></Button>
                        </>
                      )}
                      {tab === 'suggested' && (
                        <>
                          <Select defaultValue="intermediate" id={`lvl-${s.id}`} className="h-9 w-[150px] text-[13px]" aria-label={`Proficiency for ${s.name}`}>
                            {PROFICIENCY_LEVELS.map((l) => <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>)}
                          </Select>
                          <Button size="sm" variant="secondary" icon={<X className="size-3.5" />} onClick={() => patch.mutate({ id: s.id, body: { status: 'rejected' } })}>Reject</Button>
                          <Button size="sm" icon={<Check className="size-3.5" />} onClick={() => patch.mutate({ id: s.id, body: { status: 'confirmed', proficiency: (document.getElementById(`lvl-${s.id}`) as HTMLSelectElement)?.value ?? 'intermediate' } })}>Confirm</Button>
                        </>
                      )}
                      {tab === 'rejected' && (
                        <Button size="sm" variant="secondary" icon={<RotateCcw className="size-3.5" />} onClick={() => patch.mutate({ id: s.id, body: { status: 'suggested' } })}>Restore as suggestion</Button>
                      )}
                    </div>
                    {openEvidence === s.id && s.evidence.length > 0 && (
                      <div className="mt-2 rounded-xl bg-surface-2 p-3 text-[12.5px]">
                        {s.evidence.map((e, i) => (
                          <div key={i} className="flex gap-2 py-0.5">
                            <span className="font-mono text-fg-2">{e.repo}</span>
                            <span className="text-muted">— {e.signal}: {e.detail}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
