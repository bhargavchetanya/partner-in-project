import { Router } from 'express';
import multer from 'multer';
import { profileSchema } from '@pip/shared';
import { Profile, Avatar, User, UserSkill, Repository, GithubAccount, CollaborationRequest, TeamMember, Opportunity } from '../models';
import { parse, notFound, badRequest, objectId } from '../lib/http';
import { requireAuth, me } from '../lib/auth';
import { getCatalog, validSlugs, resolveOrCreateSkill } from '../lib/catalog';
import { avatarUrl, refreshProfileDerived, areConnected, isBlockedBetween } from '../lib/people';
import { Block } from '../models';

export const profilesRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

function sniffImage(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

async function fullProfile(userId: string, viewerId?: string) {
  const [profile, user, skills, repos, gh] = await Promise.all([
    Profile.findOne({ userId }).lean(),
    User.findById(userId).lean(),
    UserSkill.find({ userId, status: viewerId === userId ? { $in: ['confirmed', 'suggested'] } : 'confirmed' }).lean(),
    Repository.find({ userId }).sort({ featured: -1, featuredOrder: 1, stars: -1, pushedAt: -1 }).lean(),
    GithubAccount.findOne({ userId }).lean(),
  ]);
  if (!profile || !user) throw notFound('Profile not found');
  const isSelf = viewerId === userId;
  if (!isSelf && user.status !== 'active') throw notFound('This profile is not available');

  let connection: 'self' | 'connected' | 'pending_out' | 'pending_in' | 'none' = isSelf ? 'self' : 'none';
  let blockedByMe = false;
  let blocked = false;
  let requestId: string | null = null;
  if (viewerId && !isSelf) {
    if (await areConnected(viewerId, userId)) connection = 'connected';
    else {
      const req = await CollaborationRequest.findOne({
        status: 'pending',
        $or: [
          { fromId: viewerId, toId: userId },
          { fromId: userId, toId: viewerId },
        ],
      }).lean();
      if (req) {
        connection = String(req.fromId) === viewerId ? 'pending_out' : 'pending_in';
        requestId = String(req._id);
      }
    }
    blockedByMe = !!(await Block.exists({ blockerId: viewerId, blockedId: userId }));
    blocked = blockedByMe || (await isBlockedBetween(viewerId, userId));
  }

  const teams = await TeamMember.find({ userId }).lean();
  const teamOpps = await Opportunity.find({ _id: { $in: teams.map((t) => t.opportunityId) }, status: { $in: ['open', 'closed'] } }, { title: 1, eventName: 1, status: 1 }).lean();

  return {
    id: userId,
    name: profile.name,
    headline: profile.headline,
    college: profile.college,
    branch: profile.branch,
    year: profile.year,
    bio: profile.bio,
    location: profile.location,
    website: profile.website,
    interests: profile.interests,
    preferredRoles: profile.preferredRoles,
    availabilityHours: profile.availabilityHours,
    lookingForSkills: profile.lookingForSkills,
    projects: profile.projects,
    achievements: profile.achievements,
    avatarUrl: avatarUrl(profile),
    completeness: profile.completeness,
    institutionVerified: user.institutionVerified,
    emailVerified: user.emailVerified,
    // QR24: email only visible to the user and their connections
    email: isSelf || connection === 'connected' ? user.email : null,
    memberSince: (user as unknown as { createdAt: Date }).createdAt,
    lastSeenAt: user.lastSeenAt,
    skills: skills.map((s) => ({
      id: String(s._id),
      skill: s.skill,
      source: s.source,
      status: s.status,
      proficiency: s.proficiency,
    })),
    github: gh
      ? {
          login: gh.login,
          profileUrl: gh.profileUrl,
          avatarUrl: gh.avatarUrl,
          linkMethod: gh.linkMethod,
          publicRepos: gh.publicRepos,
          followers: gh.followers,
          lastSyncedAt: gh.lastSyncedAt,
        }
      : null,
    featuredRepos: repos.filter((r) => r.featured).slice(0, 6).map(repoDto),
    topRepos: repos.filter((r) => !r.isFork).slice(0, 6).map(repoDto),
    repoCount: repos.length,
    teams: teamOpps.map((o) => ({ id: String(o._id), title: o.title, eventName: o.eventName, status: o.status, role: teams.find((t) => String(t.opportunityId) === String(o._id))?.role })),
    connection,
    requestId,
    blocked,
    blockedByMe,
  };
}

export function repoDto(r: {
  _id: unknown; name: string; fullName: string; description?: string | null; url: string; homepage?: string | null;
  primaryLanguage?: string | null; primaryLanguageColor?: string | null; languages?: unknown; topics?: string[];
  stars?: number; forks?: number; isFork?: boolean; archived?: boolean; pushedAt?: Date | null; repoUpdatedAt?: Date | null;
  detectedTech?: string[]; featured?: boolean; featuredOrder?: number;
}) {
  const langs = r.languages instanceof Map ? Object.fromEntries(r.languages) : ((r.languages as Record<string, number>) ?? {});
  return {
    id: String(r._id),
    name: r.name,
    fullName: r.fullName,
    description: r.description ?? '',
    url: r.url,
    homepage: r.homepage ?? '',
    primaryLanguage: r.primaryLanguage ?? null,
    primaryLanguageColor: r.primaryLanguageColor ?? null,
    languages: langs,
    topics: r.topics ?? [],
    stars: r.stars ?? 0,
    forks: r.forks ?? 0,
    isFork: !!r.isFork,
    archived: !!r.archived,
    pushedAt: r.pushedAt ?? null,
    updatedAt: r.repoUpdatedAt ?? r.pushedAt ?? null,
    detectedTech: r.detectedTech ?? [],
    featured: !!r.featured,
    featuredOrder: r.featuredOrder ?? 0,
  };
}

profilesRouter.get('/me', requireAuth, async (req, res) => {
  const user = me(req);
  res.json(await fullProfile(String(user._id), String(user._id)));
});

profilesRouter.put('/me', requireAuth, async (req, res) => {
  const user = me(req);
  const input = parse(profileSchema, req.body);
  const c = await getCatalog();
  const lookingFor: string[] = [];
  for (const s of input.lookingForSkills) lookingFor.push(await resolveOrCreateSkill(s));
  const profile = await Profile.findOneAndUpdate(
    { userId: user._id },
    {
      $set: {
        name: input.name,
        headline: input.headline,
        college: input.college,
        branch: input.branch,
        year: input.year,
        bio: input.bio,
        location: input.location,
        website: input.website,
        interests: validSlugs(input.interests, c.interests),
        preferredRoles: validSlugs(input.preferredRoles, c.roles),
        availabilityHours: input.availabilityHours,
        lookingForSkills: Array.from(new Set(lookingFor)),
        projects: input.projects,
        achievements: input.achievements,
      },
    },
    { new: true, upsert: true },
  );
  if (user.name !== input.name) {
    user.name = input.name;
    await user.save();
  }
  await refreshProfileDerived(user._id);
  res.json(await fullProfile(String(user._id), String(user._id)));
  void profile;
});

profilesRouter.post('/me/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  const user = me(req);
  if (!req.file) throw badRequest('Choose an image to upload');
  const mime = sniffImage(req.file.buffer);
  if (!mime) throw badRequest('Only JPEG, PNG or WebP images are allowed');
  await Avatar.findOneAndUpdate(
    { userId: user._id },
    { $set: { mime, data: req.file.buffer, size: req.file.size } },
    { upsert: true },
  );
  const profile = await Profile.findOneAndUpdate({ userId: user._id }, { $inc: { avatarVersion: 1 } }, { new: true });
  await refreshProfileDerived(user._id);
  res.json({ avatarUrl: profile ? avatarUrl(profile) : null });
});

profilesRouter.delete('/me/avatar', requireAuth, async (req, res) => {
  const user = me(req);
  await Avatar.deleteOne({ userId: user._id });
  const profile = await Profile.findOneAndUpdate({ userId: user._id }, { $set: { avatarVersion: 0 } }, { new: true });
  await refreshProfileDerived(user._id);
  res.json({ avatarUrl: profile ? avatarUrl(profile) : null });
});

profilesRouter.get('/:userId/avatar', async (req, res) => {
  const id = objectId(req.params.userId, 'Avatar');
  const a = await Avatar.findOne({ userId: id }).lean();
  if (!a) throw notFound('No avatar');
  res.setHeader('Content-Type', a.mime);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(Buffer.from(a.data.buffer ?? a.data));
});

profilesRouter.get('/:userId', requireAuth, async (req, res) => {
  const viewer = me(req);
  const id = String(objectId(req.params.userId, 'Profile'));
  res.json(await fullProfile(id, String(viewer._id)));
});
