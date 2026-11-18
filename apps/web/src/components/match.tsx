import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ChevronDown, CircleDashed, Info, XCircle } from 'lucide-react';
import type { MatchResult } from '@pip/shared';
import { useCatalog } from '@/lib/hooks';
import { cn, scoreTone } from '@/lib/utils';
import { Chip } from './ui';

const toneColor = { accent: 'var(--accent)', primary: 'var(--primary)', warn: 'var(--warn)', muted: 'var(--muted)' } as const;

/** Circular percentage gauge that animates to its value. */
export function MatchGauge({ score, size = 72, stroke = 7, label = 'match', className }: { score: number; size?: number; stroke?: number; label?: string; className?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <div className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }} role="img" aria-label={`${score}% ${label}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={toneColor[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - score / 100) }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-display font-semibold text-fg" style={{ fontSize: size * 0.27 }}>
          {score}
          <span style={{ fontSize: size * 0.15 }} className="text-muted">%</span>
        </span>
        {size >= 64 && <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">{label}</span>}
      </div>
    </div>
  );
}

export function MatchPill({ score, className }: { score: number; className?: string }) {
  const tone = scoreTone(score);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'primary' && 'bg-primary-soft text-primary',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'muted' && 'bg-surface-2 text-muted',
        className,
      )}
    >
      {score}% match
    </span>
  );
}

/** Full explanation: component bars with weights + matched / missing / required skills. */
export function MatchBreakdown({ match, compact, title = 'Why this match' }: { match: MatchResult; compact?: boolean; title?: string }) {
  const { skillName } = useCatalog();
  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex items-center gap-4">
          <MatchGauge score={match.score} size={84} />
          <div className="min-w-0">
            <div className="font-display text-[15px] font-semibold">{title}</div>
            <p className="text-[13px] text-muted mt-0.5">{match.summary}</p>
          </div>
        </div>
      )}
      <div className="space-y-2.5">
        {match.components.map((c) => (
          <div key={c.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[12.5px]">
              <span className="font-medium text-fg-2">
                {c.label}{' '}
                <span className="text-muted font-normal">
                  · weight {Math.round(c.weight * 100)}%{c.included && Math.abs(c.effectiveWeight - c.weight) > 0.001 ? ` → ${Math.round(c.effectiveWeight * 100)}%` : ''}
                </span>
              </span>
              <span className={cn('tabular-nums', c.included ? 'text-fg' : 'text-muted')}>{c.included ? `${Math.round((c.value ?? 0) * 100)}%` : 'n/a'}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-3">
              {c.included && (
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: c.key === 'skill' ? 'var(--primary)' : c.key === 'interest' ? 'var(--accent)' : c.key === 'role' ? '#a78bfa' : 'var(--warn)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round((c.value ?? 0) * 100)}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              )}
            </div>
            <p className="mt-1 text-[12px] text-muted">{c.detail}</p>
          </div>
        ))}
      </div>
      {match.requiredSkills.length > 0 && (
        <div className="space-y-2.5 border-t border-line pt-3">
          <SkillRow label="Matched" icon={<CheckCircle2 className="size-3.5 text-accent" />} slugs={match.matchedSkills} tone="accent" nameOf={skillName} empty="None yet" />
          <SkillRow label="Missing" icon={<XCircle className="size-3.5 text-warn" />} slugs={match.missingSkills} tone="warn" nameOf={skillName} empty="Nothing — full coverage" />
          <SkillRow label="Required" icon={<CircleDashed className="size-3.5 text-muted" />} slugs={match.requiredSkills} tone="neutral" nameOf={skillName} empty="" />
        </div>
      )}
      <p className="flex items-start gap-1.5 text-[11.5px] text-muted">
        <Info className="size-3.5 mt-px shrink-0" />
        Score = 50% skills + 20% interests + 15% role + 15% availability. Parts not specified are left out and the rest re-weighted. Only confirmed skills count.
      </p>
    </div>
  );
}

function SkillRow({ label, icon, slugs, tone, nameOf, empty }: { label: string; icon: React.ReactNode; slugs: string[]; tone: 'accent' | 'warn' | 'neutral'; nameOf: (s: string) => string; empty: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex w-[84px] items-center gap-1 text-[12px] font-medium text-fg-2">
        {icon}
        {label}
      </span>
      {slugs.length ? slugs.map((s) => <Chip key={s} tone={tone}>{nameOf(s)}</Chip>) : <span className="text-[12px] text-muted">{empty}</span>}
    </div>
  );
}

/** Collapsible breakdown used inside cards. */
export function MatchDetails({ match }: { match: MatchResult }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline">
        {open ? 'Hide' : 'Show'} match details <ChevronDown className={cn('size-3.5 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-xl border border-line bg-surface-2/50 p-4">
          <MatchBreakdown match={match} compact />
        </motion.div>
      )}
    </div>
  );
}

export function SkillChips({ slugs, max = 6, highlight, className }: { slugs: string[]; max?: number; highlight?: string[]; className?: string }) {
  const { skillName } = useCatalog();
  const hl = new Set(highlight ?? []);
  const shown = slugs.slice(0, max);
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {shown.map((s) => (
        <Chip key={s} tone={hl.has(s) ? 'accent' : 'neutral'}>
          {skillName(s)}
        </Chip>
      ))}
      {slugs.length > max && <Chip>+{slugs.length - max}</Chip>}
    </div>
  );
}
