import { Router } from 'express';
import { z } from 'zod';
import { config, features } from '../config';
import { GithubAccount, Repository, OAuthState } from '../models';
import { parse, badRequest, conflict, AppError, objectId } from '../lib/http';
import { requireAuth, me } from '../lib/auth';
import { randomToken, encrypt } from '../lib/crypto';
import {
  syncGithub, disconnectGithub, fetchGithubUser, parseGithubUsername, MANUAL_COOLDOWN_MS, AUTO_REFRESH_MS,
} from '../services/github';
import { repoDto } from './profiles';
import { refreshProfileDerived } from '../lib/people';

export const githubRouter = Router();

function runSyncInBackground(userId: string, force: boolean) {
  syncGithub(userId, { force }).catch((e) => {
    if (!(e instanceof AppError)) console.error('[github] sync failed', e);
  });
}

async function statusFor(userId: string) {
  const acc = await GithubAccount.findOne({ userId }).lean();
  if (!acc) return { connected: false, oauthAvailable: features.githubOAuth };
  const repoCount = await Repository.countDocuments({ userId });
  return {
    connected: true,
    oauthAvailable: features.githubOAuth,
    login: acc.login,
    name: acc.name,
    avatarUrl: acc.avatarUrl,
    profileUrl: acc.profileUrl,
    bio: acc.bio,
    followers: acc.followers,
    publicRepos: acc.publicRepos,
    linkMethod: acc.linkMethod,
    verified: acc.linkMethod === 'oauth',
    lastSyncedAt: acc.lastSyncedAt,
    nextAutoRefreshAt: acc.lastSyncedAt ? new Date(acc.lastSyncedAt.getTime() + AUTO_REFRESH_MS) : null,
    syncStatus: acc.syncStatus,
    syncError: acc.syncError,
    includeForks: acc.includeForks,
    repoCount,
  };
}

githubRouter.get('/status', requireAuth, async (req, res) => {
  const user = me(req);
  const s = await statusFor(String(user._id));
  // Automatic refresh at most once every 24 h (QR11); stale data is still shown meanwhile (QR18).
  if (s.connected && s.syncStatus !== 'syncing' && (!s.lastSyncedAt || Date.now() - new Date(s.lastSyncedAt).getTime() > AUTO_REFRESH_MS)) {
    runSyncInBackground(String(user._id), false);
  }
  res.json(s);
});

/** Link by username or profile URL (FR6). */
githubRouter.post('/link', requireAuth, async (req, res) => {
  const user = me(req);
  const { username } = parse(z.object({ username: z.string().trim().min(1).max(200) }), req.body);
  const login = parseGithubUsername(username);
  if (!login) throw badRequest('Enter a GitHub username or a link like https://github.com/username', 'VALIDATION_ERROR', { username: 'Not a valid GitHub username or profile link' });
  const info = await fetchGithubUser(login, config.github.serverToken || null);
  const taken = await GithubAccount.findOne({ githubId: info.id }).lean();
  if (taken && String(taken.userId) !== String(user._id)) throw conflict('This GitHub account is already linked to another Partner in Project user.', 'GITHUB_TAKEN');
  await GithubAccount.findOneAndUpdate(
    { userId: user._id },
    {
      $set: {
        githubId: info.id,
        login: info.login,
        name: info.name ?? '',
        avatarUrl: info.avatar_url,
        profileUrl: info.html_url,
        bio: info.bio ?? '',
        followers: info.followers,
        publicRepos: info.public_repos,
        linkMethod: 'username',
        accessToken: null,
        lastSyncedAt: null,
        syncStatus: 'idle',
      },
    },
    { upsert: true },
  );
  // Changing account: drop the old account's repos first
  await Repository.deleteMany({ userId: user._id, fullName: { $not: new RegExp(`^${info.login}/`, 'i') } });
  runSyncInBackground(String(user._id), true);
  res.status(202).json(await statusFor(String(user._id)));
});

