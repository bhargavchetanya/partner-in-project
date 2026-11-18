import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarClock, Clock, GitFork, Github, Star, Users } from 'lucide-react';
import { useCatalog } from '@/lib/hooks';
import type { Opportunity, PersonCard, Repo } from '@/lib/types';
import { cn, deadlineLabel, formatDate, timeAgo, TYPE_LABEL, yearLabel, STATUS_LABEL } from '@/lib/utils';
import { Avatar, Badge, Chip, VerifiedBadge } from './ui';
import { MatchDetails, MatchGauge, SkillChips } from './match';

export function OpportunityCard({ o, index = 0 }: { o: Opportunity; index?: number }) {
  const { skillName, roleName } = useCatalog();
  const dl = deadlineLabel(o.deadline);
  const matched = new Set(o.match?.matchedSkills ?? []);
  return (
    <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.3) }} className="card group flex flex-col p-5 transition hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <Badge tone="primary">{TYPE_LABEL[o.type] ?? o.type}</Badge>
            <span className="truncate text-muted">{o.eventName}</span>
          </div>
          <Link to={`/opportunities/${o.id}`} className="mt-2 block font-display text-[17px] font-semibold leading-snug text-fg hover:text-primary">
            {o.title}
          </Link>
        </div>
        {o.match && <MatchGauge score={o.match.score} size={58} stroke={6} />}
      </div>
      <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-muted">{o.description}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {o.requiredSkills.slice(0, 6).map((s) => (
          <Chip key={s} tone={matched.has(s) ? 'accent' : o.match ? 'neutral' : 'neutral'}>{skillName(s)}</Chip>
        ))}
        {o.requiredSkills.length > 6 && <Chip>+{o.requiredSkills.length - 6}</Chip>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {o.openRoles.filter((r) => r.remaining > 0).map((r) => (
          <span key={r.role} className="rounded-md bg-surface-2 px-2 py-1 text-[12px] text-fg-2">
            {roleName(r.role)} <span className="text-muted">×{r.remaining}</span>
          </span>
        ))}
      </div>
      {o.match && <p className="mt-3 text-[12.5px] text-fg-2">{o.match.summary}</p>}
      <div className="mt-auto pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[12.5px]">
          <div className="flex items-center gap-2 min-w-0">
            {o.leader && <Avatar name={o.leader.name} src={o.leader.avatarUrl} size={24} />}
            <span className="truncate text-muted">{o.leader?.name}</span>
          </div>
          <div className="flex items-center gap-3 text-muted">
            <span className="flex items-center gap-1"><Users className="size-3.5" />{o.memberCount + 1}/{o.teamSize}</span>
            <span className={cn('flex items-center gap-1', dl.urgent && 'text-warn', dl.past && 'text-danger')} title={formatDate(o.deadline, true)}>
              <CalendarClock className="size-3.5" />{dl.text}
            </span>
          </div>
        </div>
        {o.myApplicationStatus && (
          <div className="mt-2"><Badge tone={o.myApplicationStatus === 'accepted' ? 'accent' : o.myApplicationStatus === 'rejected' ? 'danger' : 'warn'}>You applied · {STATUS_LABEL[o.myApplicationStatus] ?? o.myApplicationStatus}</Badge></div>
        )}
      </div>
    </motion.article>
  );
}

