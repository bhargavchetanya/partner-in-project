/**
 * Team skill gap analysis (SRS FR19).
 * Team skills = union of the confirmed skills of the leader and members.
 */

export interface TeamMemberSkills {
  userId: string;
  name: string;
  skills: string[];
}

export interface SkillCoverageRow {
  skill: string;
  covered: boolean;
  coveredBy: { userId: string; name: string }[];
}

export interface SkillGapResult {
  required: string[];
  covered: string[];
  missing: string[];
  coverage: number; // 0..100
  rows: SkillCoverageRow[];
  /** All distinct skills present in the team (including ones not required). */
  teamSkills: string[];
  complete: boolean;
  message: string;
}

export function analyzeSkillGap(required: string[], members: TeamMemberSkills[]): SkillGapResult {
  const req = Array.from(new Set(required.filter(Boolean)));
  const teamSkills = Array.from(new Set(members.flatMap((m) => m.skills)));
  const rows: SkillCoverageRow[] = req.map((skill) => {
    const coveredBy = members
      .filter((m) => m.skills.includes(skill))
      .map((m) => ({ userId: m.userId, name: m.name }));
    return { skill, covered: coveredBy.length > 0, coveredBy };
  });
  const covered = rows.filter((r) => r.covered).map((r) => r.skill);
  const missing = rows.filter((r) => !r.covered).map((r) => r.skill);
  const coverage = req.length === 0 ? 100 : Math.round((covered.length / req.length) * 100);
  const complete = missing.length === 0;
  return {
    required: req,
    covered,
    missing,
    coverage,
    rows,
    teamSkills,
    complete,
    message: complete
      ? 'Your team covers all required skills'
      : `${missing.length} required skill${missing.length === 1 ? '' : 's'} not covered yet`,
  };
}
