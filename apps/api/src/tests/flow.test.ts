/**
 * End-to-end API tests against a real MongoDB (replica set needed for transactions).
 * Set MONGODB_URI_TEST, e.g. mongodb://127.0.0.1:27017/pip-test?replicaSet=rs0
 * or an Atlas URI with a separate database name such as /pip-test.
 */
process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAILS = 'admin@pip.test';

import request from 'supertest';
import mongoose from 'mongoose';
import type { Express } from 'express';

const uri = process.env.MONGODB_URI_TEST ?? 'mongodb://127.0.0.1:27017/pip-test?replicaSet=rs0';

let app: Express;

beforeAll(async () => {
  const { connectDb } = await import('../db');
  const { createApp } = await import('../app');
  await connectDb(uri);
  await mongoose.connection.db!.dropDatabase();
  await connectDb(uri).catch(() => undefined);
  const { seedCatalog } = await import('../scripts/seedCatalog');
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));
  await seedCatalog();
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
});

async function registerAndVerify(email: string, name: string, college = 'Thapar Institute') {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/register').send({ name, email, password: 'password123', college });
  expect(r.status).toBe(201);
  expect(r.body.devCode).toMatch(/^\d{6}$/);
  const v = await agent.post('/api/auth/verify-email').send({ email, code: r.body.devCode });
  expect(v.status).toBe(200);
  return { agent, id: r.body.user.id as string };
}

async function completeProfile(agent: request.Agent, data: Partial<Record<string, unknown>> = {}) {
  const r = await agent.put('/api/profiles/me').send({
    name: data.name ?? 'Student',
    college: 'Thapar Institute of Engineering & Technology',
    branch: 'COE',
    year: 3,
    bio: 'I build web apps and love hackathons.',
    interests: data.interests ?? ['web', 'ai-ml'],
    preferredRoles: data.preferredRoles ?? ['backend'],
    availabilityHours: data.availabilityHours ?? 10,
    lookingForSkills: [],
    projects: [],
    achievements: [],
  });
  expect(r.status).toBe(200);
}

