import { computeMatch, skillCoverage, MATCH_WEIGHTS } from './matching';
import { analyzeSkillGap } from './skillGap';

describe('computeMatch (SRS FR9)', () => {
  const required = ['java', 'spring-boot', 'react', 'mysql', 'docker'];

  test('skill coverage 4/5 = 80% (master prompt example)', () => {
    expect(skillCoverage(required, ['java', 'spring-boot', 'react', 'mysql'])).toBe(80);
  });

  test('weights sum to 1', () => {
    const sum = Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  test('worked example from the plan = 77%', () => {
    const r = computeMatch(
      { skills: required, interests: ['ai-ml', 'web'], roles: ['backend'], hoursPerWeek: 10 },
      { skills: ['java', 'spring-boot', 'react', 'mysql', 'python'], interests: ['web'], roles: ['backend', 'fullstack'], hoursPerWeek: 8 },
    );
    // 0.5*0.8 + 0.2*0.5 + 0.15*1 + 0.15*0.8 = 0.77
    expect(r.score).toBe(77);
    expect(r.matchedSkills).toEqual(['java', 'spring-boot', 'react', 'mysql']);
    expect(r.missingSkills).toEqual(['docker']);
    expect(r.requiredSkills).toHaveLength(5);
    expect(r.summary).toMatch(/Matches 4 of 5 required skills/);
    expect(r.summary).toMatch(/missing docker/);
  });

  test('perfect candidate scores 100 and empty candidate scores 0', () => {
    const req = { skills: ['react'], interests: ['web'], roles: ['frontend'], hoursPerWeek: 5 };
    expect(computeMatch(req, { skills: ['react'], interests: ['web'], roles: ['frontend'], hoursPerWeek: 20 }).score).toBe(100);
    expect(computeMatch(req, { skills: [], interests: [], roles: [], hoursPerWeek: 0 }).score).toBe(0);
  });

  test('availability is capped at 1 (more hours never exceeds 100%)', () => {
    const r = computeMatch(
      { skills: [], interests: [], roles: [], hoursPerWeek: 10 },
      { skills: [], interests: [], roles: [], hoursPerWeek: 40 },
    );
    expect(r.components.find((c) => c.key === 'availability')!.value).toBe(1);
    expect(r.score).toBe(100);
  });

  test('missing requirement data is excluded and weights re-normalised', () => {
    // Only skills specified -> skill weight becomes 1.0
    const r = computeMatch(
      { skills: ['react', 'nodejs'], interests: [], roles: [], hoursPerWeek: 0 },
      { skills: ['react'], interests: ['web'], roles: ['frontend'], hoursPerWeek: 10 },
    );
    expect(r.score).toBe(50);
    const skill = r.components.find((c) => c.key === 'skill')!;
    expect(skill.effectiveWeight).toBeCloseTo(1);
    expect(r.components.filter((c) => !c.included)).toHaveLength(3);
  });

  test('score is always within 0..100 for random inputs', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f'];
    const pick = () => pool.filter(() => Math.random() > 0.5);
    for (let i = 0; i < 500; i++) {
      const r = computeMatch(
        { skills: pick(), interests: pick(), roles: pick(), hoursPerWeek: Math.floor(Math.random() * 20) },
        { skills: pick(), interests: pick(), roles: pick(), hoursPerWeek: Math.floor(Math.random() * 40) },
      );
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      const included = r.components.filter((c) => c.included);
      if (included.length) {
        expect(included.reduce((s, c) => s + c.effectiveWeight, 0)).toBeCloseTo(1, 10);
      }
    }
  });

  test('duplicate required skills are counted once', () => {
    const r = computeMatch({ skills: ['react', 'react', 'nodejs'], interests: [], roles: [] }, { skills: ['react'], interests: [], roles: [] });
    expect(r.requiredSkills).toEqual(['react', 'nodejs']);
    expect(r.score).toBe(50);
  });

  test('uses display names in explanations', () => {
    const names: Record<string, string> = { react: 'React', nodejs: 'Node.js', mongodb: 'MongoDB', docker: 'Docker' };
    const r = computeMatch(
      { skills: ['react', 'nodejs', 'mongodb', 'docker'], interests: [], roles: [] },
      { skills: ['react', 'nodejs', 'mongodb'], interests: [], roles: [] },
      (s) => names[s] ?? s,
    );
    expect(r.summary).toBe('Matches 3 of 4 required skills: React, Node.js, MongoDB · missing Docker');
  });
});

describe('analyzeSkillGap (SRS FR19)', () => {
  test('covered, missing and coverage percentage', () => {
    const g = analyzeSkillGap(
      ['react', 'nodejs', 'mongodb', 'docker'],
      [
        { userId: '1', name: 'Leader', skills: ['react', 'figma'] },
        { userId: '2', name: 'Member', skills: ['nodejs', 'react'] },
      ],
    );
    expect(g.covered).toEqual(['react', 'nodejs']);
    expect(g.missing).toEqual(['mongodb', 'docker']);
    expect(g.coverage).toBe(50);
    expect(g.rows[0].coveredBy.map((c) => c.name)).toEqual(['Leader', 'Member']);
    expect(g.complete).toBe(false);
  });

  test('no gap shows the SRS message', () => {
    const g = analyzeSkillGap(['react'], [{ userId: '1', name: 'A', skills: ['react'] }]);
    expect(g.complete).toBe(true);
    expect(g.message).toBe('Your team covers all required skills');
    expect(g.coverage).toBe(100);
  });
});
