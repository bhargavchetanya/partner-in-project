/**
 * GitHub integration (FR6, QR11, QR18).
 *
 * - Uses the GraphQL API to fetch ALL public repositories owned by the user, 20 per page,
 *   with languages, topics and dependency manifests in the same request.
 * - Falls back to the public REST API when no token is configured (fewer details).
 * - Repository data is cached in MongoDB; automatic refresh at most once every 24 h.
 * - If GitHub is unreachable, the last saved data keeps being shown.
 */
import { extractSkills, MANIFEST_FILES, prettifyTopic, type RepoInput } from '@pip/shared';
import mongoose, { type Types } from 'mongoose';
import { config } from '../config';
import { GithubAccount, Repository, UserSkill } from '../models';
import { getCatalog, resolveOrCreateSkill } from '../lib/catalog';
import { decrypt } from '../lib/crypto';
import { refreshProfileDerived } from '../lib/people';
import { AppError } from '../lib/http';

const API = 'https://api.github.com';
export const AUTO_REFRESH_MS = 24 * 60 * 60 * 1000; // QR11
export const MANUAL_COOLDOWN_MS = 2 * 60 * 1000;

/** Rolling counter of GitHub requests in the current hour (QR11 monitoring). */
const requestLog: number[] = [];
function countRequest() {
  const now = Date.now();
  requestLog.push(now);
  while (requestLog.length && requestLog[0] < now - 3600_000) requestLog.shift();
}
export function githubRequestsLastHour(): number {
  const now = Date.now();
  return requestLog.filter((t) => t > now - 3600_000).length;
}

export interface GithubUserInfo {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  followers: number;
  public_repos: number;
}

function headers(token?: string | null): Record<string, string> {
  const h: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'partner-in-project',
  };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

async function gh<T>(path: string, token?: string | null): Promise<T> {
  countRequest();
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { headers: headers(token), signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new AppError(503, 'GitHub could not be reached. Showing your last saved data.', 'GITHUB_UNAVAILABLE');
  }
  if (res.status === 404) throw new AppError(404, 'GitHub user not found', 'GITHUB_NOT_FOUND');
  if (res.status === 403 || res.status === 429) throw new AppError(503, 'GitHub rate limit reached. Please try again later.', 'GITHUB_RATE_LIMIT');
  if (!res.ok) throw new AppError(503, `GitHub returned an error (${res.status})`, 'GITHUB_ERROR');
  return (await res.json()) as T;
}

export async function fetchGithubUser(login: string, token?: string | null): Promise<GithubUserInfo> {
  return gh<GithubUserInfo>(`/users/${encodeURIComponent(login)}`, token);
}

