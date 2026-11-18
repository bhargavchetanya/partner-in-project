/**
 * MongoDB data model (Mongoose). Collections map 1:1 to the database design in the plan.
 * Constraints are enforced with schema validators and unique / compound indexes.
 */
import mongoose, { Schema, type InferSchemaType, type HydratedDocument, Types } from 'mongoose';

const { ObjectId } = Schema.Types;
const opts = { timestamps: true } as const;

// ---------------------------------------------------------------- users
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    passwordHash: { type: String, default: null },
    googleId: { type: String, default: undefined },
    emailVerified: { type: Boolean, default: false },
    institutionVerified: { type: Boolean, default: false },
    role: { type: String, enum: ['student', 'admin'], default: 'student', index: true },
    status: { type: String, enum: ['active', 'deactivated', 'banned'], default: 'active', index: true },
    statusReason: { type: String, default: '' },
    failedLogins: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    warnings: { type: Number, default: 0 },
    notificationPrefs: {
      email: { type: Boolean, default: true },
    },
  },
  opts,
);
userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } });
export const User = mongoose.model('User', userSchema);
export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;

// ---------------------------------------------------------------- profiles
const projectSub = new Schema(
  { title: String, description: String, url: String, tech: [String] },
  { _id: true },
);
const achievementSub = new Schema({ title: String, description: String, date: String }, { _id: true });

const profileSchema = new Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    headline: { type: String, default: '', maxlength: 100 },
    college: { type: String, default: '', maxlength: 120 },
    branch: { type: String, default: '', maxlength: 80 },
    year: { type: Number, min: 0, max: 6, default: 0 },
    bio: { type: String, default: '', maxlength: 500 },
    location: { type: String, default: '', maxlength: 80 },
    website: { type: String, default: '', maxlength: 300 },
    interests: { type: [String], default: [] },
    preferredRoles: { type: [String], default: [] },
    availabilityHours: { type: Number, min: 0, max: 60, default: 0 },
    lookingForSkills: { type: [String], default: [] },
    projects: { type: [projectSub], default: [] },
    achievements: { type: [achievementSub], default: [] },
    avatarVersion: { type: Number, default: 0 },
    externalAvatarUrl: { type: String, default: '' },
    completeness: { type: Number, default: 0 },
    /** Denormalised confirmed skill slugs for fast discovery queries. */
    skillSlugs: { type: [String], default: [], index: true },
  },
  opts,
);
profileSchema.index({ name: 'text', college: 'text', headline: 'text', bio: 'text' });
profileSchema.index({ college: 1 });
profileSchema.index({ year: 1 });
export const Profile = mongoose.model('Profile', profileSchema);
export type ProfileDoc = HydratedDocument<InferSchemaType<typeof profileSchema>>;

const avatarSchema = new Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true, unique: true },
    mime: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
    data: { type: Buffer, required: true },
    size: { type: Number, required: true, max: 2 * 1024 * 1024 }, // QR12 MUST <= 2 MB
  },
  opts,
);
export const Avatar = mongoose.model('Avatar', avatarSchema);

// ---------------------------------------------------------------- catalogue
const categorySchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true, unique: true, maxlength: 60 },
    order: { type: Number, default: 50 },
  },
  opts,
);
export const SkillCategory = mongoose.model('SkillCategory', categorySchema);

const skillSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true, maxlength: 60 },
    category: { type: String, required: true, default: 'other' },
    aliases: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    custom: { type: Boolean, default: false },
  },
  opts,
);
export const Skill = mongoose.model('Skill', skillSchema);

const namedSchema = () =>
  new Schema(
    {
      slug: { type: String, required: true, unique: true },
      name: { type: String, required: true, maxlength: 60 },
      active: { type: Boolean, default: true },
    },
    opts,
  );
export const Role = mongoose.model('Role', namedSchema());
export const Interest = mongoose.model('Interest', namedSchema());

const domainSchema = new Schema({ domain: { type: String, required: true, unique: true, lowercase: true } }, opts);
export const InstitutionDomain = mongoose.model('InstitutionDomain', domainSchema);

// ---------------------------------------------------------------- user skills
const evidenceSub = new Schema({ repo: String, signal: String, detail: String }, { _id: false });
const userSkillSchema = new Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    skill: { type: String, required: true }, // catalogue slug
    source: { type: String, enum: ['manual', 'github', 'both'], required: true },
    status: { type: String, enum: ['confirmed', 'suggested', 'rejected'], required: true },
    proficiency: { type: String, enum: ['beginner', 'intermediate', 'advanced', 'expert'], default: 'intermediate' },
    evidence: { type: [evidenceSub], default: [] },
    repoCount: { type: Number, default: 0 },
    codeShare: { type: Number, default: null },
    lastUsed: { type: Date, default: null },
    detectedOnGithub: { type: Boolean, default: false },
  },
  opts,
);
userSkillSchema.index({ userId: 1, skill: 1 }, { unique: true });
userSkillSchema.index({ skill: 1, status: 1 });
export const UserSkill = mongoose.model('UserSkill', userSkillSchema);

