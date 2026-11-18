# API reference

Base URL: `/api` (same origin as the web app). JSON in and out. Authentication uses an httpOnly session cookie (`pip_session`, 24 h) set by login/register/Google.

Errors always look like:

```json
{ "error": { "message": "Please fix the highlighted fields", "code": "VALIDATION_ERROR", "details": { "title": "Title is required" } } }
```

Common codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `EMAIL_NOT_VERIFIED` / `FORBIDDEN` / `ADMIN_ONLY` (403), `NOT_FOUND` (404), `EMAIL_TAKEN` / `ALREADY_APPLIED` / `DUPLICATE` (409), `ACCOUNT_LOCKED` (423), `RATE_LIMITED` (429), `GITHUB_UNAVAILABLE` (503).

Legend: 🔓 public · 🔑 logged in · ✅ verified email · 🛡 admin

## Auth — `/api/auth`

| Method & path | | Body / notes |
|---|---|---|
| `POST /register` | 🔓 | `{name, email, password (≥8), college}` → sends OTP, starts session |
| `POST /verify-email` | 🔓 | `{email, code}` (6 digits, 10 min, 5 attempts) |
| `POST /resend-otp` | 🔓 | `{email}` (45 s cooldown) |
| `POST /login` | 🔓 | `{email, password}` — 5 failures ⇒ locked 15 min (423) |
| `POST /logout` | 🔑 | |
| `GET /me` | 🔓 | `{user \| null, features: {google, githubOAuth, email}}` |
| `POST /forgot-password` | 🔓 | `{email}` → emails a link valid 15 min |
| `POST /reset-password` | 🔓 | `{token, password}` — signs out all sessions |
| `POST /change-password` | 🔑 | `{currentPassword?, newPassword}` |
| `PATCH /preferences` | 🔑 | `{emailNotifications: boolean}` |
| `GET /google` → `GET /google/callback` | 🔓 | OAuth 2.0 + PKCE redirect flow |

## Profiles — `/api/profiles`

| | | |
|---|---|---|
| `GET /me` | 🔑 | full profile incl. suggested skills, GitHub summary, featured repos |
| `PUT /me` | 🔑 | `{name, college, branch, year, bio, headline, interests[], preferredRoles[], availabilityHours, lookingForSkills[], location, website, projects[], achievements[]}` |
| `POST /me/avatar` | 🔑 | multipart `avatar` (JPEG/PNG/WebP, ≤ 2 MB, content-sniffed) |
| `DELETE /me/avatar` | 🔑 | |
| `GET /:userId` | 🔑 | public profile (email only for self/connections), connection state |
| `GET /:userId/avatar` | 🔓 | image bytes (immutable cache) |

## GitHub — `/api/github`

| | | |
|---|---|---|
| `GET /status` | 🔑 | link state, sync status; triggers a background refresh if older than 24 h |
| `POST /link` | 🔑 | `{username}` (username or profile URL) → 202, sync starts |
| `GET /connect` → `GET /callback` | 🔑 | GitHub OAuth (scope `read:user`), token stored AES-256-GCM encrypted |
| `POST /sync` | 🔑 | manual refresh (2 min cooldown) |
| `PATCH /settings` | 🔑 | `{includeForks}` |
| `DELETE /` | 🔑 | disconnect (manual + confirmed skills kept) |
| `GET /repos?userId=` | 🔑 | **all** repos |
| `PUT /featured` | 🔑 | `{repoIds: string[≤6]}` |

## Skills — `/api/skills`

