import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, PartyPopper, Radar, UserPlus, XCircle } from 'lucide-react';
import type { MatchResult } from '@pip/shared';
import { api, errorMessage } from '@/lib/api';
import { useCatalog, useDocumentTitle } from '@/lib/hooks';
import type { Opportunity, TeamMemberDto } from '@/lib/types';
import { cn, yearLabel } from '@/lib/utils';
import { Avatar, Badge, Button, ButtonLink, Card, CardHeader, Chip, EmptyState, ErrorState, PageLoader, VerifiedBadge } from '@/components/ui';
import { MatchDetails, MatchGauge } from '@/components/match';
import { InviteDialog } from '@/components/dialogs';

interface Suggestion {
  userId: string;
  name: string;
  headline: string;
  college: string;
  year: number;
  avatarUrl: string | null;
  roles: string[];
  availabilityHours: number;
  institutionVerified: boolean;
  fillsSkills: string[];
  gapScore: number;
  overallScore: number;
  match: MatchResult;
  applied: boolean;
  invited: boolean;
}
interface GapResponse {
  opportunity: Opportunity;
  required: string[];
  covered: string[];
  missing: string[];
  coverage: number;
  rows: { skill: string; covered: boolean; coveredBy: { userId: string; name: string }[] }[];
  teamSkills: string[];
  complete: boolean;
  message: string;
  members: TeamMemberDto[];
  suggestions: Suggestion[];
  totalCandidates: number;
}

export default function SkillGapPage() {
  const { id } = useParams();
  const { skillName, roleName } = useCatalog();
  const [all, setAll] = useState(false);
  const [invite, setInvite] = useState<Suggestion | null>(null);
  const q = useQuery({ queryKey: ['skill-gap', id, all], queryFn: () => api.get<GapResponse>(`/opportunities/${id}/skill-gap${all ? '?all=1' : ''}`) });
  useDocumentTitle('Skill gap analysis');
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const g = q.data!;
  const isLeader = g.opportunity.isLeader;
  const r = 70;
  const c = 2 * Math.PI * r;

  return (
    <div>
      <Link to={`/opportunities/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {g.opportunity.title}</Link>
      <div className="mb-6">
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-primary">Team skill gap analyzer</div>
        <h1 className="mt-1 font-display text-2xl font-semibold sm:text-[28px]">What is “{g.opportunity.title}” missing?</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card className="flex flex-col items-center p-6 text-center">
            <div className="relative" style={{ width: 170, height: 170 }}>
              <svg width={170} height={170} className="-rotate-90">
                <circle cx={85} cy={85} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={14} />
                <motion.circle cx={85} cy={85} r={r} fill="none" stroke={g.complete ? 'var(--accent)' : 'var(--primary)'} strokeWidth={14} strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - g.coverage / 100) }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-4xl font-semibold">{g.coverage}%</span>
                <span className="text-[12px] uppercase tracking-wider text-muted">coverage</span>
              </div>
            </div>
            <p className="mt-4 font-medium">{g.message}</p>
            <p className="mt-1 text-[13px] text-muted">{g.covered.length} of {g.required.length} required skills covered by {g.members.length} member{g.members.length === 1 ? '' : 's'}</p>
          </Card>

          <Card>
            <CardHeader title="Required skills" subtitle="Who covers what" />
            <ul className="space-y-2 px-5 pb-5 pt-3">
              {g.rows.map((row) => (
                <li key={row.skill} className={cn('flex items-start gap-3 rounded-xl px-3 py-2.5', row.covered ? 'bg-accent-soft' : 'bg-warn-soft')}>
                  {row.covered ? <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-accent" /> : <XCircle className="mt-0.5 size-4.5 shrink-0 text-warn" />}
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{skillName(row.skill)}</div>
                    <div className="text-[12px] text-muted">{row.covered ? row.coveredBy.map((x) => x.name.split(' ')[0]).join(', ') : 'Nobody on the team yet'}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="All skills in the team" subtitle="Including ones not required" />
            <div className="flex flex-wrap gap-1.5 px-5 pb-5 pt-3">
              {g.teamSkills.length ? g.teamSkills.map((s) => <Chip key={s} tone={g.required.includes(s) ? 'accent' : 'neutral'}>{skillName(s)}</Chip>) : <span className="text-sm text-muted">No confirmed skills yet</span>}
            </div>
          </Card>
        </div>

        <div className="min-w-0">
          {g.complete ? (
            <EmptyState icon={<PartyPopper />} title="Your team covers all required skills" body="Nice — every required skill is covered by at least one member." action={<ButtonLink to={`/opportunities/${id}/team`}>Go to team chat</ButtonLink>} />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-display text-xl font-semibold"><Radar className="size-5 text-primary" /> Students who can fill the gap</h2>
                  <p className="mt-1 text-[13.5px] text-muted">Missing: {g.missing.map(skillName).join(', ')}. Ranked by how well they match the missing skills.</p>
                </div>
                {g.totalCandidates > g.suggestions.length && !all && <Button variant="secondary" size="sm" onClick={() => setAll(true)}>See all {g.totalCandidates}</Button>}
                {all && <Button variant="ghost" size="sm" onClick={() => setAll(false)}>Show top 5</Button>}
              </div>
              {g.suggestions.length === 0 ? (
                <EmptyState icon={<Radar />} title="No one with these skills yet" body="As more students join and confirm skills, suggestions will appear here. You can also search Discover." action={<ButtonLink to={`/discover?context=${id}`} variant="secondary">Search Discover</ButtonLink>} />
              ) : (
                <div className="space-y-4">
                  {g.suggestions.map((s, i) => (
                    <motion.div key={s.userId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                      <Card className="p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                          <Link to={`/u/${s.userId}`}><Avatar name={s.name} src={s.avatarUrl} size={52} /></Link>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link to={`/u/${s.userId}`} className="font-display text-[16px] font-semibold hover:text-primary">{s.name}</Link>
                              {s.institutionVerified && <VerifiedBadge small />}
                              {s.applied && <Badge tone="primary">Already applied</Badge>}
                              {s.invited && <Badge tone="accent">Invited</Badge>}
                            </div>
                            <div className="text-[13px] text-muted">{[s.headline || s.roles.map(roleName).join(', '), s.college, yearLabel(s.year)].filter(Boolean).join(' · ')} · {s.availabilityHours} h/wk</div>
                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                              <span className="text-[12px] font-medium text-fg-2">Fills:</span>
                              {s.fillsSkills.map((x) => <Chip key={x} tone="accent">{skillName(x)}</Chip>)}
                            </div>
                            <div className="mt-3"><MatchDetails match={s.match} /></div>
                          </div>
                          <div className="flex items-center gap-4 sm:flex-col sm:items-end">
                            <div className="flex gap-3">
                              <div className="text-center"><MatchGauge score={s.gapScore} size={60} stroke={6} label="gap fit" /><div className="mt-1 text-[10.5px] text-muted">gap fit</div></div>
                              <div className="text-center"><MatchGauge score={s.overallScore} size={60} stroke={6} /><div className="mt-1 text-[10.5px] text-muted">overall</div></div>
                            </div>
                            {isLeader && !s.invited && g.opportunity.status === 'open' && (
                              s.applied ? <ButtonLink to={`/opportunities/${id}/applications`} size="sm" variant="secondary">Review</ButtonLink> : <Button size="sm" icon={<UserPlus className="size-3.5" />} onClick={() => setInvite(s)}>Invite</Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {invite && <InviteDialog open onClose={() => { setInvite(null); q.refetch(); }} userId={invite.userId} userName={invite.name} defaultOpportunityId={id} />}
    </div>
  );
}
