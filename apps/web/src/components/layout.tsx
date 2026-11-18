import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell, Compass, FileText, Github, LayoutDashboard, LogOut, Mail, MessageSquare, Moon, Search, Settings, Shield, Sparkles,
  Sun, User, Users, UsersRound, Briefcase, Menu, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useMe, useTheme, useUser } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Avatar, Button, PageLoader } from './ui';

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2.5 font-display font-semibold text-fg', className)} aria-label="Partner in Project home">
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8b7bff" />
            <stop offset="1" stopColor="#2dd4bf" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="var(--surface-2)" />
        <circle cx="25" cy="32" r="13" fill="none" stroke="url(#lg)" strokeWidth="6" />
        <circle cx="39" cy="32" r="13" fill="none" stroke="url(#lg)" strokeWidth="6" opacity=".85" />
      </svg>
      {!compact && (
        <span className="text-[17px] tracking-tight">
          Partner<span className="text-accent"> in </span>Project
        </span>
      )}
    </Link>
  );
}

const mainNav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/opportunities', label: 'Team Finder', icon: Briefcase },
  { to: '/teams', label: 'My Teams', icon: UsersRound },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
];

function useCounts() {
  const user = useUser();
  const notif = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const msgs = useQuery({
    queryKey: ['unread-messages'],
    queryFn: () => api.get<{ count: number }>('/conversations/unread-count'),
    enabled: !!user,
    refetchInterval: 60_000,
  });
  return { notifications: notif.data?.count ?? 0, messages: msgs.data?.count ?? 0 };
}

function GlobalSearch({ className, onDone }: { className?: string; onDone?: () => void }) {
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'people' | 'teams'>('people');
  const nav = useNavigate();
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const query = q.trim();
        nav(scope === 'people' ? `/discover?q=${encodeURIComponent(query)}` : `/opportunities?q=${encodeURIComponent(query)}`);
        onDone?.();
      }}
      className={cn('flex h-10 items-center rounded-xl border border-line bg-elev pl-3 pr-1 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary-soft', className)}
    >
      <Search className="size-4 shrink-0 text-muted" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={scope === 'people' ? 'Search students by name or skill…' : 'Search teams, hackathons, skills…'}
        className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm placeholder:text-muted focus:outline-none"
        aria-label="Search"
      />
      <select value={scope} onChange={(e) => setScope(e.target.value as 'people' | 'teams')} className="h-8 rounded-lg bg-surface-2 px-2 text-[12px] text-fg-2 focus:outline-none" aria-label="Search in">
        <option value="people">People</option>
        <option value="teams">Teams</option>
      </select>
    </form>
  );
}

function ProfileMenu() {
  const user = useUser()!;
  const { theme, toggle } = useTheme();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      qc.clear();
      nav('/login');
      toast.success('Logged out');
    },
  });
  const items: { to: string; label: string; icon: typeof User }[] = [
    { to: '/profile', label: 'My profile', icon: User },
    { to: '/skills', label: 'Skills', icon: Sparkles },
    { to: '/github', label: 'GitHub repositories', icon: Github },
    { to: '/applications', label: 'My applications', icon: FileText },
    { to: '/connections', label: 'Connections', icon: Users },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];
  if (user.role === 'admin') items.push({ to: '/admin', label: 'Admin dashboard', icon: Shield });
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-line" aria-label="Account menu" aria-expanded={open}>
        <Avatar name={user.name} src={user.avatarUrl} size={34} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12 }} className="card absolute right-0 z-40 mt-2 w-64 overflow-hidden p-1.5">
            <div className="px-3 py-2.5">
              <div className="truncate text-sm font-semibold">{user.name}</div>
              <div className="truncate text-[12px] text-muted">{user.email}</div>
            </div>
            <div className="my-1 h-px bg-line" />
            {items.map((i) => (
              <Link key={i.to} to={i.to} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] text-fg-2 hover:bg-surface-2 hover:text-fg">
                <i.icon className="size-4" />
                {i.label}
              </Link>
            ))}
            <button onClick={toggle} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] text-fg-2 hover:bg-surface-2 hover:text-fg">
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <div className="my-1 h-px bg-line" />
            <button onClick={() => logout.mutate()} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] text-danger hover:bg-danger-soft">
              <LogOut className="size-4" /> Log out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VerifyBanner() {
  const user = useUser();
  const loc = useLocation();
  if (!user || user.emailVerified || loc.pathname === '/verify-email') return null;
  return (
    <div className="border-b border-warn/30 bg-warn-soft">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-[13px] text-warn sm:px-6">
        <span className="flex items-center gap-2">
          <Mail className="size-4" /> Verify your email to create team posts and apply to teams.
        </span>
        <Link to="/verify-email" className="font-semibold underline underline-offset-2">Verify now</Link>
      </div>
    </div>
  );
}