// ---------------------------------------------------------------- github
const githubAccountSchema = new Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true, unique: true },
    githubId: { type: Number, required: true },
    login: { type: String, required: true },
    name: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    profileUrl: { type: String, default: '' },
    bio: { type: String, default: '' },
    followers: { type: Number, default: 0 },
    publicRepos: { type: Number, default: 0 },
    linkMethod: { type: String, enum: ['oauth', 'username'], required: true },
    accessToken: { type: String, default: null, select: false }, // AES-256-GCM encrypted
    lastSyncedAt: { type: Date, default: null },
    syncStatus: { type: String, enum: ['idle', 'syncing', 'ok', 'error'], default: 'idle' },
    syncError: { type: String, default: '' },
    includeForks: { type: Boolean, default: false },
  },
  opts,
);
githubAccountSchema.index({ githubId: 1 }, { unique: true });
export const GithubAccount = mongoose.model('GithubAccount', githubAccountSchema);

const repoSchema = new Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true, index: true },
    githubRepoId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    fullName: { type: String, required: true },
    description: { type: String, default: '' },
    url: { type: String, required: true },
    homepage: { type: String, default: '' },
    primaryLanguage: { type: String, default: null },
    primaryLanguageColor: { type: String, default: null },
    languages: { type: Map, of: Number, default: {} },
    topics: { type: [String], default: [] },
    stars: { type: Number, default: 0 },
    forks: { type: Number, default: 0 },
    isFork: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    pushedAt: { type: Date, default: null },
    repoUpdatedAt: { type: Date, default: null },
    repoCreatedAt: { type: Date, default: null },
    detectedTech: { type: [String], default: [] },
    featured: { type: Boolean, default: false },
    featuredOrder: { type: Number, default: 0 },
  },
  opts,
);
export const Repository = mongoose.model('Repository', repoSchema);

// ---------------------------------------------------------------- opportunities & teams
const openRoleSub = new Schema(
  {
    role: { type: String, required: true },
    slots: { type: Number, required: true, min: 1, max: 10 },
    filled: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const opportunitySchema = new Schema(
  {
    leaderId: { type: ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 4000 },
    eventName: { type: String, required: true, maxlength: 120 },
    type: { type: String, enum: ['hackathon', 'project', 'research', 'competition'], default: 'hackathon' },
    domains: { type: [String], default: [] },
    deadline: { type: Date, required: true },
    teamSize: { type: Number, required: true, min: 2, max: 12 },
    commitmentHours: { type: Number, default: 8, min: 1, max: 60 },
    requiredSkills: { type: [String], default: [] }, // "required skills" relation, embedded
    openRoles: { type: [openRoleSub], default: [] },
    location: { type: String, default: 'Remote' },
    memberCount: { type: Number, default: 0, min: 0 }, // excluding leader
    status: {
      type: String,
      enum: ['pending_approval', 'open', 'rejected', 'closed', 'expired', 'removed'],
      default: 'pending_approval',
      index: true,
    },
    rejectionReason: { type: String, default: '' },
    approvedAt: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
    conversationId: { type: ObjectId, ref: 'Conversation', default: null },
    hiddenByBan: { type: Boolean, default: false },
  },
  opts,
);
opportunitySchema.index({ status: 1, deadline: 1 });
opportunitySchema.index({ title: 'text', description: 'text', eventName: 'text' });
export const Opportunity = mongoose.model('Opportunity', opportunitySchema);
export type OpportunityDoc = HydratedDocument<InferSchemaType<typeof opportunitySchema>>;

const teamMemberSchema = new Schema(
  {
    opportunityId: { type: ObjectId, ref: 'Opportunity', required: true },
    userId: { type: ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, required: true },
    isLeader: { type: Boolean, default: false },
  },
  opts,
);
teamMemberSchema.index({ opportunityId: 1, userId: 1 }, { unique: true });
export const TeamMember = mongoose.model('TeamMember', teamMemberSchema);

const applicationSchema = new Schema(
  {
    opportunityId: { type: ObjectId, ref: 'Opportunity', required: true },
    applicantId: { type: ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, required: true },
    message: { type: String, default: '', maxlength: 1000 },
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'withdrawn'], default: 'pending' },
    matchScore: { type: Number, default: 0 },
    decidedAt: { type: Date, default: null },
  },
  opts,
);
// FR10: a user cannot apply twice to the same post — enforced by the database.
applicationSchema.index({ opportunityId: 1, applicantId: 1 }, { unique: true });
applicationSchema.index({ opportunityId: 1, status: 1 });
export const Application = mongoose.model('Application', applicationSchema);

