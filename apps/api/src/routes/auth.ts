import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import {
  registerSchema, loginSchema, otpSchema, emailSchema, resetPasswordSchema, changePasswordSchema, isInstitutionalEmail,
} from '@pip/shared';
import { z } from 'zod';
import { config, features } from '../config';
import { User, Profile, EmailToken, OAuthState, Session, type UserDoc } from '../models';
import { parse, badRequest, unauthorized, conflict, AppError } from '../lib/http';
import { startSession, endSession, requireAuth, me } from '../lib/auth';
import { sha256, sixDigitCode, randomToken, pkceChallenge } from '../lib/crypto';
import { sendEmail } from '../lib/email';
import { getCatalog } from '../lib/catalog';
import { avatarUrl, refreshProfileDerived } from '../lib/people';

export const authRouter = Router();

const MAX_FAILED = 5; // QR22
const LOCK_MINUTES = 15; // QR22
const OTP_MINUTES = 10;
const RESET_MINUTES = 15; // FR4

let _dummy = '';
const dummyHash = () => (_dummy ||= bcrypt.hashSync('not-a-real-password', 12));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 10_000 : 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Please wait a few minutes and try again.', code: 'RATE_LIMITED' } },
});

async function applyInstitutionBadge(user: UserDoc) {
  const c = await getCatalog();
  user.institutionVerified = user.emailVerified && isInstitutionalEmail(user.email, c.domains);
}

function applyAdminBootstrap(user: UserDoc) {
  if (config.adminEmails.includes(user.email)) user.role = 'admin';
}

async function issueOtp(user: UserDoc): Promise<string> {
  const code = sixDigitCode();
  await EmailToken.deleteMany({ userId: user._id, purpose: 'verify' });
  await EmailToken.create({
    userId: user._id,
    purpose: 'verify',
    codeHash: sha256(`${user._id}:${code}`),
    expiresAt: new Date(Date.now() + OTP_MINUTES * 60 * 1000),
  });
  await sendEmail({
    to: user.email,
    toName: user.name,
    subject: `${code} is your Partner in Project verification code`,
    heading: 'Verify your email',
    paragraphs: [`Hi ${user.name.split(' ')[0]}, use this code to verify your email address. It expires in ${OTP_MINUTES} minutes.`],
    code,
  });
  return code;
}

export async function sessionPayload(user: UserDoc) {
  const profile = await Profile.findOne({ userId: user._id }).lean();
  return {
    user: {
      id: String(user._id),
      email: user.email,
      name: profile?.name ?? user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      institutionVerified: user.institutionVerified,
      hasPassword: !!user.passwordHash,
      googleLinked: !!user.googleId,
      notificationPrefs: { email: user.notificationPrefs?.email !== false },
      avatarUrl: profile ? avatarUrl(profile) : null,
      profileComplete: !!(profile && profile.college && profile.branch && profile.year),
      completeness: profile?.completeness ?? 0,
      createdAt: (user as unknown as { createdAt: Date }).createdAt,
    },
  };
}

// ---------------------------------------------------------------- FR1 register
authRouter.post('/register', authLimiter, async (req, res) => {
  const input = parse(registerSchema, req.body);
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    // QR23: ask to log in or use another email
    throw conflict('This email is already registered. Log in instead, or use a different email address.', 'EMAIL_TAKEN');
  }
  const user = new User({
    email: input.email,
    name: input.name,
    passwordHash: await bcrypt.hash(input.password, 12), // QR20
  });
  applyAdminBootstrap(user);
  await user.save();
  await Profile.create({ userId: user._id, name: input.name, college: input.college });
  await refreshProfileDerived(user._id);
  const code = await issueOtp(user);
  await startSession(req, res, user);
  res.status(201).json({
    ...(await sessionPayload(user)),
    verificationSent: true,
    ...(config.exposeDevCodes && !features.email ? { devCode: code } : {}),
  });
});

