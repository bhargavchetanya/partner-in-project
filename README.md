# Partner in Project

**Find teammates who actually fit.** A platform that helps students across colleges find teammates for projects, hackathons and research, matched by real skills and GitHub work.

UCS503 Software Engineering Lab · Thapar Institute of Engineering & Technology · Batch 3C35

🔗 **Live:** https://partner-in-project.onrender.com
*(Free hosting: the first load after a quiet period can take up to a minute while the server wakes up.)*

**Try it:** sign up with your email or **Continue with Google**, or use a demo account:
`ananya@demo.partnerinproject.app` / `DemoPass#2026` (a team leader with applications to review).
Other demo users: `rahul`, `priya`, `arjun`, `sneha`, `kabir`, `meera`, `vikram`, `isha`, `dev`, `zoya`, `aman` @demo.partnerinproject.app, all with the same password.

---

## Why

Students usually find teammates through WhatsApp groups and word of mouth, so teams end up random and skill gaps show up too late. Partner in Project:

- builds profiles from **real GitHub work**, not just self-reported skills
- gives every person and team a **transparent match score** with a plain-English explanation
- tells a team exactly **which skills it is still missing**, and who could fill them

---

## Features

| Area | What it does |
|---|---|
| **Accounts** | Email + password with 6-digit email OTP, **Continue with Google**, password reset, account lockout after 5 failed logins, rate limiting, 24 h secure sessions. Abandoned sign-ups can be restarted. |
| **Verification** | "Verified Student" badge for institutional emails (`thapar.edu`, `*.ac.in`, `*.edu.in`, `*.edu`, …, managed by admins). |
| **Profiles** | Photo (compressed in the browser), college, branch, year, bio, headline, interests, preferred roles, availability, skills wanted in teammates, projects, achievements, completeness checklist. |
| **GitHub** | Connect with GitHub OAuth (verified) or a username. Shows **all** public repos with languages, topics, stars and forks; up to 6 featured; manual refresh plus 24 h auto-refresh; disconnect or change account. |
| **Skills** | ~150 catalogued skills with aliases. Skills detected from GitHub (languages, topics, `package.json`, `requirements.txt`, `pom.xml`, `go.mod`, `Cargo.toml`, …) appear as **suggestions with evidence** to confirm or dismiss. Proficiency levels; manual skills are never removed by a sync. |
| **Matching** | `50% skills + 20% interests + 15% role + 15% availability`, with a gauge, component bars, matched/missing skills and a readable reason. |
| **Discover** | Find students across colleges, filtered by skill, interest, role, college, year and availability, ranked by match. |
| **Team Finder** | Post teams for hackathons, projects, research and competitions with open roles and required skills. Admin approval, apply in a few clicks, duplicate prevention, accept/reject, invitations, auto-close when full, auto-expire after the deadline. |
| **Teams** | Team page, members, leave/remove, automatic team chat, and a **skill-gap analyzer** (coverage %, missing skills, suggested students to invite). |
| **Messaging** | Connections, real-time 1:1 and team chat (Socket.IO) with read receipts and typing indicator, block and report. |
| **Notifications** | Live in-app notifications for applications, decisions, invitations, connections, messages and 48 h deadline reminders, plus optional email (Brevo). |
| **Admin** | Stats and activity, post approval queue, reports (dismiss/remove/warn/ban), user management, skill catalogue, categories, verified domains, audit log. |
| **UX** | Landing page, dark/light themes, responsive from 360 px, loading skeletons, empty and error states, Privacy and Terms pages. |

### How matching works

Each part is scored from 0 to 1 and weighted:

| Part | Weight | Meaning |
|---|---|---|
| Skills | 50% | Share of the required skills the person has |
| Interests | 20% | Overlap of domains (AI/ML, web, fintech, …) |
| Role | 15% | Whether they want the open role |
| Availability | 15% | Their hours/week compared with what the team needs |

If one side has no data for a part, that part is left out and the rest is rescaled, so scores stay fair. The same code (`packages/shared`) runs on the server and in the browser, and it is unit-tested.

---

## Tech stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, Vite 6, Tailwind CSS 4, TanStack Query, React Router 7, Framer Motion, Socket.IO client |
| Backend | Node.js 22, Express 5, Mongoose 8, Socket.IO 4, zod, bcrypt, helmet (CSP), express-rate-limit |
| Database | MongoDB Atlas (replica set, for transactions) |
| Auth & APIs | Google OAuth 2.0 (PKCE), GitHub OAuth + GitHub GraphQL/REST, Brevo email API |
| Testing & CI | Jest + Supertest (35 tests), strict TypeScript, GitHub Actions |
| Hosting | Render (free web service), configured by `render.yaml` |

**By the numbers:** 26 MongoDB collections · 106 REST endpoints · 27 pages · ~13,000 lines of TypeScript · 35 automated tests.

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
├─ packages/shared/        Match engine, skill-gap analyzer, skill extraction, catalogue, zod schemas (+ unit tests)
├─ docs/                   API, database, deployment, testing
├─ .github/workflows/      CI, hourly cron, daily backup
└─ render.yaml             Render blueprint (free web service)
```

---

## Run it locally

Requirements: **Node.js 20.11+** (22 recommended) and a MongoDB **replica set**. A free MongoDB Atlas cluster works.

```bash
git clone https://github.com/bhargavchetanya/partner-in-project.git
cd partner-in-project
npm install
cp .env.example .env          # then set at least MONGODB_URI and ADMIN_EMAILS
npm run seed:demo             # optional: 12 demo students + 5 team posts
npm run dev                   # API on :4000, web app on http://localhost:5173
```

- Without Brevo configured, OTP codes and reset links are printed in the terminal (development only).
- Google and GitHub sign-in work once their keys are in `.env` (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).
- To make yourself admin, put your email in `ADMIN_EMAILS` and log in, or run `npm run make-admin -w apps/api -- you@example.com`.

---

## Tests

```bash
npm test                      # shared unit tests + API integration tests
npm run typecheck             # strict TypeScript across all packages
```

- **packages/shared:** match score and re-weighting, skill gap, every manifest parser and skill extraction.
- **apps/api:** auth (registration, restarting an unverified sign-up, duplicate email, bcrypt, lockout, reset), admin-only access, the full team flow (post → approval → apply → accept → skill gap → auto-close), **concurrent accepts for the last slot**, messaging and blocking, notifications, reports and bans, discover filters, and GitHub sync with the GitHub API mocked.

The API tests need a MongoDB replica set via `MONGODB_URI_TEST`. See [docs/TESTING.md](docs/TESTING.md).

---

## Deployment (free)

One Render web service serves the API, WebSockets and the React app from a single URL. It uses a MongoDB Atlas free cluster, Brevo for email, Google and GitHub OAuth, and GitHub Actions for CI, an hourly reminder job and daily database backups. Secrets are set in the Render dashboard and are never committed.

Step-by-step guide: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

## More docs

- [docs/API.md](docs/API.md): REST + Socket.IO reference
- [docs/DATABASE.md](docs/DATABASE.md): collections, fields, constraints
- [docs/TESTING.md](docs/TESTING.md): test plan and how to run everything
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): accounts, keys, callback URLs, verification checklist

---

## Team

Chetanya Bhargav (1024030027) · Memansi (1024030006) · Harschelle (1024030039)
Batch 3C35 · UCS503 Software Engineering Lab · Thapar Institute of Engineering & Technology
