# Testing

## Automated

```bash
npm test          # all unit + integration tests
npm run typecheck # TypeScript across shared, api and web
npm run build     # production build of web + api
```

**Unit tests (`packages/shared`, Jest — QR26)**
- Match score: weights sum to 1; 4/5 skills = 80 % coverage; the worked example = 77 %; 0 and 100 bounds; availability capped at 100 %; missing requirement data excluded and re-weighted; 500 random cases always in 0–100; duplicate skills counted once; readable explanation text.
- Skill gap: covered / missing / coverage %, who covers each skill, "Your team covers all required skills".
- Skill extraction: parsers for requirements.txt, pom.xml, build.gradle, pyproject.toml, go.mod, pubspec.yaml; languages, dependencies, topics, config files; forks ignored by default; stop-listed topics ignored; unknown topics kept as suggestions; aliases resolve (reactjs → React); evidence and code share.

**Integration tests (`apps/api`, Jest + Supertest against a real MongoDB replica set)**
- FR1–FR4, QR20–QR23: registration validation, duplicate email (409), bcrypt cost-12 hash, OTP verification + Verified Student badge, unverified users blocked from posting, lockout after 5 failures, one-time reset links.
- FR20 / QR24: admin endpoints return 401/403 for others.
- FR5, FR8–FR11, FR16–FR19, FR21: skill canonicalisation, post validation, pending posts hidden, admin approval, match score in search (87 %), apply, duplicate prevention, leader-only applications list, accept, skill gap (80 % coverage, Docker missing, correct suggestion), auto-close when full, remove member reopens.
- Concurrency: two simultaneous accepts for the last slot → exactly one succeeds.
- FR12–FR15: messaging requires a connection, unread counts, blocking stops messages.
- FR14: notifications created for approvals, applications, requests, decisions.
- FR22–FR23: report → ban hides posts, blocks login, revokes the live session; re-activation restores login.
- QR14: every Discover result satisfies all filters.
- GitHub sync (API mocked): all repos across pages stored; suggestions only; manual skills untouched (`both` when also detected); rejected stays rejected; unconfirmed suggestions removed when evidence disappears; confirmed kept; disconnect keeps manual/confirmed skills.

The API tests need a replica set. Use Atlas with a separate database:

```bash
MONGODB_URI_TEST="mongodb+srv://pipadmin:<pw>@cluster0.xxxxx.mongodb.net/pip-test?retryWrites=true&w=majority" npm test
```

CI (`.github/workflows/ci.yml`) runs typecheck, tests (with a MongoDB replica-set container) and the build on every push.

## Manual / browser checks performed

End-to-end browser runs (headless Chrome) covered: landing, register → OTP → onboarding validation → profile save, GitHub page, adding skills, applying (≤ 3 clicks), creating a post, admin approval, users and catalogue pages, reports, collaboration request → accept → **real-time chat delivered in ~0.1 s** between two browsers with typing indicator and read receipts, notifications, light/dark themes, and every page at **360 px width with no horizontal scrolling** (QR13). No console errors.

## Suggested demo script (≈ 5 minutes)

1. Landing page → "Create your profile" → register with a college email → OTP → onboarding.
2. GitHub → link your username → repositories + skill suggestions → confirm some on Skills.
3. Discover → filter by a skill → open a profile → Connect.
4. Team Finder → open a post → show "Your match" breakdown → apply.
5. Log in as the leader (demo account) → Review applications → accept → Skill gap page → invite a suggested student.
6. Team chat in two windows (real time).
7. Admin dashboard → approve a pending post, handle a report.

## Performance & load (QR5, QR6, QR7)

- QR6: run Lighthouse in Chrome DevTools on the deployed URL (after the service is awake).
- QR5/QR7: use Apache JMeter against `/api/discover` and `/api/opportunities` with a logged-in cookie. Seed a separate test database (not the free cluster) for the 10,000-profile measurement. Expect free-tier limits (0.1 CPU, Atlas ~100 ops/s) to cap throughput; report MUST/PLAN results with that context.
