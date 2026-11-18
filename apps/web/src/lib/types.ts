import type { MatchResult } from '@pip/shared';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'admin';
  emailVerified: boolean;
  institutionVerified: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  notificationPrefs: { email: boolean };
  avatarUrl: string | null;
  profileComplete: boolean;
  completeness: number;
  createdAt: string;
}

export interface MeResponse {
  user: SessionUser | null;
  features?: { google: boolean; githubOAuth: boolean; email: boolean };
}

export interface Catalog {
  skills: { slug: string; name: string; category: string; aliases: string[]; custom: boolean }[];
  categories: { slug: string; name: string; order: number }[];
  roles: { slug: string; name: string }[];
  interests: { slug: string; name: string }[];
}

export interface Repo {
  id: string;
  name: string;
  fullName: string;
  description: string;
  url: string;
  homepage: string;
  primaryLanguage: string | null;
  primaryLanguageColor: string | null;
  languages: Record<string, number>;
  topics: string[];
  stars: number;
  forks: number;
  isFork: boolean;
  archived: boolean;
  pushedAt: string | null;
  updatedAt: string | null;
  detectedTech: string[];
  featured: boolean;
  featuredOrder: number;
}

export interface FullProfile {
  id: string;
  name: string;
  headline: string;
  college: string;
  branch: string;
  year: number;
  bio: string;
  location: string;
  website: string;
  interests: string[];
  preferredRoles: string[];
  availabilityHours: number;
  lookingForSkills: string[];
  projects: { _id?: string; title: string; description: string; url: string; tech: string[] }[];
  achievements: { _id?: string; title: string; description: string; date: string }[];
  avatarUrl: string | null;
  completeness: number;
  institutionVerified: boolean;
  emailVerified: boolean;
  email: string | null;
  memberSince: string;
  lastSeenAt: string | null;
  skills: { id: string; skill: string; source: 'manual' | 'github' | 'both'; status: string; proficiency: string }[];
  github: { login: string; profileUrl: string; avatarUrl: string; linkMethod: 'oauth' | 'username'; publicRepos: number; followers: number; lastSyncedAt: string | null } | null;
  featuredRepos: Repo[];
  topRepos: Repo[];
  repoCount: number;
  teams: { id: string; title: string; eventName: string; status: string; role?: string }[];
  connection: 'self' | 'connected' | 'pending_out' | 'pending_in' | 'none';
  requestId: string | null;
  blocked: boolean;
  blockedByMe: boolean;
}

export interface PersonCard {
  id: string;
  name: string;
  headline: string;
  college: string;
  branch: string;
  year: number;
  avatarUrl: string | null;
  skills: string[];
  interests: string[];
  roles: string[];
  availabilityHours: number;
  institutionVerified?: boolean;
  match?: MatchResult;
  repoCount?: number;
  topRepos?: { name: string; stars: number; language: string | null; featured: boolean }[];
  connection?: string;
}

export interface OpenRole {
  role: string;
  slots: number;
  filled: number;
  remaining: number;
}

export interface Opportunity {
  id: string;
  title: string;
  description: string;
  eventName: string;
  type: 'hackathon' | 'project' | 'research' | 'competition';
  domains: string[];
  deadline: string;
  teamSize: number;
  commitmentHours: number;
  requiredSkills: string[];
  openRoles: OpenRole[];
  location: string;
  memberCount: number;
  spotsLeft: number;
  status: 'pending_approval' | 'open' | 'rejected' | 'closed' | 'expired' | 'removed';
  createdAt: string;
  approvedAt: string | null;
  leaderId: string;
  leader?: { id: string; name: string; college: string; avatarUrl: string | null; institutionVerified: boolean } | null;
  isLeader?: boolean;
  isMember?: boolean;
  match?: MatchResult | null;
  myApplicationStatus?: string | null;
  pendingApplications?: number;
  rejectionReason?: string;
  myRole?: string | null;
}

export interface TeamMemberDto {
  userId: string;
  name: string;
  headline: string;
  college: string;
  avatarUrl: string | null;
  role: string;
  isLeader: boolean;
  skills: string[];
  institutionVerified: boolean;
  joinedAt: string;
}

export interface OpportunityDetail extends Opportunity {
  members: TeamMemberDto[];
  canApply: boolean;
  myApplication: { id: string; status: string; role: string; message: string; createdAt: string } | null;
  myInvitation: { id: string; role: string; message: string } | null;
  conversationId: string | null;
  names: Record<string, string>;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  readAt: string | null;
  createdAt: string;
}

export interface ConversationDto {
  id: string;
  type: 'direct' | 'team';
  title: string;
  opportunityId: string | null;
  participants: { id: string; name: string; avatarUrl: string | null; headline?: string }[];
  lastMessageAt: string;
  lastMessagePreview: string;
  unread: number;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  removed: boolean;
  readBy: string[];
  createdAt: string;
}