export function PersonCardView({ p, index = 0, actions, showDetails = true }: { p: PersonCard; index?: number; actions?: React.ReactNode; showDetails?: boolean }) {
  const { roleName } = useCatalog();
  return (
    <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.3) }} className="card flex flex-col p-5 transition hover:border-line-strong">
      <div className="flex items-start gap-3.5">
        <Link to={`/u/${p.id}`}><Avatar name={p.name} src={p.avatarUrl} size={52} /></Link>
        <div className="min-w-0 flex-1">
          <Link to={`/u/${p.id}`} className="flex items-center gap-1.5 font-display text-[16px] font-semibold text-fg hover:text-primary">
            <span className="truncate">{p.name}</span>
            {p.institutionVerified && <VerifiedBadge small />}
          </Link>
          <p className="truncate text-[13px] text-fg-2">{p.headline || p.roles.map(roleName).join(' · ') || 'Student'}</p>
          <p className="truncate text-[12px] text-muted">{[p.college, yearLabel(p.year)].filter(Boolean).join(' · ')}</p>
        </div>
        {p.match && <MatchGauge score={p.match.score} size={56} stroke={6} />}
      </div>
      <SkillChips className="mt-4" slugs={p.skills} highlight={p.match?.matchedSkills} max={7} />
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
        {p.roles.length > 0 && <span>{p.roles.slice(0, 2).map(roleName).join(', ')}</span>}
        <span className="flex items-center gap-1"><Clock className="size-3.5" />{p.availabilityHours} h/week</span>
        {p.repoCount !== undefined && p.repoCount > 0 && <span className="flex items-center gap-1"><Github className="size-3.5" />{p.repoCount} repos</span>}
      </div>
      {p.topRepos && p.topRepos.length > 0 && (
        <div className="mt-3 space-y-1">
          {p.topRepos.map((r) => (
            <div key={r.name} className="flex items-center justify-between rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px]">
              <span className="truncate font-mono text-fg-2">{r.name}</span>
              <span className="flex shrink-0 items-center gap-2 text-muted">
                {r.language && <span>{r.language}</span>}
                <span className="flex items-center gap-0.5"><Star className="size-3" />{r.stars}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {p.match && <p className="mt-3 text-[12.5px] text-fg-2">{p.match.summary}</p>}
      {showDetails && p.match && <div className="mt-2"><MatchDetails match={p.match} /></div>}
      {actions && <div className="mt-auto flex flex-wrap gap-2 pt-4">{actions}</div>}
    </motion.article>
  );
}

const langColors: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5', Java: '#b07219', 'C++': '#f34b7d', C: '#555555', Go: '#00ADD8',
  Rust: '#dea584', Kotlin: '#A97BFF', Swift: '#F05138', Dart: '#00B4AB', HTML: '#e34c26', CSS: '#563d7c', 'Jupyter Notebook': '#DA5B0B',
  PHP: '#4F5D95', Ruby: '#701516', Shell: '#89e051', Vue: '#41b883', 'C#': '#178600', Solidity: '#AA6746',
};

export function RepoCard({ r, onToggleFeatured, featuredDisabled }: { r: Repo; onToggleFeatured?: () => void; featuredDisabled?: boolean }) {
  const { skillName } = useCatalog();
  const total = Object.values(r.languages).reduce((a, b) => a + b, 0);
  const langs = Object.entries(r.languages).sort((a, b) => b[1] - a[1]);
  return (
    <article className={cn('card flex flex-col p-5 transition hover:border-line-strong', r.featured && 'border-primary/50')}>
      <div className="flex items-start justify-between gap-3">
        <a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 font-mono text-[14.5px] font-semibold text-fg hover:text-primary">
          <span className="truncate block">{r.name}</span>
        </a>
        <div className="flex shrink-0 items-center gap-1.5">
          {r.isFork && <Badge>Fork</Badge>}
          {r.archived && <Badge tone="warn">Archived</Badge>}
          {r.featured && <Badge tone="primary"><Star className="size-3 fill-current" />Featured</Badge>}
        </div>
      </div>
      <p className="mt-1.5 line-clamp-2 min-h-[2.6em] text-[13px] text-muted">{r.description || 'No description'}</p>
      {total > 0 && langs.length > 1 && (
        <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-surface-3">
          {langs.map(([l, b]) => <span key={l} title={`${l} ${Math.round((b / total) * 100)}%`} style={{ width: `${(b / total) * 100}%`, background: langColors[l] ?? 'var(--muted)' }} />)}
        </div>
      )}
      {r.topics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {r.topics.slice(0, 8).map((t) => <span key={t} className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] text-primary">{t}</span>)}
        </div>
      )}
      {r.detectedTech.length > 0 && (
        <div className="mt-2 text-[11.5px] text-muted">
          Detected: {r.detectedTech.slice(0, 8).map(skillName).join(' · ')}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-[12.5px] text-muted">
        <div className="flex items-center gap-3">
          {r.primaryLanguage && (
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: r.primaryLanguageColor ?? langColors[r.primaryLanguage] ?? 'var(--muted)' }} />
              {r.primaryLanguage}
            </span>
          )}
          <span className="flex items-center gap-1"><Star className="size-3.5" />{r.stars}</span>
          <span className="flex items-center gap-1"><GitFork className="size-3.5" />{r.forks}</span>
          {r.updatedAt && <span title={formatDate(r.updatedAt, true)}>Updated {timeAgo(r.updatedAt)}</span>}
        </div>
        <div className="flex items-center gap-2">
          {onToggleFeatured && (
            <button onClick={onToggleFeatured} disabled={featuredDisabled && !r.featured} className={cn('rounded-lg px-2 py-1 text-[12px] font-medium transition disabled:opacity-40', r.featured ? 'bg-primary-soft text-primary' : 'hover:bg-surface-2 text-fg-2')}>
              {r.featured ? 'Unfeature' : 'Feature'}
            </button>
          )}
          <a href={r.url} target="_blank" rel="noreferrer" className="rounded-lg px-2 py-1 text-[12px] font-medium text-fg-2 hover:bg-surface-2">Open ↗</a>
        </div>
      </div>
    </article>
  );
}