/** Start the GitHub OAuth flow — proves account ownership ("verified" link). */
githubRouter.get('/connect', requireAuth, async (req, res) => {
  const user = me(req);
  if (!features.githubOAuth) {
    res.redirect('/github?error=oauth_not_configured');
    return;
  }
  const state = randomToken(24);
  await OAuthState.create({ state, provider: 'github', userId: user._id, returnTo: '/github', expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: `${config.appUrl}/api/github/callback`,
    scope: 'read:user',
    state,
    allow_signup: 'true',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

githubRouter.get('/callback', requireAuth, async (req, res) => {
  const user = me(req);
  const fail = (reason: string) => res.redirect(`/github?error=${encodeURIComponent(reason)}`);
  const { code, state, error } = req.query as Record<string, string | undefined>;
  if (error) return fail('cancelled');
  if (!code || !state) return fail('failed');
  const st = await OAuthState.findOneAndDelete({ state, provider: 'github' });
  if (!st || st.expiresAt < new Date() || String(st.userId) !== String(user._id)) return fail('expired');
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
        redirect_uri: `${config.appUrl}/api/github/callback`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const tok = (await tokenRes.json()) as { access_token?: string };
    if (!tok.access_token) return fail('failed');
    const meRes = await fetch('https://api.github.com/user', {
      headers: { authorization: `Bearer ${tok.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'partner-in-project' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!meRes.ok) return fail('failed');
    const info = (await meRes.json()) as { id: number; login: string; name: string | null; avatar_url: string; html_url: string; bio: string | null; followers: number; public_repos: number };
    const taken = await GithubAccount.findOne({ githubId: info.id }).lean();
    if (taken && String(taken.userId) !== String(user._id)) return fail('taken');
    await GithubAccount.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          githubId: info.id,
          login: info.login,
          name: info.name ?? '',
          avatarUrl: info.avatar_url,
          profileUrl: info.html_url,
          bio: info.bio ?? '',
          followers: info.followers,
          publicRepos: info.public_repos,
          linkMethod: 'oauth',
          accessToken: encrypt(tok.access_token),
          lastSyncedAt: null,
          syncStatus: 'idle',
        },
      },
      { upsert: true },
    );
    await Repository.deleteMany({ userId: user._id, fullName: { $not: new RegExp(`^${info.login}/`, 'i') } });
    runSyncInBackground(String(user._id), true);
    res.redirect('/github?connected=1');
  } catch (e) {
    console.error('[github] oauth callback', e);
    return fail('failed');
  }
});

/** Manual refresh (with a short cooldown to respect the API limits). */
githubRouter.post('/sync', requireAuth, async (req, res) => {
  const user = me(req);
  const acc = await GithubAccount.findOne({ userId: user._id }).lean();
  if (!acc) throw badRequest('Connect a GitHub account first', 'GITHUB_NOT_LINKED');
  if (acc.lastSyncedAt && Date.now() - acc.lastSyncedAt.getTime() < MANUAL_COOLDOWN_MS && acc.syncStatus === 'ok') {
    const wait = Math.ceil((MANUAL_COOLDOWN_MS - (Date.now() - acc.lastSyncedAt.getTime())) / 1000);
    throw new AppError(429, `Repositories were just refreshed. Try again in ${wait} seconds.`, 'TOO_SOON');
  }
  runSyncInBackground(String(user._id), true);
  res.status(202).json({ ...(await statusFor(String(user._id))), syncStatus: 'syncing' });
});

githubRouter.patch('/settings', requireAuth, async (req, res) => {
  const user = me(req);
  const { includeForks } = parse(z.object({ includeForks: z.boolean() }), req.body);
  const acc = await GithubAccount.findOneAndUpdate({ userId: user._id }, { $set: { includeForks } }, { new: true });
  if (!acc) throw badRequest('Connect a GitHub account first', 'GITHUB_NOT_LINKED');
  runSyncInBackground(String(user._id), true);
  res.json(await statusFor(String(user._id)));
});

githubRouter.delete('/', requireAuth, async (req, res) => {
  const user = me(req);
  await disconnectGithub(user._id);
  res.json({ connected: false, oauthAvailable: features.githubOAuth });
});

/** All repositories (no limit) for the current user or another user. */
githubRouter.get('/repos', requireAuth, async (req, res) => {
  const viewer = me(req);
  const userId = req.query.userId ? objectId(String(req.query.userId), 'User') : viewer._id;
  const repos = await Repository.find({ userId }).sort({ featured: -1, featuredOrder: 1, pushedAt: -1 }).lean();
  res.json({ repos: repos.map(repoDto), total: repos.length });
});

/** Choose featured repositories (FR6: up to six shown on the profile). */
githubRouter.put('/featured', requireAuth, async (req, res) => {
  const user = me(req);
  const { repoIds } = parse(z.object({ repoIds: z.array(z.string()).max(6, 'You can feature up to 6 repositories') }), req.body);
  const ids = repoIds.map((id) => objectId(id, 'Repository'));
  const owned = await Repository.countDocuments({ userId: user._id, _id: { $in: ids } });
  if (owned !== ids.length) throw badRequest('Some repositories were not found');
  await Repository.updateMany({ userId: user._id }, { $set: { featured: false, featuredOrder: 0 } });
  await Promise.all(ids.map((id, i) => Repository.updateOne({ _id: id, userId: user._id }, { $set: { featured: true, featuredOrder: i } })));
  await refreshProfileDerived(user._id);
  const repos = await Repository.find({ userId: user._id }).sort({ featured: -1, featuredOrder: 1, pushedAt: -1 }).lean();
  res.json({ repos: repos.map(repoDto), total: repos.length });
});