describe('auth (FR1–FR4, QR20–QR23)', () => {
  test('register, duplicate email, wrong password, lockout', async () => {
    const agent = request.agent(app);
    const r = await agent.post('/api/auth/register').send({ name: 'Aditi', email: 'aditi@thapar.edu', password: 'short', college: 'TIET' });
    expect(r.status).toBe(400);
    expect(r.body.error.details.password).toMatch(/8 characters/);

    const ok = await agent.post('/api/auth/register').send({ name: 'Aditi', email: 'aditi@thapar.edu', password: 'password123', college: 'TIET' });
    expect(ok.status).toBe(201);
    expect(ok.body.user.emailVerified).toBe(false);

    const dup = await request(app).post('/api/auth/register').send({ name: 'Xi', email: 'ADITI@thapar.edu', password: 'password123', college: 'TIET' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');

    // Password stored only as bcrypt hash (QR20)
    const u = await mongoose.connection.db!.collection('users').findOne({ email: 'aditi@thapar.edu' });
    expect(u!.passwordHash).toMatch(/^\$2[aby]\$12\$/);

    // Unverified users cannot post (FR2)
    const post = await agent.post('/api/opportunities').send({});
    expect(post.status).toBe(403);
    expect(post.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    // Verify -> institutional badge
    const v = await agent.post('/api/auth/verify-email').send({ email: 'aditi@thapar.edu', code: ok.body.devCode });
    expect(v.body.user.emailVerified).toBe(true);
    expect(v.body.user.institutionVerified).toBe(true);

    // Lockout after 5 failures (QR22)
    for (let i = 0; i < 4; i++) {
      const bad = await request(app).post('/api/auth/login').send({ email: 'aditi@thapar.edu', password: 'wrongpass1' });
      expect(bad.status).toBe(401);
    }
    const fifth = await request(app).post('/api/auth/login').send({ email: 'aditi@thapar.edu', password: 'wrongpass1' });
    expect(fifth.status).toBe(423);
    const locked = await request(app).post('/api/auth/login').send({ email: 'aditi@thapar.edu', password: 'password123' });
    expect(locked.status).toBe(423);
  });

  test('password reset link works once', async () => {
    await request(app).post('/api/auth/register').send({ name: 'Rohan', email: 'rohan@gmail.com', password: 'password123', college: 'PEC' });
    const f = await request(app).post('/api/auth/forgot-password').send({ email: 'rohan@gmail.com' });
    const token = new URL(f.body.devLink).searchParams.get('token');
    const r1 = await request(app).post('/api/auth/reset-password').send({ token, password: 'newpassword1' });
    expect(r1.status).toBe(200);
    const r2 = await request(app).post('/api/auth/reset-password').send({ token, password: 'newpassword2' });
    expect(r2.status).toBe(400);
    const login = await request(app).post('/api/auth/login').send({ email: 'rohan@gmail.com', password: 'newpassword1' });
    expect(login.status).toBe(200);
    expect(login.body.user.institutionVerified).toBe(false);
  });

  test('admin dashboard is admin-only (FR20)', async () => {
    const { agent } = await registerAndVerify('normal@pip.test', 'Normal');
    expect((await agent.get('/api/admin/stats')).status).toBe(403);
    expect((await request(app).get('/api/admin/stats')).status).toBe(401);
  });
});

describe('team flow (FR5, FR8–FR11, FR16–FR19, FR21)', () => {
  let leader: { agent: request.Agent; id: string };
  let alice: { agent: request.Agent; id: string };
  let bob: { agent: request.Agent; id: string };
  let admin: { agent: request.Agent; id: string };
  let oppId: string;

  beforeAll(async () => {
    leader = await registerAndVerify('leader@thapar.edu', 'Leader');
    alice = await registerAndVerify('alice@thapar.edu', 'Alice');
    bob = await registerAndVerify('bob@thapar.edu', 'Bob');
    admin = await registerAndVerify('admin@pip.test', 'Admin');
    await completeProfile(leader.agent, { name: 'Leader', preferredRoles: ['frontend'] });
    await completeProfile(alice.agent, { name: 'Alice', preferredRoles: ['backend'], availabilityHours: 8 });
    await completeProfile(bob.agent, { name: 'Bob', preferredRoles: ['backend'], availabilityHours: 20 });
    for (const s of ['React', 'Figma']) await leader.agent.post('/api/skills/me').send({ name: s, proficiency: 'advanced' });
    for (const s of ['Java', 'Spring Boot', 'reactjs', 'MySQL']) await alice.agent.post('/api/skills/me').send({ name: s });
    for (const s of ['Docker', 'Node.js']) await bob.agent.post('/api/skills/me').send({ name: s });
  });

  test('manual skills are canonicalised (reactjs -> react)', async () => {
    const r = await alice.agent.get('/api/skills/me');
    expect(r.body.skills.map((s: { skill: string }) => s.skill).sort()).toEqual(['java', 'mysql', 'react', 'spring-boot']);
    expect(r.body.skills.every((s: { source: string }) => s.source === 'manual')).toBe(true);
  });

  test('create post -> pending -> hidden -> admin approves -> visible', async () => {
    const bad = await leader.agent.post('/api/opportunities').send({ title: 'x' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details)).toEqual(expect.arrayContaining(['title', 'description', 'eventName', 'requiredSkills', 'openRoles']));

    const r = await leader.agent.post('/api/opportunities').send({
      title: 'Smart Campus Attendance',
      description: 'Face recognition attendance with a React dashboard and Spring backend.',
      eventName: 'HackThapar 2026',
      type: 'hackathon',
      domains: ['ai-ml', 'web'],
      deadline: new Date(Date.now() + 5 * 86400_000).toISOString(),
      teamSize: 3,
      commitmentHours: 10,
      requiredSkills: ['Java', 'Spring Boot', 'React', 'MySQL', 'Docker'],
      openRoles: [{ role: 'backend', slots: 2 }],
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('pending_approval');
    oppId = r.body.id;

    const list = await alice.agent.get('/api/opportunities');
    expect(list.body.items.find((o: { id: string }) => o.id === oppId)).toBeUndefined();
    expect((await alice.agent.get(`/api/opportunities/${oppId}`)).status).toBe(404);

    const ap = await admin.agent.post(`/api/admin/opportunities/${oppId}/approve`);
    expect(ap.status).toBe(200);
    const list2 = await alice.agent.get('/api/opportunities');
    const item = list2.body.items.find((o: { id: string }) => o.id === oppId);
    expect(item).toBeDefined();
    // Alice: 4/5 skills, 2/2 interests, role backend, 8/10 h -> 0.4+0.2+0.15+0.12 = 87
    expect(item.match.score).toBe(87);
    expect(item.match.missingSkills).toEqual(['docker']);
  });

  test('apply, duplicate prevention, accept, skill gap, auto-close when full', async () => {
    const a1 = await alice.agent.post(`/api/opportunities/${oppId}/apply`).send({ role: 'backend', message: 'Hi!' });
    expect(a1.status).toBe(201);
    const dup = await alice.agent.post(`/api/opportunities/${oppId}/apply`).send({ role: 'backend' });
    expect(dup.status).toBe(409);
    const own = await leader.agent.post(`/api/opportunities/${oppId}/apply`).send({ role: 'backend' });
    expect(own.status).toBe(400);

    const apps = await leader.agent.get(`/api/opportunities/${oppId}/applications`);
    expect(apps.body.items).toHaveLength(1);
    expect(alice.agent).toBeDefined();
    expect((await alice.agent.get(`/api/opportunities/${oppId}/applications`)).status).toBe(403);

    const acc = await leader.agent.post(`/api/applications/${apps.body.items[0].id}/accept`);
    expect(acc.status).toBe(200);

    const gap = await leader.agent.get(`/api/opportunities/${oppId}/skill-gap`);
    expect(gap.body.covered.sort()).toEqual(['java', 'mysql', 'react', 'spring-boot']);
    expect(gap.body.missing).toEqual(['docker']);
    expect(gap.body.coverage).toBe(80);
    expect(gap.body.suggestions.map((s: { userId: string }) => s.userId)).toEqual([bob.id]);

    // Bob applies and is accepted -> team full -> closed
    const b = await bob.agent.post(`/api/opportunities/${oppId}/apply`).send({ role: 'backend' });
    expect(b.status).toBe(201);
    const apps2 = await leader.agent.get(`/api/opportunities/${oppId}/applications?status=pending`);
    await leader.agent.post(`/api/applications/${apps2.body.items[0].id}/accept`).expect(200);
    const opp = await leader.agent.get(`/api/opportunities/${oppId}`);
    expect(opp.body.status).toBe('closed');
    expect(opp.body.spotsLeft).toBe(0);

    const gap2 = await leader.agent.get(`/api/opportunities/${oppId}/skill-gap`);
    expect(gap2.body.complete).toBe(true);
    expect(gap2.body.message).toBe('Your team covers all required skills');

    // Remove a member -> reopened with one open position (FR18)
    await leader.agent.delete(`/api/opportunities/${oppId}/members/${bob.id}`).expect(200);
    const opp2 = await leader.agent.get(`/api/opportunities/${oppId}`);
    expect(opp2.body.status).toBe('open');
    expect(opp2.body.spotsLeft).toBe(1);
  });

  test('concurrent accepts for the last slot: only one succeeds', async () => {
    const carol = await registerAndVerify('carol@thapar.edu', 'Carol');
    const dan = await registerAndVerify('dan@thapar.edu', 'Dan');
    await completeProfile(carol.agent, { name: 'Carol' });
    await completeProfile(dan.agent, { name: 'Dan' });
    await carol.agent.post(`/api/opportunities/${oppId}/apply`).send({ role: 'backend' }).expect(201);
    await dan.agent.post(`/api/opportunities/${oppId}/apply`).send({ role: 'backend' }).expect(201);
    const pending = await leader.agent.get(`/api/opportunities/${oppId}/applications?status=pending`);
    expect(pending.body.items).toHaveLength(2);
    const results = await Promise.all(pending.body.items.map((a: { id: string }) => leader.agent.post(`/api/applications/${a.id}/accept`)));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);
    const members = await mongoose.connection.db!.collection('teammembers').countDocuments({ opportunityId: new mongoose.Types.ObjectId(oppId) });
    expect(members).toBe(3); // leader + 2
  });

  test('messaging requires a connection; team chat works', async () => {
    const no = await bob.agent.post('/api/conversations/direct').send({ userId: leader.id });
    expect(no.status).toBe(403);
    await bob.agent.post('/api/connections/requests').send({ userId: leader.id, message: "Let's build" }).expect(201);
    const reqs = await leader.agent.get('/api/connections/requests');
    expect(reqs.body.incoming).toHaveLength(1);
    await leader.agent.post(`/api/connections/requests/${reqs.body.incoming[0].id}/accept`).expect(200);
    const conv = await bob.agent.post('/api/conversations/direct').send({ userId: leader.id });
    expect(conv.status).toBe(200);
    await bob.agent.post(`/api/conversations/${conv.body.id}/messages`).send({ body: 'Hello leader!' }).expect(201);
    const unread = await leader.agent.get('/api/conversations/unread-count');
    expect(unread.body.count).toBe(1);
    // Block prevents messages (FR15)
    await leader.agent.post(`/api/blocks/${bob.id}`).expect(200);
    const blocked = await bob.agent.post(`/api/conversations/${conv.body.id}/messages`).send({ body: 'hi?' });
    expect(blocked.status).toBe(403);
  });

  test('notifications were created for the key events (FR14)', async () => {
    const n = await leader.agent.get('/api/notifications');
    const types = n.body.items.map((x: { type: string }) => x.type);
    expect(types).toEqual(expect.arrayContaining(['post_approved', 'application_received', 'collab_request']));
    const a = await alice.agent.get('/api/notifications');
    expect(a.body.items.map((x: { type: string }) => x.type)).toContain('application_accepted');
  });

  test('report + ban hides posts and blocks login (FR22, FR23)', async () => {
    await alice.agent.post('/api/reports').send({ targetType: 'opportunity', targetId: oppId, reason: 'spam' }).expect(201);
    const reports = await admin.agent.get('/api/admin/reports');
    expect(reports.body.items).toHaveLength(1);
    await admin.agent.post(`/api/admin/reports/${reports.body.items[0].id}/ban`).send({ reason: 'test' }).expect(200);
    const login = await request(app).post('/api/auth/login').send({ email: 'leader@thapar.edu', password: 'password123' });
    expect(login.status).toBe(403);
    expect((await alice.agent.get(`/api/opportunities/${oppId}`)).status).toBe(404);
    // existing session is revoked too
    expect((await leader.agent.get('/api/auth/me')).body.user).toBeNull();
    await admin.agent.patch(`/api/admin/users/${leader.id}/status`).send({ status: 'active' }).expect(200);
    const again = await request(app).post('/api/auth/login').send({ email: 'leader@thapar.edu', password: 'password123' });
    expect(again.status).toBe(200);
  });

  test('discover filters all hold (QR14) and every result has a score', async () => {
    const r = await alice.agent.get('/api/discover?skills=docker&roles=backend');
    expect(r.status).toBe(200);
    for (const p of r.body.items) {
      expect(p.skills).toContain('docker');
      expect(p.roles).toContain('backend');
      expect(typeof p.match.score).toBe('number');
    }
  });
});