// ---------------------------------------------------------------- FR2 verify email
authRouter.post('/verify-email', authLimiter, async (req, res) => {
  const { email, code } = parse(otpSchema, req.body);
  const user = await User.findOne({ email });
  if (!user) throw badRequest('That code is not valid', 'INVALID_CODE');
  if (user.emailVerified) {
    res.json({ ...(await sessionPayload(user)), alreadyVerified: true });
    return;
  }
  const token = await EmailToken.findOne({ userId: user._id, purpose: 'verify' });
  if (!token || token.expiresAt < new Date()) throw badRequest('This code has expired. Request a new one.', 'CODE_EXPIRED');
  if (token.attempts >= 5) throw badRequest('Too many wrong codes. Request a new one.', 'TOO_MANY_ATTEMPTS');
  if (token.codeHash !== sha256(`${user._id}:${code}`)) {
    token.attempts += 1;
    await token.save();
    throw badRequest('That code is not correct', 'INVALID_CODE');
  }
  await token.deleteOne();
  user.emailVerified = true;
  await applyInstitutionBadge(user);
  await user.save();
  if (!req.user || String(req.user._id) !== String(user._id)) await startSession(req, res, user);
  res.json(await sessionPayload(user));
});

authRouter.post('/resend-otp', authLimiter, async (req, res) => {
  const email = parse(z.object({ email: emailSchema }), req.body).email;
  const user = await User.findOne({ email });
  let devCode: string | undefined;
  if (user && !user.emailVerified) {
    const last = await EmailToken.findOne({ userId: user._id, purpose: 'verify' }).sort({ createdAt: -1 });
    if (last && Date.now() - (last as unknown as { createdAt: Date }).createdAt.getTime() < 45_000) {
      throw new AppError(429, 'Please wait a few seconds before requesting another code', 'TOO_SOON');
    }
    devCode = await issueOtp(user);
  }
  // Same response whether or not the account exists (no account enumeration).
  res.json({ ok: true, ...(config.exposeDevCodes && !features.email && devCode ? { devCode } : {}) });
});

// ---------------------------------------------------------------- FR3 login / logout
authRouter.post('/login', authLimiter, async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const user = await User.findOne({ email });
  const fail = () => unauthorized('Incorrect email or password', 'INVALID_CREDENTIALS'); // QR21
  if (!user) {
    await bcrypt.compare(password, dummyHash()); // equalise timing for unknown emails
    throw fail();
  }
  if (user.lockUntil && user.lockUntil > new Date()) {
    const mins = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
    throw new AppError(423, `Too many failed attempts. This account is locked for ${mins} more minute${mins === 1 ? '' : 's'}.`, 'ACCOUNT_LOCKED');
  }
  if (!user.passwordHash) {
    throw unauthorized('This account uses Google sign-in. Continue with Google, or set a password via "Forgot password".', 'USE_GOOGLE');
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    user.failedLogins += 1;
    if (user.failedLogins >= MAX_FAILED) {
      user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      user.failedLogins = 0;
      await user.save();
      throw new AppError(423, `Too many failed attempts. This account is locked for ${LOCK_MINUTES} minutes.`, 'ACCOUNT_LOCKED');
    }
    await user.save();
    throw fail();
  }
  if (user.status === 'banned') throw new AppError(403, 'This account has been banned for violating the platform rules.', 'ACCOUNT_BANNED');
  if (user.status === 'deactivated') throw new AppError(403, 'This account has been deactivated by an administrator.', 'ACCOUNT_DEACTIVATED');
  user.failedLogins = 0;
  user.lockUntil = null;
  applyAdminBootstrap(user);
  await startSession(req, res, user);
  res.json(await sessionPayload(user));
});

authRouter.post('/logout', async (req, res) => {
  await endSession(req, res);
  res.json({ ok: true });
});

authRouter.get('/me', async (req, res) => {
  if (!req.user) {
    res.json({ user: null, features: { google: features.google, githubOAuth: features.githubOAuth, email: features.email } });
    return;
  }
  res.json({ ...(await sessionPayload(req.user)), features: { google: features.google, githubOAuth: features.githubOAuth, email: features.email } });
});

// ---------------------------------------------------------------- FR4 password reset
authRouter.post('/forgot-password', authLimiter, async (req, res) => {
  const email = parse(z.object({ email: emailSchema }), req.body).email;
  const user = await User.findOne({ email });
  let devLink: string | undefined;
  if (user && user.status === 'active') {
    const token = randomToken(32);
    await EmailToken.deleteMany({ userId: user._id, purpose: 'reset' });
    await EmailToken.create({
      userId: user._id,
      purpose: 'reset',
      codeHash: sha256(token),
      expiresAt: new Date(Date.now() + RESET_MINUTES * 60 * 1000),
    });
    const link = `${config.appUrl}/reset-password?token=${token}`;
    devLink = link;
    await sendEmail({
      to: user.email,
      toName: user.name,
      subject: 'Reset your Partner in Project password',
      heading: 'Reset your password',
      paragraphs: [`We received a request to reset your password. This link expires in ${RESET_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`],
      cta: { label: 'Choose a new password', url: link },
    });
  }
  res.json({ ok: true, ...(config.exposeDevCodes && !features.email && devLink ? { devLink } : {}) });
});

