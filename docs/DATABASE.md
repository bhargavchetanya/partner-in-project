# Database design (MongoDB)

Defined in `apps/api/src/models/index.ts`. Indexes and unique constraints are created on start-up (`Model.init()`); the default catalogue is inserted if missing. Multi-document changes that must be atomic (accepting an application/invitation, removing a member) run in **transactions**, so the database must be a replica set (Atlas is).

| Collection | Purpose | Key constraints |
|---|---|---|
| `users` | account, role (`student`/`admin`), status (`active`/`deactivated`/`banned`), bcrypt hash, Google id, lockout counters, email prefs | unique `email`; unique partial `googleId` |
| `profiles` | public profile + denormalised confirmed `skillSlugs` and `completeness` | unique `userId`; year 0–6; bio ≤ 500; hours 0–60; text index |
| `avatars` | compressed profile photo bytes | unique `userId`; size ≤ 2 MB (QR12) |
| `skills` | catalogue: slug, name, category, aliases, active, custom | unique `slug` |
| `skillcategories`, `roles`, `interests` | admin-managed lists | unique `slug` |
| `institutiondomains` | domains that earn "Verified Student" | unique `domain` |
| `userskills` | user ↔ skill: source (`manual`/`github`/`both`), status (`confirmed`/`suggested`/`rejected`), proficiency, GitHub evidence | unique (`userId`, `skill`) |
| `githubaccounts` | linked account, method (`oauth`/`username`), encrypted token, sync state | unique `userId`; unique `githubId` |
| `repositories` | cached public repos: languages (bytes), topics, stars, forks, dates, detected tech, featured | unique `githubRepoId` |
| `opportunities` | team posts ("projects"): required skills (embedded), open roles with `slots`/`filled`, status, member count | index (`status`, `deadline`); text index |
| `teammembers` | team membership incl. the leader (`isLeader`) | unique (`opportunityId`, `userId`) |
| `applications` | status (`pending`/`accepted`/`rejected`/`withdrawn`), role, message, match snapshot | **unique (`opportunityId`, `applicantId`)** — no duplicate applications |
| `teaminvitations` | leader → student invites | unique partial (opportunity, invitee) while pending |
| `collaborationrequests` | connection requests | unique partial pair while pending |
| `connections` | accepted pairs (sorted ids) | unique (`userA`, `userB`) |
| `blocks` | blocker → blocked | unique pair |
| `conversations` | `direct` (unique `directKey`) or `team` (unique `opportunityId`), participants, last message | |
| `messages` | body ≤ 2000, `readBy[]`, `removed` | index (`conversationId`, `createdAt`) |
| `notifications` | type, title, body, link, read/emailed time | index (`userId`, `readAt`, `createdAt`) |
| `reports` | target (user/opportunity/message), owner, reason, status, resolution | index (`status`) |
| `adminactions` | append-only audit log | index (`createdAt`) |
| `sessions` | server-side session records (logout/ban revoke immediately) | TTL on `expiresAt` |
| `emailtokens` | hashed OTP / reset tokens | TTL on `expiresAt` |
| `oauthstates` | OAuth `state` + PKCE verifier | TTL on `expiresAt` |

## Relationships

```
User 1─1 Profile 1─1 Avatar
User 1─* UserSkill *─1 Skill *─1 SkillCategory
User 1─1 GithubAccount, User 1─* Repository
User (leader) 1─* Opportunity 1─* TeamMember *─1 User
Opportunity 1─* Application *─1 User,  Opportunity 1─* TeamInvitation
User *─* User via Connection / CollaborationRequest / Block
Conversation 1─* Message;  Opportunity 1─1 Conversation(team)
User 1─* Notification;  Report → target;  AdminAction → target
```

"Team Leader" is not a separate account role: a user is the leader of a specific team (`opportunities.leaderId` + `teammembers.isLeader`), and keeps their normal student profile.
