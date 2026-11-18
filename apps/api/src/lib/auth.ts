import type { Request, Response, NextFunction, CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { Session, User, type UserDoc } from '../models';
import { forbidden, unauthorized } from './http';

export const SESSION_COOKIE = 'pip_session';

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserDoc;
    sessionId?: string;
  }
}

interface SessionClaims {
  sid: string;
  uid: string;
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionHours * 3600 * 1000,
  };
}

/** Creates a 24-hour session (QR24) and sets it as an httpOnly cookie. */
export async function startSession(req: Request, res: Response, user: UserDoc): Promise<void> {
  const expiresAt = new Date(Date.now() + config.sessionHours * 3600 * 1000);
  const session = await Session.create({
    userId: user._id,
    expiresAt,
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 200),
  });
  const token = jwt.sign({ sid: String(session._id), uid: String(user._id) } satisfies SessionClaims, config.sessionSecret, {
    expiresIn: `${config.sessionHours}h`,
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  user.lastLoginAt = new Date();
  await user.save();
}

export async function endSession(req: Request, res: Response): Promise<void> {
  if (req.sessionId) await Session.deleteOne({ _id: req.sessionId });
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
}

/** Resolves the user behind a session token (used by HTTP and Socket.IO). */
export async function userFromToken(token: string | undefined): Promise<{ user: UserDoc; sessionId: string } | null> {
  if (!token) return null;
  let claims: SessionClaims;
  try {
    claims = jwt.verify(token, config.sessionSecret) as SessionClaims;
  } catch {
    return null;
  }
  const session = await Session.findById(claims.sid).lean();
  if (!session || session.expiresAt < new Date() || String(session.userId) !== claims.uid) return null;
  const user = await User.findById(claims.uid);
  if (!user || user.status !== 'active') return null;
  return { user, sessionId: claims.sid };
}

/** Attaches req.user when a valid session cookie is present. Never rejects. */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const found = await userFromToken(req.cookies?.[SESSION_COOKIE]);
  if (found) {
    req.user = found.user;
    req.sessionId = found.sessionId;
    const now = Date.now();
    if (!found.user.lastSeenAt || now - found.user.lastSeenAt.getTime() > 5 * 60 * 1000) {
      User.updateOne({ _id: found.user._id }, { lastSeenAt: new Date(now) }).catch(() => undefined);
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw unauthorized();
  next();
}

/** FR2: unverified accounts cannot create team posts or apply to teams. */
export function requireVerified(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw unauthorized();
  if (!req.user.emailVerified) throw forbidden('Please verify your email address first', 'EMAIL_NOT_VERIFIED');
  next();
}

/** FR20 / QR24: only administrators can open admin features. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw unauthorized();
  if (req.user.role !== 'admin') throw forbidden('Administrator access only', 'ADMIN_ONLY');
  next();
}

export function me(req: Request): UserDoc {
  if (!req.user) throw unauthorized();
  return req.user;
}
