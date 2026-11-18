import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';
import { Camera, Plus, Trash2 } from 'lucide-react';
import { profileSchema } from '@pip/shared';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { useCatalog, useDocumentTitle } from '@/lib/hooks';
import type { FullProfile, MeResponse } from '@/lib/types';
import { YEAR_LABELS } from '@/lib/utils';
import { Logo } from '@/components/layout';
import { Avatar, Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, PageLoader, Select, Textarea } from '@/components/ui';
import { ChipSelect, SkillPicker } from '@/components/pickers';

interface FormState {
  name: string;
  headline: string;
  college: string;
  branch: string;
  year: number;
  bio: string;
  location: string;
  website: string;
  interests: string[];
  preferredRoles: string[];
  availabilityHours: number;
  lookingForSkills: string[];
  projects: { title: string; description: string; url: string; tech: string[] }[];
  achievements: { title: string; description: string; date: string }[];
}

const DRAFT_KEY = 'pip-profile-draft';

export default function EditProfile({ onboarding }: { onboarding?: boolean }) {
  useDocumentTitle(onboarding ? 'Set up your profile' : 'Edit profile');
  const qc = useQueryClient();
  const nav = useNavigate();
  const { catalog } = useCatalog();
  const q = useQuery({ queryKey: ['profile', 'me'], queryFn: () => api.get<FullProfile>('/profiles/me') });
  const [f, setF] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [avatar, setAvatar] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!q.data || f) return;
    const p = q.data;
    let draft: FormState | null = null;
    try {
      draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null');
    } catch {
      draft = null;
    }
    setF(
      draft ?? {
        name: p.name, headline: p.headline, college: p.college, branch: p.branch, year: p.year || 0, bio: p.bio, location: p.location,
        website: p.website, interests: p.interests, preferredRoles: p.preferredRoles, availabilityHours: p.availabilityHours,
        lookingForSkills: p.lookingForSkills, projects: p.projects.map(({ title, description, url, tech }) => ({ title, description, url, tech })),
        achievements: p.achievements.map(({ title, description, date }) => ({ title, description, date })),
      },
    );
    setAvatar(p.avatarUrl);
  }, [q.data, f]);

  // QR9: keep what the user typed even if saving fails or the page reloads
  useEffect(() => {
    if (f) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(f));
  }, [f]);

  useEffect(() => {
    if (location.hash === '#projects') setTimeout(() => document.getElementById('projects')?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, [f === null]);

  const save = useMutation({
    mutationFn: (data: FormState) => api.put<FullProfile>('/profiles/me', { ...data }),
    onSuccess: async (p) => {
      sessionStorage.removeItem(DRAFT_KEY);
      qc.setQueryData(['profile', 'me'], p);
      await qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['discover'] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      toast.success(onboarding ? 'Profile ready! Next, link GitHub to show your work.' : 'Profile saved');
      nav(onboarding ? '/github?onboarding=1' : '/profile');
    },
    onError: (e) => {
      setErrors(fieldErrors(e));
      toast.error(errorMessage(e));
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Choose a JPEG, PNG or WebP image');
      if (file.size > 10 * 1024 * 1024) throw new Error('That image is too large (max 10 MB before compression)');
      // QR12: compress to ~0.5 MB (wish level), well under the 2 MB limit
      const compressed = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 640, useWebWorker: true, fileType: 'image/jpeg' });
      const fd = new FormData();
      fd.append('avatar', compressed, 'avatar.jpg');
      return api.post<{ avatarUrl: string }>('/profiles/me/avatar', fd);
    },
    onSuccess: (r) => {
      setAvatar(r.avatarUrl);
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['profile', 'me'] });
      toast.success('Photo updated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const removeAvatar = useMutation({
    mutationFn: () => api.del<{ avatarUrl: string | null }>('/profiles/me/avatar'),
    onSuccess: (r) => {
      setAvatar(r.avatarUrl);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  if (q.isLoading || (!f && !q.isError)) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const form = f!;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s!, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = profileSchema.safeParse(form);
    const errs: Record<string, string> = {};
    if (!r.success) for (const i of r.error.issues) errs[i.path.join('.')] ??= i.message;
    if (!form.year) errs.year = 'Choose your academic year';
    if (form.preferredRoles.length === 0) errs.preferredRoles = 'Pick at least one role';
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error('Please fix the highlighted fields');
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    save.mutate(form);
  };

  const content = (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Card>
        <CardHeader title="Photo & basics" subtitle="Fields marked * are required" />
        <div className="space-y-5 p-5">
          <div className="flex items-center gap-5">
            <Avatar name={form.name || '?'} src={avatar} size={88} />
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<Camera className="size-4" />} loading={upload.isPending} onClick={() => fileRef.current?.click()}>Upload photo</Button>
                {avatar && <Button size="sm" variant="ghost" onClick={() => removeAvatar.mutate()}>Remove</Button>}
              </div>
              <p className="text-[12px] text-muted">JPEG, PNG or WebP. We compress it to about 0.5 MB.</p>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) upload.mutate(file); e.target.value = ''; }} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={errors.name}><Input value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} /></Field>
            <Field label="Headline" error={errors.headline} hint="e.g. Full-stack dev · MERN"><Input value={form.headline} onChange={(e) => set('headline', e.target.value)} maxLength={100} placeholder="What do you build?" /></Field>
            <Field label="College / university" required error={errors.college}><Input value={form.college} onChange={(e) => set('college', e.target.value)} invalid={!!errors.college} /></Field>
            <Field label="Branch" required error={errors.branch}><Input value={form.branch} onChange={(e) => set('branch', e.target.value)} invalid={!!errors.branch} placeholder="e.g. COE, CSE, ECE" /></Field>
            <Field label="Academic year" required error={errors.year}>
              <Select value={form.year || ''} onChange={(e) => set('year', Number(e.target.value))} invalid={!!errors.year}>
                <option value="">Choose…</option>
                {Object.entries(YEAR_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Location" error={errors.location}><Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Patiala, Punjab" /></Field>
            <Field label="Website / portfolio" error={errors.website} className="sm:col-span-2"><Input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" invalid={!!errors.website} /></Field>
          </div>
          <Field label="Bio" error={errors.bio} hint={`${form.bio.length}/500`}>
            <Textarea value={form.bio} onChange={(e) => set('bio', e.target.value)} maxLength={500} placeholder="What do you love building? What have you shipped? What are you looking for?" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="What you want to work on" subtitle="Used for matching — roles 15%, interests 20%, availability 15%" />
        <div className="space-y-6 p-5">
          <Field label="Preferred roles" required error={errors.preferredRoles} hint="Pick up to 6">
            <ChipSelect options={(catalog?.roles ?? []).map((r) => ({ value: r.slug, label: r.name }))} value={form.preferredRoles} onChange={(v) => set('preferredRoles', v)} max={6} invalid={!!errors.preferredRoles} />
          </Field>
          <Field label="Interests" error={errors.interests}>
            <ChipSelect options={(catalog?.interests ?? []).map((r) => ({ value: r.slug, label: r.name }))} value={form.interests} onChange={(v) => set('interests', v)} max={20} />
          </Field>
          <Field label={`Availability — ${form.availabilityHours} hours per week`} required>
            <div className="flex items-center gap-4">
              <input type="range" min={0} max={40} step={1} value={form.availabilityHours} onChange={(e) => set('availabilityHours', Number(e.target.value))} className="w-full accent-[var(--primary)]" aria-label="Hours per week" />
              <Input type="number" min={0} max={60} value={form.availabilityHours} onChange={(e) => set('availabilityHours', Math.max(0, Math.min(60, Number(e.target.value) || 0)))} className="w-20 text-center" aria-label="Hours per week" />
            </div>
          </Field>
          <Field label="Skills I want in teammates" hint="Used to rank people on Discover for you">
            <SkillPicker value={form.lookingForSkills} onChange={(v) => set('lookingForSkills', v)} max={20} />
          </Field>
        </div>
      </Card>

      <Card id="projects">
        <CardHeader title="Projects" subtitle="Hackathon builds, research, designs — anything not on GitHub" action={<Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => set('projects', [...form.projects, { title: '', description: '', url: '', tech: [] }])} disabled={form.projects.length >= 20}>Add</Button>} />
        <div className="space-y-4 p-5">
          {form.projects.length === 0 && <p className="text-sm text-muted">No projects added.</p>}
          {form.projects.map((p, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-line bg-surface-2/40 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Title" required error={errors[`projects.${i}.title`]}><Input value={p.title} onChange={(e) => set('projects', form.projects.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} invalid={!!errors[`projects.${i}.title`]} /></Field>
                <Field label="Link" error={errors[`projects.${i}.url`]}><Input value={p.url} onChange={(e) => set('projects', form.projects.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://" invalid={!!errors[`projects.${i}.url`]} /></Field>
              </div>
              <Field label="Description"><Textarea value={p.description} onChange={(e) => set('projects', form.projects.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} maxLength={600} className="min-h-[70px]" /></Field>
              <Field label="Tech (comma separated)"><Input value={p.tech.join(', ')} onChange={(e) => set('projects', form.projects.map((x, j) => (j === i ? { ...x, tech: e.target.value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 15) } : x)))} placeholder="React, Firebase" /></Field>
              <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => set('projects', form.projects.filter((_, j) => j !== i))}>Remove project</Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Achievements" subtitle="Wins, certifications, publications" action={<Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => set('achievements', [...form.achievements, { title: '', description: '', date: '' }])} disabled={form.achievements.length >= 30}>Add</Button>} />
        <div className="space-y-4 p-5">
          {form.achievements.length === 0 && <p className="text-sm text-muted">No achievements added.</p>}
          {form.achievements.map((a, i) => (
            <div key={i} className="grid gap-3 rounded-xl border border-line bg-surface-2/40 p-4 sm:grid-cols-[1fr_160px_auto] sm:items-end">
              <Field label="Title" required error={errors[`achievements.${i}.title`]}><Input value={a.title} onChange={(e) => set('achievements', form.achievements.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Winner, Smart India Hackathon" invalid={!!errors[`achievements.${i}.title`]} /></Field>
              <Field label="When"><Input value={a.date} onChange={(e) => set('achievements', form.achievements.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} placeholder="Mar 2026" /></Field>
              <Button variant="ghost" className="text-danger" onClick={() => set('achievements', form.achievements.filter((_, j) => j !== i))} aria-label="Remove achievement"><Trash2 className="size-4" /></Button>
              <Field label="Details" className="sm:col-span-3"><Input value={a.description} onChange={(e) => set('achievements', form.achievements.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} maxLength={400} /></Field>
            </div>
          ))}
        </div>
      </Card>

      <div className="sticky bottom-20 z-10 flex justify-end gap-2 rounded-2xl border border-line bg-bg/85 p-3 backdrop-blur lg:bottom-4">
        {!onboarding && <Button variant="ghost" onClick={() => { sessionStorage.removeItem(DRAFT_KEY); nav('/profile'); }}>Cancel</Button>}
        <Button type="submit" loading={save.isPending}>{onboarding ? 'Save and continue' : 'Save profile'}</Button>
      </div>
    </form>
  );

  if (onboarding) {
    return (
      <div className="min-h-dvh">
        <div className="pointer-events-none fixed inset-x-0 top-0 h-80 glow" />
        <div className="relative mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <Logo />
          <div className="mt-10">
            <PageHeader eyebrow="Step 1 of 2" title="Set up your profile" subtitle="This is what other students see when deciding to team up with you. You can change it any time." />
            {content}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Edit profile" subtitle="Everything is on one page. Required fields are marked *." />
      {content}
    </div>
  );
}

export type { MeResponse };