const invitationSchema = new Schema(
  {
    opportunityId: { type: ObjectId, ref: 'Opportunity', required: true },
    inviterId: { type: ObjectId, ref: 'User', required: true },
    inviteeId: { type: ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, required: true },
    message: { type: String, default: '', maxlength: 500 },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'cancelled'], default: 'pending' },
  },
  opts,
);
invitationSchema.index(
  { opportunityId: 1, inviteeId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);
export const TeamInvitation = mongoose.model('TeamInvitation', invitationSchema);

// ---------------------------------------------------------------- connections
const requestSchema = new Schema(
  {
    fromId: { type: ObjectId, ref: 'User', required: true, index: true },
    toId: { type: ObjectId, ref: 'User', required: true, index: true },
    message: { type: String, default: '', maxlength: 500 },
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'cancelled'], default: 'pending' },
  },
  opts,
);
requestSchema.index({ fromId: 1, toId: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
export const CollaborationRequest = mongoose.model('CollaborationRequest', requestSchema);

const connectionSchema = new Schema(
  {
    userA: { type: ObjectId, ref: 'User', required: true },
    userB: { type: ObjectId, ref: 'User', required: true },
  },
  opts,
);
connectionSchema.index({ userA: 1, userB: 1 }, { unique: true });
connectionSchema.index({ userB: 1 });
export const Connection = mongoose.model('Connection', connectionSchema);

const blockSchema = new Schema(
  {
    blockerId: { type: ObjectId, ref: 'User', required: true },
    blockedId: { type: ObjectId, ref: 'User', required: true },
  },
  opts,
);
blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
blockSchema.index({ blockedId: 1 });
export const Block = mongoose.model('Block', blockSchema);

// ---------------------------------------------------------------- messaging
const conversationSchema = new Schema(
  {
    type: { type: String, enum: ['direct', 'team'], required: true },
    participants: { type: [{ type: ObjectId, ref: 'User' }], index: true },
    directKey: { type: String, default: undefined },
    opportunityId: { type: ObjectId, ref: 'Opportunity', default: undefined },
    title: { type: String, default: '' },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessagePreview: { type: String, default: '' },
  },
  opts,
);
conversationSchema.index({ directKey: 1 }, { unique: true, partialFilterExpression: { directKey: { $type: 'string' } } });
conversationSchema.index({ opportunityId: 1 }, { unique: true, partialFilterExpression: { opportunityId: { $type: 'objectId' } } });
export const Conversation = mongoose.model('Conversation', conversationSchema);

const messageSchema = new Schema(
  {
    conversationId: { type: ObjectId, ref: 'Conversation', required: true },
    senderId: { type: ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, maxlength: 2000 },
    readBy: { type: [{ type: ObjectId, ref: 'User' }], default: [] },
    removed: { type: Boolean, default: false },
  },
  opts,
);
messageSchema.index({ conversationId: 1, createdAt: -1 });
export const Message = mongoose.model('Message', messageSchema);

// ---------------------------------------------------------------- notifications
const notificationSchema = new Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, default: '', maxlength: 500 },
    link: { type: String, default: '' },
    readAt: { type: Date, default: null },
    emailedAt: { type: Date, default: null },
  },
  opts,
);
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
export const Notification = mongoose.model('Notification', notificationSchema);

// ---------------------------------------------------------------- moderation
const reportSchema = new Schema(
  {
    reporterId: { type: ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['user', 'opportunity', 'message'], required: true },
    targetId: { type: ObjectId, required: true },
    targetOwnerId: { type: ObjectId, ref: 'User', default: null },
    reason: { type: String, enum: ['spam', 'harassment', 'inappropriate', 'fake_profile', 'misleading', 'other'], required: true },
    details: { type: String, default: '', maxlength: 1000 },
    status: { type: String, enum: ['open', 'closed', 'actioned'], default: 'open', index: true },
    resolution: { type: String, default: '' },
    handledBy: { type: ObjectId, ref: 'User', default: null },
    handledAt: { type: Date, default: null },
  },
  opts,
);
export const Report = mongoose.model('Report', reportSchema);

const adminActionSchema = new Schema(
  {
    adminId: { type: ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, required: true },
    reason: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  opts,
);
adminActionSchema.index({ createdAt: -1 });
export const AdminAction = mongoose.model('AdminAction', adminActionSchema);

// ---------------------------------------------------------------- auth support
const sessionSchema = new Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true, index: true },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, default: '' },
  },
  opts,
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Session = mongoose.model('Session', sessionSchema);

const emailTokenSchema = new Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: ['verify', 'reset'], required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  opts,
);
emailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
emailTokenSchema.index({ userId: 1, purpose: 1 });
export const EmailToken = mongoose.model('EmailToken', emailTokenSchema);

/** Short-lived OAuth state, stored server-side so it survives the redirect round-trip. */
const oauthStateSchema = new Schema(
  {
    state: { type: String, required: true, unique: true },
    provider: { type: String, enum: ['google', 'github'], required: true },
    codeVerifier: { type: String, default: '' },
    userId: { type: ObjectId, ref: 'User', default: null },
    returnTo: { type: String, default: '/' },
    expiresAt: { type: Date, required: true },
  },
  opts,
);
oauthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const OAuthState = mongoose.model('OAuthState', oauthStateSchema);

export const allModels = [
  User, Profile, Avatar, SkillCategory, Skill, Role, Interest, InstitutionDomain, UserSkill, GithubAccount,
  Repository, Opportunity, TeamMember, Application, TeamInvitation, CollaborationRequest, Connection, Block,
  Conversation, Message, Notification, Report, AdminAction, Session, EmailToken, OAuthState,
];

export { Types };
