/**
 * GitHub sync rules, with the GitHub API mocked (no network needed):
 * suggestions only, manual skills never deleted, rejected stay rejected, all repos stored.
 */
process.env.NODE_ENV = 'test';
process.env.GITHUB_SERVER_TOKEN = 'test-token';

import mongoose from 'mongoose';

const uri = (process.env.MONGODB_URI_TEST ?? 'mongodb://127.0.0.1:27017/pip-test?replicaSet=rs0').replace('pip-test', 'pip-test-gh');

function repoNode(i: number, extra: Partial<Record<string, unknown>> = {}) {
  return {
    databaseId: 1000 + i,
    name: `repo-${i}`,
    nameWithOwner: `octo/repo-${i}`,
    description: `Repo ${i}`,
    url: `https://github.com/octo/repo-${i}`,
    homepageUrl: null,
    isFork: false,
    isArchived: false,
    stargazerCount: i,
    forkCount: 0,
    pushedAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
    primaryLanguage: { name: 'TypeScript', color: '#3178c6' },
    languages: { edges: [{ size: 5000, node: { name: 'TypeScript' } }] },
    repositoryTopics: { nodes: [] },
    root: { entries: [{ name: 'package.json', type: 'blob' }] },
    wf: null,
    m0: { text: JSON.stringify({ dependencies: { react: '18' } }) },
    ...extra,
  };
}

let pages: unknown[][] = [];

beforeAll(async () => {
  const { connectDb } = await import('../db');
  await connectDb(uri);
  await mongoose.connection.db!.dropDatabase();
  const { seedCatalog } = await import('../scripts/seedCatalog');
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));
  await seedCatalog();
  global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/graphql')) {
      const body = JSON.parse(String(init?.body));
      const idx = body.variables.cursor ? Number(body.variables.cursor) : 0;
      const nodes = pages[idx] ?? [];
      return new Response(JSON.stringify({ data: { user: { repositories: { pageInfo: { hasNextPage: idx + 1 < pages.length, endCursor: String(idx + 1) }, nodes } } } }), { status: 200 });
    }
    if (u.includes('/users/')) {
      return new Response(JSON.stringify({ id: 42, login: 'octo', name: 'Octo', avatar_url: '', html_url: 'https://github.com/octo', bio: '', followers: 1, public_repos: 25 }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
});

afterAll(async () => {
  await mongoose.disconnect();
});

test('sync stores ALL repos across pages and only suggests skills', async () => {
  const { User, Profile, GithubAccount, Repository, UserSkill } = await import('../models');
  const { syncGithub } = await import('../services/github');
  const user = await User.create({ email: 'gh@test.dev', name: 'Gh', emailVerified: true });
  await Profile.create({ userId: user._id, name: 'Gh' });
  await GithubAccount.create({ userId: user._id, githubId: 42, login: 'octo', linkMethod: 'username' });
  // Manual skill that GitHub will also detect, and one GitHub won't detect
  await UserSkill.create({ userId: user._id, skill: 'react', source: 'manual', status: 'confirmed', proficiency: 'expert' });
  await UserSkill.create({ userId: user._id, skill: 'figma', source: 'manual', status: 'confirmed' });

  pages = [
    Array.from({ length: 20 }, (_, i) => repoNode(i)),
    [repoNode(20, { primaryLanguage: { name: 'Python', color: null }, languages: { edges: [{ size: 9000, node: { name: 'Python' } }] }, m0: null, m1: { text: 'torch\nflask\n' }, repositoryTopics: { nodes: [{ topic: { name: 'hacktoberfest' } }, { topic: { name: 'computer-vision' } }] } })],
  ];
  const r = await syncGithub(user._id, { force: true });
  expect(r.repoCount).toBe(21);
  expect(await Repository.countDocuments({ userId: user._id })).toBe(21);

  const skills = await UserSkill.find({ userId: user._id }).lean();
  const by = Object.fromEntries(skills.map((s) => [s.skill, s]));
  expect(by.react.source).toBe('both');
  expect(by.react.status).toBe('confirmed');
  expect(by.react.proficiency).toBe('expert');
  expect(by.typescript.status).toBe('suggested');
  expect(by.pytorch.status).toBe('suggested');
  expect(by.flask.status).toBe('suggested');
  expect(by['computer-vision'].status).toBe('suggested');
  expect(by.figma.source).toBe('manual');
  expect(Object.keys(by)).not.toContain('hacktoberfest');

  // Suggestions do not count for matching until confirmed
  const p = await Profile.findOne({ userId: user._id }).lean();
  expect(p!.skillSlugs.sort()).toEqual(['figma', 'react']);

  // Reject python suggestion, then re-sync without the python repo
  await UserSkill.updateOne({ userId: user._id, skill: 'python' }, { $set: { status: 'rejected' } });
  await UserSkill.updateOne({ userId: user._id, skill: 'flask' }, { $set: { status: 'confirmed' } });
  pages = [Array.from({ length: 3 }, (_, i) => repoNode(i))];
  await syncGithub(user._id, { force: true });
  const after = Object.fromEntries((await UserSkill.find({ userId: user._id }).lean()).map((s) => [s.skill, s]));
  expect(await Repository.countDocuments({ userId: user._id })).toBe(3);
  expect(after.pytorch).toBeUndefined(); // unconfirmed suggestion whose evidence disappeared
  expect(after.flask.status).toBe('confirmed'); // confirmed by the user -> kept
  expect(after.flask.detectedOnGithub).toBe(false);
  expect(after.python.status).toBe('rejected'); // rejection respected
  expect(after.figma.status).toBe('confirmed'); // manual never touched
  expect(after.react.source).toBe('both');

  // Disconnect keeps manual + confirmed skills
  const { disconnectGithub } = await import('../services/github');
  await disconnectGithub(user._id);
  const final = Object.fromEntries((await UserSkill.find({ userId: user._id }).lean()).map((s) => [s.skill, s]));
  expect(final.react.source).toBe('manual');
  expect(final.figma).toBeDefined();
  expect(final.flask).toBeDefined();
  expect(final.typescript).toBeUndefined();
  expect(await Repository.countDocuments({ userId: user._id })).toBe(0);
});
