import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, BadgeCheck, Briefcase, Check, Github, MessageSquare, Radar, ShieldCheck, Sparkles, Target, Users, X, Zap,
} from 'lucide-react';
import { Logo } from '@/components/layout';
import { ButtonLink, Chip } from '@/components/ui';
import { MatchGauge } from '@/components/match';
import { useMe, useTheme, useDocumentTitle } from '@/lib/hooks';
import { Moon, Sun } from 'lucide-react';

const fade = { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' }, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } } as const;

const demoCandidates = [
  { name: 'Arjun M.', college: 'BITS Pilani', skills: ['Java', 'Spring Boot', 'React', 'MySQL'], missing: ['Docker'], score: 87, color: 'from-[#8b7bff] to-[#2dd4bf]' },
  { name: 'Sneha G.', college: 'Thapar', skills: ['React', 'Docker', 'MySQL'], missing: ['Java', 'Spring Boot'], score: 64, color: 'from-[#f472b6] to-[#8b7bff]' },
  { name: 'Kabir S.', college: 'PEC', skills: ['Java', 'Spring Boot', 'Docker', 'React', 'MySQL'], missing: [], score: 96, color: 'from-[#f5b04c] to-[#f2556b]' },
];

function HeroDemo() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % demoCandidates.length), 3200);
    return () => clearInterval(t);
  }, []);
  const c = demoCandidates[i];
  const required = ['Java', 'Spring Boot', 'React', 'MySQL', 'Docker'];
  return (
    <div className="relative mx-auto w-full max-w-[460px]">
      <div className="absolute -inset-8 rounded-[40px] bg-gradient-to-br from-primary/25 via-transparent to-accent/20 blur-3xl" />
      <motion.div initial={{ opacity: 0, y: 24, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.8, delay: 0.2 }} className="card relative p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Team post · HackThapar 2026</div>
            <div className="mt-1 font-display text-lg font-semibold">Smart Campus Attendance</div>
          </div>
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">2 spots</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {required.map((s) => (
            <Chip key={s} tone={c.skills.includes(s) ? 'accent' : 'warn'}>
              {c.skills.includes(s) ? <Check className="size-3" /> : <X className="size-3" />}
              {s}
            </Chip>
          ))}
        </div>
        <div className="my-4 h-px bg-line" />
        <motion.div key={c.name} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45 }} className="flex items-center gap-4">
          <div className={`flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${c.color} font-display font-semibold text-white`}>
            {c.name.split(' ').map((p) => p[0]).join('')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-medium">
              {c.name} <BadgeCheck className="size-4 text-accent" />
            </div>
            <div className="text-[12.5px] text-muted">{c.college} · Backend developer · 10 h/week</div>
            <div className="mt-1.5 text-[12px] text-fg-2">
              {c.missing.length === 0 ? 'Covers every required skill' : `Matches ${required.length - c.missing.length} of ${required.length} · missing ${c.missing.join(', ')}`}
            </div>
          </div>
          <MatchGauge key={c.score} score={c.score} size={70} />
        </motion.div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            ['Skills', 50, (required.length - c.missing.length) / required.length],
            ['Interests', 20, 1],
            ['Role', 15, 1],
            ['Time', 15, 0.8],
          ].map(([label, w, v]) => (
            <div key={label as string} className="rounded-lg bg-surface-2 p-2">
              <div className="text-[10.5px] text-muted">{label} · {w}%</div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <motion.div key={`${c.name}${label}`} className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${(v as number) * 100}%` }} transition={{ duration: 0.7 }} />
              </div>
            </div>
          ))}
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="card absolute -bottom-24 -left-8 hidden w-56 p-3.5 sm:block">
        <div className="flex items-center gap-2 text-[12px] font-semibold"><Github className="size-4" /> 23 repos synced</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {['TypeScript', 'Docker', 'PyTorch'].map((s) => <span key={s} className="rounded-md border border-dashed border-primary/40 px-1.5 py-0.5 text-[11px] text-primary">+ {s}</span>)}
        </div>
        <div className="mt-1.5 text-[11px] text-muted">Suggested skills — confirm to add</div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="card absolute -right-4 -top-8 hidden w-52 p-3.5 sm:block">
        <div className="text-[12px] font-semibold">Team coverage</div>
        <div className="mt-2 flex items-end gap-2">
          <span className="font-display text-2xl font-semibold text-accent">80%</span>
          <span className="pb-1 text-[11px] text-muted">missing: Docker</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full w-4/5 rounded-full bg-accent" /></div>
      </motion.div>
    </div>
  );
}

const features = [
  { icon: Github, title: 'GitHub-backed profiles', body: 'Link GitHub and every public repo shows up — languages, topics, stars, forks. Proof of work, not just claims.' },
  { icon: Sparkles, title: 'Skills you confirm', body: 'We read languages, frameworks and dependencies from your repos and suggest skills. Nothing counts until you confirm it.' },
  { icon: Target, title: 'Transparent match score', body: 'One clear formula — skills, interests, role and availability — with the exact reason behind every percentage.' },
  { icon: Radar, title: 'Skill gap analyzer', body: 'See which required skills your team already covers, what is missing, and who across colleges can fill the gap.' },
  { icon: MessageSquare, title: 'Real-time team chat', body: 'Message connections one-to-one and get a team room the moment someone joins. Notifications keep everyone in the loop.' },
  { icon: ShieldCheck, title: 'Verified & moderated', body: 'Institutional email badges, admin-approved team posts, reporting and blocking keep the community genuine.' },
];

export function Landing() {
  useDocumentTitle('');
  const { data } = useMe();
  const user = data?.user;
  const { theme, toggle } = useTheme();
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[780px] glow" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[780px] bg-grid opacity-70" />

      <header className="relative z-10 mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm text-fg-2 md:flex">
          <a href="#features" className="hover:text-fg">Features</a>
          <a href="#how" className="hover:text-fg">How it works</a>
          <a href="#matching" className="hover:text-fg">Matching</a>
        </nav>
        <div className="flex items-center gap-2">
          <button onClick={toggle} className="rounded-lg p-2 text-fg-2 hover:bg-surface-2" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
          </button>
          {user ? (
            <ButtonLink to="/dashboard" size="sm">Open dashboard</ButtonLink>
          ) : (
            <>
              <Link to="/login" className="hidden px-3 text-sm font-medium text-fg-2 hover:text-fg sm:block">Log in</Link>
              <ButtonLink to="/register" size="sm">Get started</ButtonLink>
            </>
          )}
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-16 px-5 pb-28 pt-10 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
        <div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1.5 text-[12.5px] text-fg-2 backdrop-blur">
            <span className="flex size-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
            For hackathons, projects &amp; research — across every college
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.6 }} className="mt-6 font-display text-[42px] font-semibold leading-[1.04] tracking-tight sm:text-6xl lg:text-[68px]">
            Stop hunting in group chats.
            <br />
            <span className="text-gradient">Find teammates who fit.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.6 }} className="mt-6 max-w-xl text-[17px] leading-relaxed text-fg-2">
            Partner in Project matches students by real skills and GitHub work, shows exactly why someone is a good fit, and tells your team which skills it is still missing.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink to={user ? '/dashboard' : '/register'} size="lg" icon={<Zap className="size-4" />}>
              {user ? 'Go to dashboard' : 'Create your profile — free'}
            </ButtonLink>
            <ButtonLink to={user ? '/opportunities' : '/login'} size="lg" variant="outline">
              Browse teams <ArrowRight className="size-4" />
            </ButtonLink>
          </motion.div>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-muted">
            <span className="flex items-center gap-1.5"><Check className="size-4 text-accent" /> Continue with Google</span>
            <span className="flex items-center gap-1.5"><Check className="size-4 text-accent" /> All public repos, no limits</span>
            <span className="flex items-center gap-1.5"><Check className="size-4 text-accent" /> Free for students</span>
          </div>
        </div>
        <HeroDemo />
      </section>

      <section id="how" className="relative z-10 border-y border-line bg-surface/40">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <motion.div {...fade} className="max-w-2xl">
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-primary">How it works</div>
            <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">From idea to a balanced team in three steps</h2>
          </motion.div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { n: '01', icon: Users, t: 'Build a profile that proves it', b: 'Add your college, roles and availability, link GitHub, and confirm the skills we detect from your repositories.' },
              { n: '02', icon: Briefcase, t: 'Post or discover opportunities', b: 'Team leaders post hackathon and project needs. Students see every post ranked by how well they match.' },
              { n: '03', icon: Radar, t: 'Close the skill gap', b: 'Review applicants with match scores, see what your team still lacks, and invite the people who fill it.' },
            ].map((s, i) => (
              <motion.div key={s.n} {...fade} transition={{ ...fade.transition, delay: i * 0.08 }} className="card relative p-6">
                <span className="absolute right-5 top-5 font-mono text-[13px] text-muted">{s.n}</span>
                <div className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><s.icon className="size-5" /></div>
                <h3 className="mt-5 font-display text-lg font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.b}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <motion.div {...fade} className="mx-auto max-w-2xl text-center">
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-primary">Features</div>
          <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">Everything a team needs before the first commit</h2>
        </motion.div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div key={f.title} {...fade} transition={{ ...fade.transition, delay: (i % 3) * 0.06 }} className="card group p-6 transition hover:-translate-y-1 hover:border-line-strong">
              <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-accent/20 text-fg transition group-hover:scale-105"><f.icon className="size-5" /></div>
              <h3 className="mt-5 font-display text-[17px] font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="matching" className="relative z-10 mx-auto max-w-7xl px-5 pb-24 sm:px-8">
        <motion.div {...fade} className="card overflow-hidden">
          <div className="grid gap-10 p-8 sm:p-12 lg:grid-cols-2">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">The match score</div>
              <h2 className="mt-3 font-display text-3xl font-semibold">No black box. Just a formula you can check.</h2>
              <p className="mt-4 text-fg-2 leading-relaxed">
                Every recommendation shows its score and the reason behind it — like <em className="text-fg not-italic font-medium">“Matches 4 of 5 required skills: Java, Spring Boot, React, MySQL · missing Docker”</em>.
              </p>
              <div className="mt-8 rounded-2xl border border-line bg-bg/60 p-5 font-mono text-[13.5px] leading-7">
                <span className="text-muted">score</span> = <span className="text-primary">0.50</span> × skills
                <br />
                <span className="pl-[52px]">+ <span className="text-accent">0.20</span> × interests</span>
                <br />
                <span className="pl-[52px]">+ <span className="text-[#a78bfa]">0.15</span> × role</span>
                <br />
                <span className="pl-[52px]">+ <span className="text-warn">0.15</span> × availability</span>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-4">
              {[
                ['Skills', 'Required skills you have ÷ required skills', 'var(--primary)', 80],
                ['Interests', 'Shared domains ÷ project domains', 'var(--accent)', 50],
                ['Role', 'You prefer one of the open roles', '#a78bfa', 100],
                ['Availability', 'Your hours ÷ hours needed (max 100%)', 'var(--warn)', 80],
              ].map(([t, d, c, v]) => (
                <div key={t as string} className="rounded-xl border border-line bg-surface-2/60 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{t}</span>
                    <span className="tabular-nums text-muted">{v}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
                    <motion.div className="h-full rounded-full" style={{ background: c as string }} initial={{ width: 0 }} whileInView={{ width: `${v}%` }} viewport={{ once: true }} transition={{ duration: 0.9 }} />
                  </div>
                  <div className="mt-1.5 text-[12px] text-muted">{d}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      <section className="relative z-10 mx-auto max-w-5xl px-5 pb-24 text-center sm:px-8">
        <motion.div {...fade}>
          <h2 className="font-display text-3xl font-semibold sm:text-5xl">Your next team is already here.</h2>
          <p className="mx-auto mt-4 max-w-xl text-fg-2">Create a profile in under two minutes. Link GitHub, confirm your skills, and start getting matched.</p>
          <div className="mt-8 flex justify-center">
            <ButtonLink to={user ? '/dashboard' : '/register'} size="lg">
              {user ? 'Open your dashboard' : 'Get started free'} <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        </motion.div>
      </section>

      <footer className="relative z-10 border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 text-[13px] text-muted sm:flex-row sm:px-8">
          <Logo />
          <p>Built for UCS503 Software Engineering Lab · Thapar Institute of Engineering &amp; Technology</p>
          <div className="flex gap-4"><Link to="/privacy" className="hover:text-fg">Privacy</Link><Link to="/terms" className="hover:text-fg">Terms</Link></div>
        </div>
      </footer>
    </div>
  );
}