| | | |
|---|---|---|
| `GET /me` | 🔑 | all user skills with source, status, proficiency, evidence, counts |
| `POST /me` | 🔑 | `{name, proficiency}` — unknown names become catalogue entries |
| `PATCH /me/:id` | 🔑 | `{proficiency?, status?: confirmed\|rejected\|suggested}` |
| `POST /me/bulk` | 🔑 | `{ids[], status: confirmed\|rejected}` |
| `DELETE /me/:id` | 🔑 | manual ⇒ deleted; still-detected ⇒ rejected (won't be re-suggested) |

## Catalogue & discovery

| | | |
|---|---|---|
| `GET /api/catalog` | 🔓 | skills (with aliases & categories), roles, interests |
| `GET /api/discover` | 🔑 | `q, skills (all), interests, roles, college, years, minHours, context=profile\|<teamId>, sort=match\|availability\|name, page, limit` → people with `match` |

## Opportunities — `/api/opportunities`

| | | |
|---|---|---|
| `GET /` | 🔑 | open posts: `q, event, skills (all), role, domains, type, deadlineBefore, sort=match\|deadline\|new, mine=exclude, page, limit` |
| `GET /mine` | 🔑 | `{led[], memberOf[]}` |
| `POST /` | ✅ | create → `pending_approval` |
| `GET /:id` | 🔑 | details, members, my application/invitation, `match`, `canApply` |
| `PUT /:id` | ✅ leader | edit (rejected posts are resubmitted) |
| `POST /:id/close` · `/reopen` · `DELETE /:id` | leader | |
| `POST /:id/apply` | ✅ | `{role, message?}` — duplicate ⇒ 409 |
| `GET /:id/applications?status=` | leader/🛡 | applicants with full match breakdown |
| `GET /:id/team` | member/🛡 | members, invitations, team conversation id |
| `GET /:id/skill-gap?all=1` | member/🛡 | coverage, rows, missing, suggestions (5 or 50) |
| `DELETE /:id/members/:userId` | leader | open position +1 |
| `POST /:id/leave` | member | |
| `POST /:id/invite` | ✅ leader | `{userId, role, message?}` |

## Applications & invitations

| | | |
|---|---|---|
| `GET /api/applications/mine` | 🔑 | |
| `POST /api/applications/:id/withdraw` | applicant | pending only |
| `POST /api/applications/:id/accept` · `/reject` | leader | accept is a transaction; closes the post when full |
| `GET /api/invitations/mine` | 🔑 | |
| `POST /api/invitations/:id/accept` · `/decline` · `DELETE /:id` | invitee / inviter | |

## Social

| | | |
|---|---|---|
| `GET /api/connections` · `GET /requests` | 🔑 | |
| `POST /api/connections/requests` | 🔑 | `{userId, message?}` (blocked ⇒ 403) |
| `POST /api/connections/requests/:id/accept\|reject\|cancel` · `DELETE /api/connections/:userId` | 🔑 | |
| `GET /api/blocks` · `POST /api/blocks/:userId` · `DELETE /api/blocks/:userId` | 🔑 | |
| `POST /api/reports` | 🔑 | `{targetType: user\|opportunity\|message, targetId, reason, details?}` |
| `GET /api/conversations` · `/unread-count` · `/:id` | 🔑 | |
| `POST /api/conversations/direct` | 🔑 | `{userId}` — connections or teammates only |
| `GET /api/conversations/:id/messages?before=` | participant | 50 per page |
| `POST /api/conversations/:id/messages` | participant | `{body ≤ 2000}` |
| `POST /api/conversations/:id/read` | participant | |
| `GET /api/notifications?unread=1` · `/unread-count` · `POST /read-all` · `POST /:id/read` · `DELETE /:id` | 🔑 | |

## Admin — `/api/admin` (🛡 all)

`GET /stats`, `GET /activity`, `GET /users?q&status&role&page`, `PATCH /users/:id/status {status, reason}`, `PATCH /users/:id/role {role}`, `POST /users/:id/warn`, `GET /opportunities?status=`, `POST /opportunities/:id/approve`, `POST /opportunities/:id/reject {reason}`, `POST /opportunities/:id/remove`, `GET /reports?status=`, `POST /reports/:id/dismiss|remove-content|warn|ban`, `GET /catalog`, `POST /skills`, `PATCH /skills/:id`, `POST /categories`, `PATCH /categories/:id`, `POST /roles`, `PATCH /roles/:id`, `POST /interests`, `PATCH /interests/:id`, `POST /domains`, `DELETE /domains/:id`. Every action is written to the `adminactions` audit log.

## Internal

- `GET /api/health` — `{status, db}`
- `POST /api/internal/cron` with header `x-cron-secret` — expires posts, sends 48 h reminders (called hourly by GitHub Actions)

## Socket.IO (`/socket.io`, same origin, authenticated by the session cookie)

| Direction | Event | Payload |
|---|---|---|
| client → server | `conversation:join` / `conversation:leave` | conversationId |
| client → server | `typing` | conversationId |
| server → client | `message:new` | message |
| server → client | `notification:new` | notification |
| server → client | `conversation:updated` · `conversation:read` · `typing` · `team:updated` | ids |
