import { Router } from 'express';
import { z } from 'zod';
import { skillAddSchema, skillUpdateSchema, describeEvidence } from '@pip/shared';
import { UserSkill } from '../models';
import { parse, notFound, objectId, conflict } from '../lib/http';
import { requireAuth, me } from '../lib/auth';
import { getCatalog, resolveOrCreateSkill } from '../lib/catalog';
import { refreshProfileDerived } from '../lib/people';

export const skillsRouter = Router();

async function listFor(userId: string) {
  const [rows, c] = await Promise.all([UserSkill.find({ userId }).lean(), getCatalog()]);
  const bySlug = new Map(c.skills.map((s) => [s.slug, s]));
  const items = rows.map((r) => {
    const cat = bySlug.get(r.skill);
    return {
      id: String(r._id),
      skill: r.skill,
      name: cat?.name ?? r.skill,
      category: cat?.category ?? 'other',
      source: r.source,
      status: r.status,
      proficiency: r.proficiency,
      detectedOnGithub: r.detectedOnGithub,
      repoCount: r.repoCount,
      codeShare: r.codeShare,
      lastUsed: r.lastUsed,
      evidence: r.evidence,
      evidenceSummary: r.detectedOnGithub
        ? describeEvidence({ repoCount: r.repoCount, codeShare: r.codeShare ?? undefined, signals: Array.from(new Set(r.evidence.map((e) => e.signal))) as never, lastUsed: undefined })
        : '',
    };
  });
  items.sort((a, b) => a.name.localeCompare(b.name));
  return {
    skills: items,
    counts: {
      confirmed: items.filter((i) => i.status === 'confirmed').length,
      suggested: items.filter((i) => i.status === 'suggested').length,
      rejected: items.filter((i) => i.status === 'rejected').length,
      manual: items.filter((i) => i.source !== 'github').length,
      github: items.filter((i) => i.source !== 'manual').length,
    },
    categories: c.categories,
  };
}

skillsRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await listFor(String(me(req)._id)));
});

/** Add a skill manually. If it was already suggested by GitHub, it becomes confirmed (source "both"). */
skillsRouter.post('/me', requireAuth, async (req, res) => {
  const user = me(req);
  const input = parse(skillAddSchema, req.body);
  const slug = await resolveOrCreateSkill(input.name);
  const existing = await UserSkill.findOne({ userId: user._id, skill: slug });
  if (existing) {
    if (existing.status === 'confirmed') throw conflict('You already have this skill', 'SKILL_EXISTS');
    existing.status = 'confirmed';
    existing.proficiency = input.proficiency;
    existing.source = existing.source === 'github' ? 'both' : existing.source;
    await existing.save();
  } else {
    await UserSkill.create({ userId: user._id, skill: slug, source: 'manual', status: 'confirmed', proficiency: input.proficiency });
  }
  await refreshProfileDerived(user._id);
  res.status(201).json(await listFor(String(user._id)));
});

/** Edit proficiency, or confirm / reject a GitHub suggestion. */
skillsRouter.patch('/me/:id', requireAuth, async (req, res) => {
  const user = me(req);
  const input = parse(skillUpdateSchema, req.body);
  const row = await UserSkill.findOne({ _id: objectId(req.params.id, 'Skill'), userId: user._id });
  if (!row) throw notFound('Skill not found');
  if (input.proficiency) row.proficiency = input.proficiency;
  if (input.status) row.status = input.status;
  await row.save();
  await refreshProfileDerived(user._id);
  res.json(await listFor(String(user._id)));
});

/** Bulk confirm / reject suggestions. */
skillsRouter.post('/me/bulk', requireAuth, async (req, res) => {
  const user = me(req);
  const { ids, status } = parse(z.object({ ids: z.array(z.string()).min(1).max(500), status: z.enum(['confirmed', 'rejected']) }), req.body);
  await UserSkill.updateMany({ userId: user._id, _id: { $in: ids.map((i) => objectId(i, 'Skill')) }, status: { $ne: status } }, { $set: { status } });
  await refreshProfileDerived(user._id);
  res.json(await listFor(String(user._id)));
});

/**
 * Remove a skill. Manual-only skills are deleted. Skills that GitHub still detects are
 * marked "rejected" instead, so the next sync does not suggest them again.
 */
skillsRouter.delete('/me/:id', requireAuth, async (req, res) => {
  const user = me(req);
  const row = await UserSkill.findOne({ _id: objectId(req.params.id, 'Skill'), userId: user._id });
  if (!row) throw notFound('Skill not found');
  if (row.detectedOnGithub) {
    row.status = 'rejected';
    row.source = 'github';
    await row.save();
  } else {
    await row.deleteOne();
  }
  await refreshProfileDerived(user._id);
  res.json(await listFor(String(user._id)));
});
