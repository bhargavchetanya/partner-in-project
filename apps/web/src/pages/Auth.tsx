import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, MailCheck, School, User } from 'lucide-react';
import { registerSchema } from '@pip/shared';
import { api, ApiError, errorMessage, fieldErrors } from '@/lib/api';
import { useMe, useDocumentTitle } from '@/lib/hooks';
import type { MeResponse } from '@/lib/types';
import { AuthLayout, GoogleButton } from '@/components/layout';
import { Button, Field, Input } from '@/components/ui';

const oauthErrors: Record<string, string> = {
  google_not_configured: 'Google sign-in is not configured on this server yet.',
  google_cancelled: 'Google sign-in was cancelled.',
  google_failed: 'Google sign-in failed. Please try again.',
  google_expired: 'The sign-in attempt expired. Please try again.',
  google_email_unverified: 'Your Google email address is not verified.',
  account_banned: 'This account has been banned.',
  account_deactivated: 'This account has been deactivated by an administrator.',
};

function Divider() {
  return (
    <div className="my-6 flex items-center gap-3 text-[12px] text-muted">
      <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} leftIcon={<Lock className="size-4" />} className="pr-10" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function Login() {
  useDocumentTitle('Log in');
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const next = params.get('next') ?? undefined;
  useEffect(() => {
    const e = params.get('error');
    if (e) toast.error(oauthErrors[e] ?? 'Sign-in failed');
  }, [params]);
  const m = useMutation({
    mutationFn: () => api.post<MeResponse>('/auth/login', { email, password }),
    onSuccess: (data) => {
      qc.setQueryData(['me'], (old: MeResponse | undefined) => ({ ...old, user: data.user }));
      toast.success(`Welcome back, ${data.user?.name.split(' ')[0]}!`);
      nav(next && next.startsWith('/') ? next : '/dashboard', { replace: true });
    },
    onError: (e) => setErrors({ ...fieldErrors(e), form: errorMessage(e) }),
  });
  return (
    <AuthLayout title="Welcome back" subtitle="Log in to find teammates and manage your teams.">
      <GoogleButton next={next} />
      <Divider />
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const errs: Record<string, string> = {};
          if (!email.trim()) errs.email = 'Email is required';
          if (!password) errs.password = 'Password is required';
          setErrors(errs);
          if (!Object.keys(errs).length) m.mutate();
        }}
      >
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} leftIcon={<Mail className="size-4" />} placeholder="you@college.edu" />
        </Field>
        <Field
          label={
            <span className="flex w-full items-center justify-between">
              Password
              <Link to="/forgot-password" className="text-[12.5px] font-medium text-primary hover:underline">Forgot password?</Link>
            </span>
          }
          htmlFor="password"
          error={errors.password}
        >
          <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} placeholder="Your password" />
        </Field>
        {errors.form && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger" role="alert">{errors.form}</div>}
        <Button type="submit" size="lg" className="w-full" loading={m.isPending}>Log in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        New here? <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-primary hover:underline">Create an account</Link>
      </p>
    </AuthLayout>
  );
}

export function Register() {
  useDocumentTitle('Create account');
  const qc = useQueryClient();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', college: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () => api.post<MeResponse & { devCode?: string }>('/auth/register', form),
    onSuccess: (data) => {
      // GuestOnly sends freshly registered (unverified) users to /verify-email
      qc.setQueryData(['me'], (old: MeResponse | undefined) => ({ ...old, user: data.user }));
      if (data.devCode) toast.info(`Development mode: your code is ${data.devCode}`, { duration: 20000 });
      else toast.success('Account created! Check your email for the verification code.');
    },
    onError: (e) => setErrors({ ...fieldErrors(e), form: errorMessage(e) }),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <AuthLayout title="Create your account" subtitle="Join students from every college building cool things together.">
      <GoogleButton label="Sign up with Google" />
      <Divider />
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const r = registerSchema.safeParse(form);
          if (!r.success) {
            const errs: Record<string, string> = {};
            for (const i of r.error.issues) errs[String(i.path[0])] ??= i.message;
            setErrors(errs);
            return;
          }
          setErrors({});
          m.mutate();
        }}
      >
        <Field label="Full name" htmlFor="name" error={errors.name} required>
          <Input id="name" autoComplete="name" value={form.name} onChange={set('name')} invalid={!!errors.name} leftIcon={<User className="size-4" />} placeholder="Chetanya Sharma" />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email} required hint="Use your college email to get the Verified Student badge.">
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} invalid={!!errors.email} leftIcon={<Mail className="size-4" />} placeholder="you@thapar.edu" />
        </Field>
        <Field label="College / university" htmlFor="college" error={errors.college} required>
          <Input id="college" value={form.college} onChange={set('college')} invalid={!!errors.college} leftIcon={<School className="size-4" />} placeholder="Thapar Institute of Engineering & Technology" />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password} required hint="At least 8 characters.">
          <PasswordInput id="password" autoComplete="new-password" value={form.password} onChange={set('password')} invalid={!!errors.password} placeholder="Create a password" />
        </Field>
        {errors.form && (
          <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger" role="alert">
            {errors.form} {m.error instanceof ApiError && m.error.code === 'EMAIL_TAKEN' && <Link to="/login" className="font-semibold underline">Log in</Link>}
          </div>
        )}
        <Button type="submit" size="lg" className="w-full" loading={m.isPending}>Create account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account? <Link to="/login" className="font-medium text-primary hover:underline">Log in</Link>
      </p>
    </AuthLayout>
  );
}