export function AppShell() {
  const counts = useCounts();
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setMobileOpen(false);
  }, [loc.pathname]);
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <button className="rounded-lg p-2 text-fg-2 hover:bg-surface-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <Logo className="shrink-0" compact={false} />
          <nav className="ml-4 hidden items-center gap-1 lg:flex">
            {mainNav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => cn('relative rounded-lg px-3 py-2 text-[13.5px] font-medium transition', isActive ? 'text-fg bg-surface-2' : 'text-muted hover:text-fg')}
              >
                {n.label}
                {n.to === '/messages' && counts.messages > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10.5px] text-white">{counts.messages}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <GlobalSearch className="hidden w-[320px] md:flex xl:w-[380px]" />
            <Link to="/notifications" className="relative rounded-xl p-2.5 text-fg-2 hover:bg-surface-2 hover:text-fg" aria-label={`Notifications${counts.notifications ? `, ${counts.notifications} unread` : ''}`}>
              <Bell className="size-5" />
              {counts.notifications > 0 && (
                <span className="absolute right-1 top-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{counts.notifications > 9 ? '9+' : counts.notifications}</span>
              )}
            </Link>
            <ProfileMenu />
          </div>
        </div>
        <div className="border-t border-line px-4 py-2 md:hidden">
          <GlobalSearch />
        </div>
      </header>
      <VerifyBanner />

      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', stiffness: 400, damping: 40 }} className="absolute inset-y-0 left-0 w-72 border-r border-line bg-bg p-4">
              <div className="mb-6 flex items-center justify-between">
                <Logo />
                <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 hover:bg-surface-2" aria-label="Close menu">
                  <X className="size-5" />
                </button>
              </div>
              <nav className="space-y-1">
                {[...mainNav, { to: '/notifications', label: 'Notifications', icon: Bell }, { to: '/profile', label: 'My profile', icon: User }, { to: '/skills', label: 'Skills', icon: Sparkles }, { to: '/github', label: 'GitHub', icon: Github }, { to: '/applications', label: 'Applications', icon: FileText }, { to: '/connections', label: 'Connections', icon: Users }, { to: '/settings', label: 'Settings', icon: Settings }].map((n) => (
                  <NavLink key={n.to} to={n.to} className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium', isActive ? 'bg-surface-2 text-fg' : 'text-fg-2 hover:bg-surface-2')}>
                    <n.icon className="size-4.5" />
                    {n.label}
                  </NavLink>
                ))}
              </nav>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-bg/90 backdrop-blur-xl lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {mainNav.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => cn('relative flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium', isActive ? 'text-primary' : 'text-muted')}>
            <n.icon className="size-5" />
            {n.label.replace('Team Finder', 'Teams').replace('My Teams', 'Mine')}
            {n.to === '/messages' && counts.messages > 0 && <span className="absolute right-[28%] top-1.5 size-2 rounded-full bg-primary" />}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

// ------------------------------------------------------------------ guards
export function RequireAuth({ children, admin }: { children?: ReactNode; admin?: boolean }) {
  const { data, isLoading } = useMe();
  const loc = useLocation();
  if (isLoading) return <PageLoader />;
  const user = data?.user;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!user.profileComplete && loc.pathname !== '/onboarding' && loc.pathname !== '/verify-email') return <Navigate to="/onboarding" replace />;
  if (admin && user.role !== 'admin') {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <Shield className="mx-auto size-10 text-danger" />
        <h1 className="mt-4 font-display text-xl font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-muted">The admin dashboard is only available to administrators.</p>
        <Link to="/dashboard" className="mt-6 inline-block text-primary">Back to dashboard</Link>
      </div>
    );
  }
  return <>{children ?? <Outlet />}</>;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { data, isLoading } = useMe();
  const loc = useLocation();
  if (isLoading) return <PageLoader />;
  if (data?.user) {
    const next = new URLSearchParams(loc.search).get('next');
    if (loc.pathname === '/register' && !data.user.emailVerified) return <Navigate to="/verify-email" replace />;
    return <Navigate to={next && next.startsWith('/') ? next : '/dashboard'} replace />;
  }
  return <>{children}</>;
}

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: ReactNode }) {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden border-r border-line lg:block">
        <div className="absolute inset-0 glow" />
        <div className="absolute inset-0 bg-grid opacity-60" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo />
          <div>
            <h2 className="font-display text-4xl font-semibold leading-tight">
              Find teammates who <span className="text-gradient">actually ship.</span>
            </h2>
            <p className="mt-4 max-w-md text-fg-2">
              Profiles backed by real GitHub work, transparent match scores and a skill-gap view that shows exactly who your team is missing.
            </p>
            <div className="mt-10 grid max-w-md grid-cols-3 gap-3">
              {[
                ['50%', 'skills'],
                ['20%', 'interests'],
                ['30%', 'role + time'],
              ].map(([a, b]) => (
                <div key={b} className="card p-4">
                  <div className="font-display text-2xl font-semibold text-gradient">{a}</div>
                  <div className="text-[12px] text-muted">{b}</div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[12px] text-muted">UCS503 Software Engineering Lab · Thapar Institute</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="font-display text-[26px] font-semibold">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function GoogleButton({ label = 'Continue with Google', next }: { label?: string; next?: string }) {
  const { data } = useMe();
  const enabled = data?.features?.google;
  return (
    <Button
      variant="secondary"
      size="lg"
      className="w-full"
      onClick={() => {
        if (!enabled) {
          toast.error('Google sign-in is not configured on this server yet. Use email and password for now.');
          return;
        }
        location.href = `/api/auth/google${next ? `?returnTo=${encodeURIComponent(next)}` : ''}`;
      }}
      icon={
        <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
        </svg>
      }
    >
      {label}
    </Button>
  );
}