authRouter.post('/reset-password', authLimiter, async (req, res) => {
  const { token, password } = parse(resetPasswordSchema, req.body);
  const row = await EmailToken.findOne({ purpose: 'reset', codeHash: sha256(token) });
  if (!row || row.expiresAt < new Date()) throw badRequest('This reset link is invalid or has expired. Request a new one.', 'RESET_EXPIRED');
  const user = await User.findById(row.userId);
  if (!user) throw badRequest('This reset link is invalid', 'RESET_EXPIRED');
  user.passwordHash = await bcrypt.hash(password, 12);
  user.failedLogins = 0;
  user.lockUntil = null;
  user.emailVerified = true; // they proved inbox ownership
  await applyInstitutionBadge(user);
  await user.save();
  await row.deleteOne();
  await Session.deleteMany({ userId: user._id }); // sign out everywhere
  res.json({ ok: true });
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const user = me(req);
  const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
  if (user.passwordHash) {
    if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw badRequest('Current password is incorrect', 'VALIDATION_ERROR', { currentPassword: 'Current password is incorrect' });
    }
  }
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();
  await Session.deleteMany({ userId: user._id, _id: { $ne: req.sessionId } });
  res.json({ ok: true });
});

authRouter.patch('/preferences', requireAuth, async (req, res) => {
  const user = me(req);
  const input = parse(z.object({ emailNotifications: z.boolean() }), req.body);
  user.notificationPrefs = { email: input.emailNotifications };
  await user.save();
  res.json(await sessionPayload(user));
});

// ---------------------------------------------------------------- Google sign-in (OAuth 2.0 + PKCE)
function safeReturnTo(v: unknown): string {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v.slice(0, 200) : '/dashboard';
}

authRouter.get('/google', async (req, res) => {
  if (!features.google) {
    res.redirect('/login?error=google_not_configured');
    return;
  }
  const state = randomToken(24);
  const verifier = randomToken(48);
  await OAuthState.create({
    state,
    provider: 'google',
    codeVerifier: verifier,
    returnTo: safeReturnTo(req.query.returnTo),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: `${config.appUrl}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

authRouter.get('/google/callback', async (req, res) => {
  const fail = (reason: string) => res.redirect(`/login?error=${encodeURIComponent(reason)}`);
  const { code, state, error } = req.query as Record<string, string | undefined>;
  if (error) return fail('google_cancelled');
  if (!code || !state) return fail('google_failed');
  const st = await OAuthState.findOneAndDelete({ state, provider: 'google' });
  if (!st || st.expiresAt < new Date()) return fail('google_expired');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: `${config.appUrl}/api/auth/google/callback`,
        grant_type: 'authorization_code',
        code_verifier: st.codeVerifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenRes.ok) {
      console.error('[google] token exchange failed', tokenRes.status, await tokenRes.text());
      return fail('google_failed');
    }
    const tokens = (await tokenRes.json()) as { access_token: string };
    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!infoRes.ok) return fail('google_failed');
    const info = (await infoRes.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
    if (!info.email || !info.email_verified) return fail('google_email_unverified');
    const email = info.email.toLowerCase();

    let user = await User.findOne({ googleId: info.sub });
    if (!user) user = await User.findOne({ email });
    if (user) {
      if (!user.googleId) user.googleId = info.sub; // link accounts with the same verified email
      user.emailVerified = true;
    } else {
      user = new User({ email, name: info.name || email.split('@')[0], googleId: info.sub, emailVerified: true });
    }
    if (user.status === 'banned') return fail('account_banned');
    if (user.status === 'deactivated') return fail('account_deactivated');
    applyAdminBootstrap(user);
    await applyInstitutionBadge(user);
    await user.save();
    let profile = await Profile.findOne({ userId: user._id });
    if (!profile) {
      profile = await Profile.create({ userId: user._id, name: user.name, externalAvatarUrl: info.picture ?? '' });
    } else if (!profile.externalAvatarUrl && info.picture) {
      profile.externalAvatarUrl = info.picture;
      await profile.save();
    }
    await refreshProfileDerived(user._id);
    await startSession(req, res, user);
    const complete = profile.college && profile.branch && profile.year;
    res.redirect(complete ? st.returnTo : '/onboarding');
  } catch (e) {
    console.error('[google] callback error', e);
    return fail('google_failed');
  }
});