export function VerifyEmail() {
  useDocumentTitle('Verify email');
  const { data } = useMe();
  const user = data?.user;
  const qc = useQueryClient();
  const nav = useNavigate();
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const code = digits.join('');
  const verify = useMutation({
    mutationFn: () => api.post<MeResponse>('/auth/verify-email', { email: user?.email, code }),
    onSuccess: (d) => {
      qc.setQueryData(['me'], (old: MeResponse | undefined) => ({ ...old, user: d.user }));
      toast.success(d.user?.institutionVerified ? 'Email verified — you earned the Verified Student badge!' : 'Email verified!');
      nav(d.user?.profileComplete ? '/dashboard' : '/onboarding', { replace: true });
    },
    onError: (e) => {
      setError(errorMessage(e));
      setDigits(['', '', '', '', '', '']);
      refs.current[0]?.focus();
    },
  });
  const resend = useMutation({
    mutationFn: () => api.post<{ ok: boolean; devCode?: string }>('/auth/resend-otp', { email: user?.email }),
    onSuccess: (d) => {
      if (d.devCode) toast.info(`Development mode: your new code is ${d.devCode}`, { duration: 20000 });
      else toast.success('A new code is on its way.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  useEffect(() => {
    if (user?.emailVerified) nav('/dashboard', { replace: true });
  }, [user?.emailVerified, nav]);
  useEffect(() => {
    if (code.length === 6 && !verify.isPending) verify.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  if (!user) return null;
  return (
    <AuthLayout title="Check your inbox" subtitle={<>We sent a 6-digit code to <span className="font-medium text-fg">{user.email}</span>. It expires in 10 minutes.</>}>
      <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"><MailCheck className="size-7" /></div>
      <div className="flex justify-between gap-2" onPaste={(e) => {
        const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (t.length) {
          e.preventDefault();
          setDigits(t.padEnd(6, ' ').split('').map((c) => (c === ' ' ? '' : c)));
          refs.current[Math.min(t.length, 5)]?.focus();
        }
      }}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            value={d}
            inputMode="numeric"
            maxLength={1}
            autoFocus={i === 0}
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(-1);
              setError('');
              setDigits((arr) => arr.map((x, j) => (j === i ? v : x)));
              if (v && i < 5) refs.current[i + 1]?.focus();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
            }}
            className="h-14 w-full rounded-xl border border-line bg-elev text-center font-mono text-2xl text-fg focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary-soft"
          />
        ))}
      </div>
      {error && <p className="mt-3 text-[13px] text-danger" role="alert">{error}</p>}
      <Button size="lg" className="mt-6 w-full" disabled={code.length !== 6} loading={verify.isPending} onClick={() => verify.mutate()}>Verify email</Button>
      <div className="mt-6 flex items-center justify-between text-sm">
        <button onClick={() => resend.mutate()} disabled={resend.isPending} className="font-medium text-primary hover:underline disabled:opacity-50">Resend code</button>
        <Link to={user.profileComplete ? '/dashboard' : '/onboarding'} className="text-muted hover:text-fg">Do this later</Link>
      </div>
    </AuthLayout>
  );
}

export function ForgotPassword() {
  useDocumentTitle('Reset password');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const m = useMutation({
    mutationFn: () => api.post<{ ok: boolean; devLink?: string }>('/auth/forgot-password', { email }),
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <AuthLayout title="Forgot your password?" subtitle="Enter your email and we'll send you a reset link that's valid for 15 minutes.">
      {m.isSuccess ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-accent/30 bg-accent-soft p-4 text-sm text-fg">
            If an account exists for <b>{email}</b>, a reset link is on its way. Check your inbox (and spam folder).
          </div>
          {m.data.devLink && (
            <a href={m.data.devLink} className="block rounded-xl border border-dashed border-primary/50 p-3 text-[13px] text-primary break-all">Development mode — open reset link</a>
          )}
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-primary"><ArrowLeft className="size-4" /> Back to login</Link>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address');
            setError('');
            m.mutate();
          }}
        >
          <Field label="Email" htmlFor="email" error={error}>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} leftIcon={<Mail className="size-4" />} placeholder="you@college.edu" invalid={!!error} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={m.isPending}>Send reset link</Button>
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> Back to login</Link>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPassword() {
  useDocumentTitle('Choose a new password');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () => api.post('/auth/reset-password', { token, password }),
    onSuccess: () => {
      toast.success('Password updated. Log in with your new password.');
      nav('/login', { replace: true });
    },
    onError: (e) => setErrors({ ...fieldErrors(e), form: errorMessage(e) }),
  });
  return (
    <AuthLayout title="Choose a new password" subtitle="You'll be signed out of other devices.">
      {!token ? (
        <div className="text-sm text-muted">This link is missing its token. <Link to="/forgot-password" className="text-primary">Request a new one</Link>.</div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const errs: Record<string, string> = {};
            if (password.length < 8) errs.password = 'Password must be at least 8 characters';
            if (password !== confirm) errs.confirm = "Passwords don't match";
            setErrors(errs);
            if (!Object.keys(errs).length) m.mutate();
          }}
        >
          <Field label="New password" error={errors.password}>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password" error={errors.confirm}>
            <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={!!errors.confirm} autoComplete="new-password" />
          </Field>
          {errors.form && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{errors.form} <Link to="/forgot-password" className="underline">Request a new link</Link></div>}
          <Button type="submit" size="lg" className="w-full" loading={m.isPending}>Update password</Button>
        </form>
      )}
    </AuthLayout>
  );
}
