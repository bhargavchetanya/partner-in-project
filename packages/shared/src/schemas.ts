/** Validation schemas shared by the API (authoritative) and the web app (instant feedback). */
import { z } from 'zod';
import { PROFICIENCY_LEVELS } from './catalog';

const trimmed = (max: number) => z.string().trim().max(max);

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

export const registerSchema = z.object({
  name: trimmed(80).min(2, 'Name is required'),
  email: emailSchema,
  password: passwordSchema,
  college: trimmed(120).min(2, 'College is required'),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});

export const otpSchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: passwordSchema,
});

const urlOrEmpty = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Must be a link starting with http:// or https://')
  .optional()
  .default('');

export const profileProjectSchema = z.object({
  title: trimmed(100).min(1, 'Title is required'),
  description: trimmed(600).optional().default(''),
  url: urlOrEmpty,
  tech: z.array(trimmed(40)).max(15).optional().default([]),
});

export const achievementSchema = z.object({
  title: trimmed(120).min(1, 'Title is required'),
  description: trimmed(400).optional().default(''),
  date: z.string().trim().max(40).optional().default(''),
});

export const profileSchema = z.object({
  name: trimmed(80).min(2, 'Name is required'),
  college: trimmed(120).min(2, 'College is required'),
  branch: trimmed(80).min(1, 'Branch is required'),
  year: z.coerce.number().int().min(1, 'Choose your academic year').max(6),
  bio: trimmed(500).optional().default(''),
  headline: trimmed(100).optional().default(''),
  interests: z.array(z.string().max(60)).max(20).default([]),
  preferredRoles: z.array(z.string().max(60)).max(6).default([]),
  availabilityHours: z.coerce.number().int().min(0).max(60),
  lookingForSkills: z.array(z.string().max(60)).max(20).default([]),
  location: trimmed(80).optional().default(''),
  website: urlOrEmpty,
  projects: z.array(profileProjectSchema).max(20).default([]),
  achievements: z.array(achievementSchema).max(30).default([]),
});

export const skillAddSchema = z.object({
  name: trimmed(60).min(1, 'Skill name is required'),
  proficiency: z.enum(PROFICIENCY_LEVELS).default('intermediate'),
});

export const skillUpdateSchema = z.object({
  proficiency: z.enum(PROFICIENCY_LEVELS).optional(),
  status: z.enum(['confirmed', 'rejected', 'suggested']).optional(),
});

export const openRoleSchema = z.object({
  role: z.string().min(1).max(60),
  slots: z.coerce.number().int().min(1).max(10),
});

export const opportunityBaseSchema = z.object({
  title: trimmed(120).min(4, 'Title is required (min 4 characters)'),
  description: trimmed(4000).min(20, 'Describe the project idea (min 20 characters)'),
  eventName: trimmed(120).min(2, 'Event or hackathon name is required'),
  type: z.enum(['hackathon', 'project', 'research', 'competition']).default('hackathon'),
  domains: z.array(z.string().max(60)).min(1, 'Choose at least one domain').max(6),
  deadline: z.coerce.date({ invalid_type_error: 'Deadline is required' }),
  teamSize: z.coerce.number().int().min(2, 'Team size must be at least 2').max(12),
  commitmentHours: z.coerce.number().int().min(1).max(60).default(8),
  requiredSkills: z.array(z.string().max(60)).min(1, 'Add at least one required skill').max(25),
  openRoles: z.array(openRoleSchema).min(1, 'Add at least one open role').max(10),
  location: trimmed(80).optional().default('Remote'),
});

export const opportunitySchema = opportunityBaseSchema.superRefine((v, ctx) => {
  const slots = v.openRoles.reduce((s, r) => s + r.slots, 0);
  if (slots > v.teamSize - 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['openRoles'],
      message: `Open positions (${slots}) can't exceed team size minus you (${v.teamSize - 1})`,
    });
  }
});

export const applySchema = z.object({
  role: z.string().min(1, 'Choose a role').max(60),
  message: trimmed(1000).optional().default(''),
});

export const reportSchema = z.object({
  targetType: z.enum(['user', 'opportunity', 'message']),
  targetId: z.string().min(1).max(64),
  reason: z.enum(['spam', 'harassment', 'inappropriate', 'fake_profile', 'misleading', 'other']),
  details: trimmed(1000).optional().default(''),
});

export const messageSchema = z.object({
  body: trimmed(2000).min(1, 'Message cannot be empty'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type OpportunityInput = z.infer<typeof opportunitySchema>;
