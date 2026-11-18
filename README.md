# Partner in Project

**Student project & hackathon collaboration platform** — UCS503 Software Engineering Lab, Thapar Institute of Engineering & Technology.

Students build profiles backed by their real GitHub work, discover collaborators across colleges, post hackathon/project/research team opportunities, apply and get matched with a transparent score, see what skills their team is missing, and chat in real time. Administrators moderate posts, reports and accounts.

> Stack (as specified in the SRS, QR10): **MERN** — MongoDB, Express, React, Node.js — written in TypeScript (compiles to JavaScript), with Tailwind CSS and Socket.IO.

---

## Features

| Area | What's implemented | SRS |
|---|---|---|
| Accounts | Email + password registration, 6-digit email OTP, **Continue with Google**, account linking by email, password reset (15-min link), 5-attempt / 15-min lockout, 24 h sessions, rate limiting | FR1–FR4, QR20–QR24 |
| Verification | "Verified Student" badge for institutional domains (`thapar.edu`, `*.ac.in`, `*.edu.in`, `*.edu` … admin-managed); unverified users can't post or apply | FR2 |
| Profiles | Name, photo (compressed ≤ 0.5 MB), college, branch, year, bio, headline, interests, preferred roles, availability, "skills I want in teammates", projects, achievements; one-page edit with required fields marked; draft kept if saving fails | FR5, QR3, QR9, QR12 |
| GitHub | Connect via GitHub OAuth (verified) **or** username/profile link; **all** public repos (no limit) with languages, topics, stars, forks, URL, last updated; refresh; up to 6 featured; disconnect/change; 24 h cache; last saved data shown if GitHub is down | FR6, QR11, QR18 |
| Skills | Detected from languages, topics, dependency manifests (package.json, requirements.txt, pom.xml, build.gradle, go.mod, Cargo.toml, …) and config files; **all** shown as categorised *suggestions with evidence*; confirm/reject (one or all); add/edit/remove/search; proficiency levels; GitHub vs manual clearly marked; sync never deletes manual skills | Prompt §6 |
| Matching | `50% skill + 20% interest + 15% role + 15% availability`, each normalised to 0–1, missing parts re-weighted; gauge, component bars, matched / missing / required skills and a plain-English reason everywhere | FR9 |
| Discover | Search by name/skill; filters for skills, interests, college, year, role, availability (every result matches all filters); match against your profile or one of your teams' missing skills; connect / message | FR7, QR4, QR14 |
| Team Finder | Create posts (title, description, event, type, domains, deadline, team size, commitment, required skills, open roles/positions); admin approval; browse/search/filter/sort by match; apply in ≤ 3 clicks; duplicate prevention (DB unique index); withdraw; accept/reject; atomic capacity (transaction); auto-close when full, auto-expire after deadline; edit, close, reopen, delete | FR8, FR10, FR11, FR16–FR18, QR2 |
| Teams | Team page, remove member (+1 open position), leave, team invitations, **skill gap analyzer** (coverage %, who covers what, missing skills, top-5 / all suggested students ranked by fit, invite) | FR18, FR19 |
| Communication | Collaboration requests & connections, real-time 1:1 and team chat (Socket.IO) with read receipts and typing indicator, block, report | FR12, FR13, FR15, QR8 |
| Notifications | In-app (live bell + page) for applications, decisions, approvals, requests, invitations, messages, 48 h deadline reminders; email via Brevo (user can switch off) | FR14 |
| Admin | Stats & 14-day activity, post approval queue (approve/reject with reason/remove), reports (dismiss/remove content/warn/ban), users (activate/deactivate/ban/make admin/warn), skill catalogue, categories, roles, interests, verified domains, audit log | FR20–FR23 |
| UX | Landing page, dark & light themes, responsive 360–1920 px, loading skeletons, empty states, error states with retry, toasts | QR1, QR6, QR13 |

---

## Project structure

```
partner-in-project/
├─ apps/
│  ├─ api/                 Express 5 + Mongoose + Socket.IO (TypeScript)
│  │  └─ src/
│  │     ├─ models/        MongoDB schemas, indexes, constraints
│  │     ├─ routes/        REST API (auth, profiles, github, skills, discover, opportunities, applications, social, admin, internal)
│  │     ├─ services/      GitHub sync + skill detection, team/membership logic
│  │     ├─ lib/           auth/session, validation, email, notifications, realtime, catalogue
│  │     ├─ scripts/       seed, demo data, make-admin
│  │     └─ tests/         integration tests (Jest + Supertest)
│  └─ web/                 React 18 + Vite + Tailwind CSS 4 (TypeScript)
│     └─ src/pages, components, lib
├─ packages/shared/        Match engine, skill-gap analyzer, skill extraction rules, catalogue, zod schemas (+ unit tests)
├─ docs/                   API, database, deployment, testing
├─ .github/workflows/      CI, hourly cron, daily backup
└─ render.yaml             Render blueprint (free web service)
```

---

## Run it locally (macOS)

Requirements: **Node.js 20.11+** (22 recommended) and a MongoDB **replica set** (MongoDB Atlas free cluster works — transactions need a replica set).

```bash
git clone https://github.com/<you>/partner-in-project.git
cd partner-in-project
npm install
cp .env.example .env          # then edit .env — at minimum set MONGODB_URI and ADMIN_EMAILS
npm run seed:demo             # optional: 12 demo students + 5 team posts
npm run dev                   # API on :4000, web app on http://localhost:5173
```

Open http://localhost:5173. Without Brevo configured, OTP codes and reset links are shown in the UI (development only) and printed in the terminal. Google/GitHub buttons work once their keys are in `.env`.

Demo accounts (after `npm run seed:demo`): `ananya@demo.partnerinproject.app` … password `DemoPass#2026`.

Make yourself admin: put your email in `ADMIN_EMAILS` and log in, or run `npm run make-admin -w apps/api -- you@example.com`.

---

## Tests

```bash
npm test                      # shared unit tests + API integration tests
```

- `packages/shared` — match score (incl. the 4/5 = 80 % example and the re-weighting rule), skill gap, every manifest parser and skill extraction (QR26).
- `apps/api` — auth (registration, duplicate email, bcrypt, lockout, reset), admin-only access, full team flow (post → approval → match → apply → duplicate → accept → skill gap → auto-close → remove member), **concurrent accepts for the last slot**, messaging/blocking, notifications, reports & bans, discover filters, and GitHub sync rules with the GitHub API mocked.

The API tests need a MongoDB replica set: set `MONGODB_URI_TEST` (e.g. an Atlas URI with database `pip-test`). See [docs/TESTING.md](docs/TESTING.md).

---

## Deployment (free)

One Render free web service (API + WebSockets + React app on the same origin) + MongoDB Atlas free cluster + Brevo free email + GitHub Actions for the hourly job and daily backups. Step-by-step: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## More docs

- [docs/API.md](docs/API.md) — REST + Socket.IO reference
- [docs/DATABASE.md](docs/DATABASE.md) — collections, fields, constraints
- [docs/TESTING.md](docs/TESTING.md) — test plan and how to run everything
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — accounts, keys, callback URLs, verification checklist

## Team

Chetanya (1024030027) · Memansi (1024030006) · Harschelle (1024030039) — Batch 3C35
