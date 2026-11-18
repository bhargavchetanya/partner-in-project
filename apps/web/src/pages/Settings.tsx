import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, Bell, KeyRound, LogOut, Palette, Shield, User } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { useDocumentTitle, useMe, useTheme } from '@/lib/hooks';
import type { MeResponse } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { Badge, Button, ButtonLink, Card, CardHeader, Field, Input, PageHeader, Toggle } from '@/components/ui';

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const { data } = useMe();
  const user = data!.user!;
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const prefs = useMutation({
    mutationFn: (v: boolean) => api.patch<MeResponse>('/auth/preferences', { emailNotifications: v }),
    onSuccess: (d) => { qc.setQueryData(['me'], (old: MeResponse | undefined) => ({ ...old, user: d.user })); toast.success('Preferences saved'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: pw.currentPassword || undefined, newPassword: pw.newPassword }),
    onSuccess: () => { toast.success(user.hasPassword ? 'Password changed. Other devices were signed out.' : 'Password set. You can now also log in with email.'); setPw({ currentPassword: '', newPassword: '', confirm: '' }); qc.invalidateQueries({ queryKey: ['me'] }); },
    onError: (e) => setErrors({ ...fieldErrors(e), form: errorMessage(e) }),
  });
  const logout = useMutation({ mutationFn: () => api.post('/auth/logout'), onSuccess: () => { qc.clear(); location.href = '/login'; } });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" />
      <Card>
        <CardHeader title="Account" icon={<User className="size-4" />} />
        <div className="space-y-3 p-5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-muted">Email</span><span className="flex items-center gap-2 font-medium">{user.email}{user.emailVerified ? <Badge tone="accent">Verified</Badge> : <Link to="/verify-email"><Badge tone="warn">Verify now</Badge></Link>}</span></div>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-muted">Student status</span>{user.institutionVerified ? <Badge tone="accent" icon={<BadgeCheck className="size-3" />}>Verified Student</Badge> : <span className="text-[13px] text-muted">Register with your college email to get the badge</span>}</div>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-muted">Sign-in methods</span><span className="flex gap-2">{user.hasPassword && <Badge>Email &amp; password</Badge>}{user.googleLinked && <Badge tone="primary">Google</Badge>}</span></div>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-muted">Role</span><span className="font-medium capitalize">{user.role}</span></div>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-muted">Member since</span><span>{formatDate(user.createdAt)}</span></div>
          <div className="flex gap-2 pt-2"><ButtonLink to="/profile/edit" size="sm" variant="secondary">Edit profile</ButtonLink>{user.role === 'admin' && <ButtonLink to="/admin" size="sm" variant="secondary" icon={<Shield className="size-3.5" />}>Admin dashboard</ButtonLink>}</div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Notifications" icon={<Bell className="size-4" />} />
        <div className="p-5">
          <Toggle checked={user.notificationPrefs.email} disabled={prefs.isPending} onChange={(v) => prefs.mutate(v)} label="Email notifications" description="Applications, decisions, invitations, approvals and deadline reminders. In-app notifications are always on." />
        </div>
      </Card>

      <Card>
        <CardHeader title="Appearance" icon={<Palette className="size-4" />} />
        <div className="flex gap-3 p-5">
          {(['dark', 'light'] as const).map((t) => (
            <button key={t} onClick={() => setTheme(t)} className={`flex-1 rounded-xl border p-4 text-left transition ${theme === t ? 'border-primary ring-4 ring-primary-soft' : 'border-line hover:border-line-strong'}`}>
              <div className={`mb-3 h-16 rounded-lg ${t === 'dark' ? 'bg-[#0a0d18] border border-[#252c4c]' : 'bg-[#f6f7fc] border border-[#e2e5f0]'}`} />
              <span className="text-sm font-medium capitalize">{t}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title={user.hasPassword ? 'Change password' : 'Set a password'} subtitle={user.hasPassword ? undefined : 'You signed up with Google. Add a password to also log in with email.'} icon={<KeyRound className="size-4" />} />
        <form
          className="grid gap-4 p-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const errs: Record<string, string> = {};
            if (user.hasPassword && !pw.currentPassword) errs.currentPassword = 'Enter your current password';
            if (pw.newPassword.length < 8) errs.newPassword = 'At least 8 characters';
            if (pw.newPassword !== pw.confirm) errs.confirm = "Passwords don't match";
            setErrors(errs);
            if (!Object.keys(errs).length) change.mutate();
          }}
        >
          {user.hasPassword && <Field label="Current password" error={errors.currentPassword} className="sm:col-span-2"><Input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} invalid={!!errors.currentPassword} /></Field>}
          <Field label="New password" error={errors.newPassword}><Input type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} invalid={!!errors.newPassword} /></Field>
          <Field label="Confirm new password" error={errors.confirm}><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} invalid={!!errors.confirm} /></Field>
          <div className="sm:col-span-2"><Button type="submit" loading={change.isPending}>{user.hasPassword ? 'Change password' : 'Set password'}</Button></div>
        </form>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="font-medium">Log out</div><div className="text-[13px] text-muted">End your session on this device.</div></div>
          <Button variant="danger" icon={<LogOut className="size-4" />} loading={logout.isPending} onClick={() => logout.mutate()}>Log out</Button>
        </div>
      </Card>
    </div>
  );
}
