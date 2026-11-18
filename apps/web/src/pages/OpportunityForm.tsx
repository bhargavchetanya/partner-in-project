import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Info, Plus, Trash2 } from 'lucide-react';
import { opportunitySchema } from '@pip/shared';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { useCatalog, useDocumentTitle, useUser } from '@/lib/hooks';
import type { OpportunityDetail } from '@/lib/types';
import { TYPE_LABEL } from '@/lib/utils';
import { Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, PageLoader, Select, Textarea } from '@/components/ui';
import { ChipSelect, SkillPicker } from '@/components/pickers';

interface Form {
  title: string;
  description: string;
  eventName: string;
  type: string;
  domains: string[];
  deadline: string;
  teamSize: number;
  commitmentHours: number;
  requiredSkills: string[];
  openRoles: { role: string; slots: number }[];
  location: string;
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function OpportunityForm() {
  const { id } = useParams();
  const editing = !!id;
  useDocumentTitle(editing ? 'Edit team post' : 'Create team post');
  const user = useUser()!;
  const nav = useNavigate();
  const qc = useQueryClient();
  const { catalog, roleName } = useCatalog();
  const existing = useQuery({ queryKey: ['opportunity', id], queryFn: () => api.get<OpportunityDetail>(`/opportunities/${id}`), enabled: editing });
  const [f, setF] = useState<Form | null>(
    editing
      ? null
      : {
          title: '', description: '', eventName: '', type: 'hackathon', domains: [], deadline: toLocalInput(new Date(Date.now() + 7 * 86400_000)),
          teamSize: 4, commitmentHours: 8, requiredSkills: [], openRoles: [{ role: '', slots: 1 }], location: 'Remote',
        },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!existing.data || f) return;
    const o = existing.data;
    setF({
      title: o.title, description: o.description, eventName: o.eventName, type: o.type, domains: o.domains, deadline: toLocalInput(new Date(o.deadline)),
      teamSize: o.teamSize, commitmentHours: o.commitmentHours, requiredSkills: o.requiredSkills, openRoles: o.openRoles.map((r) => ({ role: r.role, slots: r.slots })), location: o.location,
    });
  }, [existing.data, f]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (editing ? api.put<{ id: string; status: string }>(`/opportunities/${id}`, body) : api.post<{ id: string; status: string }>('/opportunities', body)),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      qc.invalidateQueries({ queryKey: ['opportunity', r.id] });
      toast.success(editing ? (r.status === 'pending_approval' ? 'Post updated and resubmitted for approval' : 'Post updated') : 'Post submitted! An admin will review it shortly.');
      nav(`/opportunities/${r.id}`);
    },
    onError: (e) => {
      setErrors(fieldErrors(e));
      toast.error(errorMessage(e));
    },
  });

  if (editing && existing.isLoading) return <PageLoader />;
  if (editing && existing.isError) return <ErrorState message={errorMessage(existing.error)} />;
  if (!f) return <PageLoader />;
  if (editing && existing.data && !existing.data.isLeader) return <ErrorState message="Only the team leader can edit this post." />;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s!, [k]: v }));
  const totalSlots = f.openRoles.reduce((s, r) => s + (Number(r.slots) || 0), 0);
  const filledByRole = new Map(existing.data?.openRoles.map((r) => [r.role, r.filled]) ?? []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = { ...f, deadline: new Date(f.deadline).toISOString(), openRoles: f.openRoles.filter((r) => r.role) };
    const r = opportunitySchema.safeParse(body);
    const errs: Record<string, string> = {};
    if (!r.success) for (const i of r.error.issues) errs[String(i.path[0])] ??= i.message;
    if (f.openRoles.some((x) => !x.role)) errs.openRoles ??= 'Choose a role for every row';
    if (new Date(f.deadline).getTime() < Date.now() + 3600_000) errs.deadline = 'Deadline must be at least an hour from now';
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error('Please fill in the highlighted fields');
      setTimeout(() => document.querySelector('[aria-invalid="true"], .ring-danger')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    save.mutate(body);
  };

  if (!user.emailVerified) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Verify your email first</h1>
        <p className="mt-2 text-muted">Only verified students can create team posts. It takes 30 seconds.</p>
        <Link to="/verify-email" className="mt-6 inline-block font-medium text-primary">Verify my email →</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={editing ? 'Edit team post' : 'Create a team post'}
        subtitle={editing ? 'Changes are visible immediately. Rejected posts are resubmitted for approval.' : 'Describe your project, the skills you need and the roles you want to fill. Posts go live after a quick admin review.'}
      />
      <form onSubmit={submit} noValidate className="space-y-6">
        <Card>
          <CardHeader title="The opportunity" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Title" required error={errors.title} className="sm:col-span-2"><Input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={120} placeholder="AI Attendance System" invalid={!!errors.title} /></Field>
            <Field label="Event or hackathon name" required error={errors.eventName}><Input value={f.eventName} onChange={(e) => set('eventName', e.target.value)} placeholder="HackThapar 2026" invalid={!!errors.eventName} /></Field>
            <Field label="Type" required>
              <Select value={f.type} onChange={(e) => set('type', e.target.value)}>{Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            </Field>
            <Field label="Project idea / description" required error={errors.description} hint={`${f.description.length}/4000`} className="sm:col-span-2">
              <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={4000} className="min-h-[140px]" placeholder="What are you building, for whom, and what's already done?" invalid={!!errors.description} />
            </Field>
            <Field label="Domain" required error={errors.domains} className="sm:col-span-2" hint="Used for the interest part of the match score">
              <ChipSelect options={(catalog?.interests ?? []).map((r) => ({ value: r.slug, label: r.name }))} value={f.domains} onChange={(v) => set('domains', v)} max={6} invalid={!!errors.domains} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Team & timeline" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Deadline" required error={errors.deadline}><Input type="datetime-local" value={f.deadline} onChange={(e) => set('deadline', e.target.value)} invalid={!!errors.deadline} /></Field>
            <Field label="Team size (including you)" required error={errors.teamSize}><Input type="number" min={2} max={12} value={f.teamSize} onChange={(e) => set('teamSize', Number(e.target.value))} invalid={!!errors.teamSize} /></Field>
            <Field label="Expected commitment (hours/week)" required error={errors.commitmentHours} hint="Used for the availability part of the match"><Input type="number" min={1} max={60} value={f.commitmentHours} onChange={(e) => set('commitmentHours', Number(e.target.value))} invalid={!!errors.commitmentHours} /></Field>
            <Field label="Location"><Input value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="Remote / Patiala / Hybrid" /></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Required skills" subtitle="Half of every match score comes from these" />
          <div className="p-5">
            <Field error={errors.requiredSkills}><SkillPicker value={f.requiredSkills} onChange={(v) => set('requiredSkills', v)} invalid={!!errors.requiredSkills} /></Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Open roles"
            subtitle={`${totalSlots} of ${Math.max(0, f.teamSize - 1)} available positions assigned`}
            action={<Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => set('openRoles', [...f.openRoles, { role: '', slots: 1 }])} disabled={f.openRoles.length >= 10}>Add role</Button>}
          />
          <div className="space-y-3 p-5">
            {f.openRoles.map((r, i) => (
              <div key={i} className="flex items-end gap-3">
                <Field label={i === 0 ? 'Role' : undefined} className="flex-1">
                  <Select value={r.role} onChange={(e) => set('openRoles', f.openRoles.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} invalid={!!errors.openRoles && !r.role}>
                    <option value="">Choose a role…</option>
                    {(catalog?.roles ?? []).map((x) => <option key={x.slug} value={x.slug} disabled={f.openRoles.some((y, j) => j !== i && y.role === x.slug)}>{x.name}</option>)}
                  </Select>
                </Field>
                <Field label={i === 0 ? 'Positions' : undefined} className="w-28">
                  <Input type="number" min={Math.max(1, filledByRole.get(r.role) ?? 1)} max={10} value={r.slots} onChange={(e) => set('openRoles', f.openRoles.map((x, j) => (j === i ? { ...x, slots: Number(e.target.value) } : x)))} />
                </Field>
                <Button variant="ghost" className="mb-0.5 text-danger" disabled={f.openRoles.length === 1 || (filledByRole.get(r.role) ?? 0) > 0} onClick={() => set('openRoles', f.openRoles.filter((_, j) => j !== i))} aria-label="Remove role"><Trash2 className="size-4" /></Button>
              </div>
            ))}
            {errors.openRoles && <p className="text-[12.5px] text-danger">{errors.openRoles}</p>}
            {editing && [...filledByRole.values()].some((n) => n > 0) && <p className="text-[12px] text-muted">Roles that already have members can't be removed or reduced below their filled count{existing.data ? ` (${existing.data.openRoles.filter((r) => r.filled).map((r) => `${roleName(r.role)}: ${r.filled}`).join(', ')})` : ''}.</p>}
          </div>
        </Card>

        {!editing && (
          <div className="flex items-start gap-2 rounded-2xl border border-line bg-surface-2/50 px-4 py-3 text-[13px] text-muted">
            <Info className="mt-0.5 size-4 shrink-0" /> After you submit, the post is “Pending approval” and hidden until an admin approves it. It closes automatically when the team is full or the deadline passes.
          </div>
        )}
        <div className="sticky bottom-20 z-10 flex justify-end gap-2 rounded-2xl border border-line bg-bg/85 p-3 backdrop-blur lg:bottom-4">
          <Button variant="ghost" onClick={() => nav(-1)}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>{editing ? 'Save changes' : 'Submit for approval'}</Button>
        </div>
      </form>
    </div>
  );
}