/** Accepts "octocat", "@octocat", "github.com/octocat" or a full profile URL. */
export function parseGithubUsername(input: string): string | null {
  const s = input.trim();
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/?(?:[?#].*)?$/i) ?? s.match(/^@?([A-Za-z0-9-]{1,39})$/);
  if (!m) return null;
  const name = m[1];
  if (name.startsWith('-') || name.endsWith('-') || name.includes('--')) return null;
  return name;
}

// ---------------------------------------------------------------- GraphQL fetch
const MANIFEST_PATHS = [
  ...MANIFEST_FILES,
  'frontend/package.json',
  'backend/package.json',
  'client/package.json',
  'server/package.json',
  'backend/requirements.txt',
  'server/requirements.txt',
  'backend/pom.xml',
];

const manifestFields = MANIFEST_PATHS.map((p, i) => `m${i}: object(expression: "HEAD:${p}") { ... on Blob { text byteSize } }`).join('\n');

const REPOS_QUERY = `
query($login: String!, $cursor: String) {
  user(login: $login) {
    repositories(first: 20, after: $cursor, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: {field: PUSHED_AT, direction: DESC}) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        databaseId name nameWithOwner description url homepageUrl isFork isArchived
        stargazerCount forkCount pushedAt updatedAt createdAt
        primaryLanguage { name color }
        languages(first: 15, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name color } } }
        repositoryTopics(first: 20) { nodes { topic { name } } }
        root: object(expression: "HEAD:") { ... on Tree { entries { name type } } }
        wf: object(expression: "HEAD:.github/workflows") { ... on Tree { entries { name } } }
        ${manifestFields}
      }
    }
  }
}`;

export interface FetchedRepo extends RepoInput {
  githubRepoId: string;
  fullName: string;
  description: string;
  url: string;
  homepage: string;
  primaryLanguageColor: string | null;
  stars: number;
  forks: number;
  archived: boolean;
  repoUpdatedAt: string | null;
  repoCreatedAt: string | null;
}

interface GqlRepo {
  databaseId: number;
  name: string;
  nameWithOwner: string;
  description: string | null;
  url: string;
  homepageUrl: string | null;
  isFork: boolean;
  isArchived: boolean;
  stargazerCount: number;
  forkCount: number;
  pushedAt: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  primaryLanguage: { name: string; color: string | null } | null;
  languages: { edges: { size: number; node: { name: string } }[] };
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  root: { entries?: { name: string; type: string }[] } | null;
  wf: { entries?: { name: string }[] } | null;
  [k: string]: unknown;
}

async function graphql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  countRequest();
  let res: Response;
  try {
    res = await fetch(`${API}/graphql`, {
      method: 'POST',
      headers: { ...headers(token), 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new AppError(503, 'GitHub could not be reached. Showing your last saved data.', 'GITHUB_UNAVAILABLE');
  }
  if (res.status === 401) throw new AppError(503, 'The GitHub token is invalid or expired', 'GITHUB_TOKEN');
  if (!res.ok) throw new AppError(503, `GitHub returned an error (${res.status})`, 'GITHUB_ERROR');
  const json = (await res.json()) as { data?: T; errors?: { message: string; type?: string }[] };
  if (json.errors?.length && !json.data) {
    const notFound = json.errors.some((e) => e.type === 'NOT_FOUND');
    if (notFound) throw new AppError(404, 'GitHub user not found', 'GITHUB_NOT_FOUND');
    throw new AppError(503, `GitHub error: ${json.errors[0].message}`, 'GITHUB_ERROR');
  }
  return json.data as T;
}

async function fetchReposGraphql(login: string, token: string): Promise<FetchedRepo[]> {
  const out: FetchedRepo[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 100; page++) {
    type Resp = { user: { repositories: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: GqlRepo[] } } | null };
    const data: Resp = await graphql<Resp>(token, REPOS_QUERY, { login, cursor });
    if (!data.user) throw new AppError(404, 'GitHub user not found', 'GITHUB_NOT_FOUND');
    for (const n of data.user.repositories.nodes) {
      const manifests: Record<string, string> = {};
      MANIFEST_PATHS.forEach((p, i) => {
        const blob = n[`m${i}`] as { text?: string | null } | null;
        if (blob?.text) manifests[p] = blob.text.slice(0, 200_000);
      });
      const rootEntries = (n.root?.entries ?? []).map((e) => e.name);
      if (!(n.wf?.entries?.length)) {
        const i = rootEntries.indexOf('.github');
        if (i >= 0) rootEntries.splice(i, 1); // only count .github when workflows exist
      }
      const languages: Record<string, number> = {};
      for (const e of n.languages.edges) languages[e.node.name] = e.size;
      out.push({
        githubRepoId: String(n.databaseId),
        name: n.name,
        fullName: n.nameWithOwner,
        description: n.description ?? '',
        url: n.url,
        homepage: n.homepageUrl ?? '',
        isFork: n.isFork,
        archived: n.isArchived,
        stars: n.stargazerCount,
        forks: n.forkCount,
        pushedAt: n.pushedAt,
        repoUpdatedAt: n.updatedAt,
        repoCreatedAt: n.createdAt,
        primaryLanguage: n.primaryLanguage?.name ?? null,
        primaryLanguageColor: n.primaryLanguage?.color ?? null,
        languages,
        topics: n.repositoryTopics.nodes.map((t) => t.topic.name),
        manifests,
        rootEntries,
      });
    }
    if (!data.user.repositories.pageInfo.hasNextPage) break;
    cursor = data.user.repositories.pageInfo.endCursor;
  }
  return out;
}

interface RestRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  fork: boolean;
  archived: boolean;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  language: string | null;
  topics?: string[];
}

async function fetchReposRest(login: string): Promise<FetchedRepo[]> {
  const out: FetchedRepo[] = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await gh<RestRepo[]>(`/users/${encodeURIComponent(login)}/repos?per_page=100&page=${page}&type=owner&sort=pushed`);
    for (const r of batch) {
      out.push({
        githubRepoId: String(r.id),
        name: r.name,
        fullName: r.full_name,
        description: r.description ?? '',
        url: r.html_url,
        homepage: r.homepage ?? '',
        isFork: r.fork,
        archived: r.archived,
        stars: r.stargazers_count,
        forks: r.forks_count,
        pushedAt: r.pushed_at,
        repoUpdatedAt: r.updated_at,
        repoCreatedAt: r.created_at,
        primaryLanguage: r.language,
        primaryLanguageColor: null,
        languages: r.language ? { [r.language]: 1 } : {},
        topics: r.topics ?? [],
      });
    }
    if (batch.length < 100) break;
  }
  return out;
}

export async function fetchAllRepos(login: string, token: string | null): Promise<FetchedRepo[]> {
  if (token) return fetchReposGraphql(login, token);
  return fetchReposRest(login);
}

async function tokenFor(accountId: Types.ObjectId): Promise<string | null> {
  const acc = await GithubAccount.findById(accountId).select('+accessToken').lean();
  if (acc?.accessToken) {
    const t = decrypt(acc.accessToken);
    if (t) return t;
  }
  return config.github.serverToken || null;
}

// ---------------------------------------------------------------- sync
const running = new Set<string>();

export interface SyncResult {
  repoCount: number;
  suggestions: number;
  skipped?: 'cached' | 'running';
}

/** Fetches repos, stores them, and refreshes skill suggestions. Safe to call concurrently. */
export async function syncGithub(userId: Types.ObjectId | string, opts: { force?: boolean } = {}): Promise<SyncResult> {
  const key = String(userId);
  const account = await GithubAccount.findOne({ userId });
  if (!account) throw new AppError(400, 'Connect a GitHub account first', 'GITHUB_NOT_LINKED');
  if (running.has(key)) return { repoCount: await Repository.countDocuments({ userId }), suggestions: 0, skipped: 'running' };
  if (!opts.force && account.lastSyncedAt && Date.now() - account.lastSyncedAt.getTime() < AUTO_REFRESH_MS && account.syncStatus === 'ok') {
    return { repoCount: await Repository.countDocuments({ userId }), suggestions: 0, skipped: 'cached' };
  }
  running.add(key);
  account.syncStatus = 'syncing';
  account.syncError = '';
  await account.save();
  try {
    const token = await tokenFor(account._id);
    // Refresh public profile info
    try {
      const info = await fetchGithubUser(account.login, token);
      account.name = info.name ?? '';
      account.avatarUrl = info.avatar_url;
      account.profileUrl = info.html_url;
      account.bio = info.bio ?? '';
      account.followers = info.followers;
      account.publicRepos = info.public_repos;
      account.login = info.login;
    } catch (e) {
      if (e instanceof AppError && e.code === 'GITHUB_NOT_FOUND') throw e;
    }
    const repos = await fetchAllRepos(account.login, token);
    const c = await getCatalog();
    const catalogItems = c.skills.map((s) => ({ slug: s.slug, name: s.name, aliases: s.aliases }));

    // Upsert repositories, preserving the user's featured choices
    const existing = await Repository.find({ userId }, { githubRepoId: 1, featured: 1, featuredOrder: 1 }).lean();
    const featuredMap = new Map(existing.map((r) => [r.githubRepoId, { featured: r.featured, featuredOrder: r.featuredOrder }]));
    const ops = repos.map((r) => {
      const tech = extractSkills([{ ...r, isFork: false }], { catalog: catalogItems })
        .filter((d) => d.known)
        .map((d) => d.key);
      const fav = featuredMap.get(r.githubRepoId);
      return {
        updateOne: {
          filter: { githubRepoId: r.githubRepoId },
          update: {
            $set: {
              userId: new mongoose.Types.ObjectId(String(userId)),
              name: r.name,
              fullName: r.fullName,
              description: r.description,
              url: r.url,
              homepage: r.homepage,
              primaryLanguage: r.primaryLanguage ?? null,
              primaryLanguageColor: r.primaryLanguageColor,
              languages: r.languages ?? {},
              topics: r.topics ?? [],
              stars: r.stars,
              forks: r.forks,
              isFork: !!r.isFork,
              archived: r.archived,
              pushedAt: r.pushedAt ? new Date(r.pushedAt) : null,
              repoUpdatedAt: r.repoUpdatedAt ? new Date(r.repoUpdatedAt) : null,
              repoCreatedAt: r.repoCreatedAt ? new Date(r.repoCreatedAt) : null,
              detectedTech: tech,
              featured: fav?.featured ?? false,
              featuredOrder: fav?.featuredOrder ?? 0,
            },
          },
          upsert: true,
        },
      };
    });
    if (ops.length) await Repository.bulkWrite(ops as never, { ordered: false });
    await Repository.deleteMany({ userId, githubRepoId: { $nin: repos.map((r) => r.githubRepoId) } });

    const suggestions = await applySkillDetections(userId, repos, account.includeForks);

    account.syncStatus = 'ok';
    account.lastSyncedAt = new Date();
    await account.save();
    await refreshProfileDerived(userId);
    return { repoCount: repos.length, suggestions };
  } catch (e) {
    account.syncStatus = 'error';
    account.syncError = e instanceof AppError ? e.message : 'Could not sync with GitHub';
    await account.save();
    throw e;
  } finally {
    running.delete(key);
  }
}

/**
 * Applies detections to the user's skills following the sync rules:
 * - new detections -> "suggested" (never auto-confirmed)
 * - rejected skills stay rejected
 * - manual skills are never deleted or downgraded
 * - suggestions whose evidence disappeared are removed; confirmed ones are kept
 */
export async function applySkillDetections(userId: Types.ObjectId | string, repos: RepoInput[], includeForks: boolean): Promise<number> {
  const c = await getCatalog();
  const detections = extractSkills(repos, {
    catalog: c.skills.map((s) => ({ slug: s.slug, name: s.name, aliases: s.aliases })),
    includeForks,
  });
  const current = await UserSkill.find({ userId });
  const bySkill = new Map(current.map((s) => [s.skill, s]));
  const seen = new Set<string>();
  let newSuggestions = 0;

  for (const d of detections) {
    const slug = d.known ? d.key : await resolveOrCreateSkill(d.label ?? prettifyTopic(d.key.slice(6)), 'other');
    if (seen.has(slug)) continue;
    seen.add(slug);
    const evidence = d.evidence.slice(0, 12);
    const row = bySkill.get(slug);
    const data = {
      evidence,
      repoCount: d.repoCount,
      codeShare: d.codeShare ?? null,
      lastUsed: d.lastUsed ? new Date(d.lastUsed) : null,
      detectedOnGithub: true,
    };
    if (!row) {
      await UserSkill.create({ userId, skill: slug, source: 'github', status: 'suggested', proficiency: 'intermediate', ...data });
      newSuggestions++;
    } else {
      Object.assign(row, data);
      if (row.source === 'manual') row.source = 'both';
      await row.save();
    }
  }

  for (const row of current) {
    if (seen.has(row.skill) || !row.detectedOnGithub) continue;
    if (row.source === 'github' && row.status === 'suggested') {
      await row.deleteOne();
      continue;
    }
    row.detectedOnGithub = false;
    row.set('evidence', []);
    row.repoCount = 0;
    row.codeShare = null;
    if (row.source === 'both') row.source = 'manual';
    await row.save();
  }
  return newSuggestions;
}

/** Removes the GitHub link and repo cache; manual and user-confirmed skills are kept. */
export async function disconnectGithub(userId: Types.ObjectId | string): Promise<void> {
  await GithubAccount.deleteOne({ userId });
  await Repository.deleteMany({ userId });
  await UserSkill.deleteMany({ userId, source: 'github', status: { $in: ['suggested', 'rejected'] } });
  await UserSkill.updateMany({ userId, source: 'both' }, { $set: { source: 'manual', detectedOnGithub: false, evidence: [], repoCount: 0, codeShare: null } });
  await UserSkill.updateMany({ userId, source: 'github' }, { $set: { detectedOnGithub: false, evidence: [], repoCount: 0, codeShare: null } });
  await refreshProfileDerived(userId);
}
