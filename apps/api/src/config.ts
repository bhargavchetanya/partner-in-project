/** Central configuration. Every secret comes from environment variables (never from code). */

function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function list(name: string): string[] {
  return str(name)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const nodeEnv = str('NODE_ENV', 'development');
const isProd = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

const devSecret = 'dev-only-secret-change-me-in-production-please';

export const config = {
  nodeEnv,
  isProd,
  isTest,
  port: Number(str('PORT', '4000')),
  /** Public URL of the web app, e.g. https://partner-in-project.onrender.com */
  appUrl: str('APP_URL', 'http://localhost:5173').replace(/\/$/, ''),
  mongoUri: str('MONGODB_URI', 'mongodb://127.0.0.1:27017/partner-in-project'),
  sessionSecret: str('SESSION_JWT_SECRET', isProd ? '' : devSecret),
  tokenEncryptionKey: str('TOKEN_ENCRYPTION_KEY', isProd ? '' : devSecret),
  cronSecret: str('CRON_SECRET', isProd ? '' : 'dev-cron-secret'),
  sessionHours: 24, // QR24
  adminEmails: list('ADMIN_EMAILS'),
  google: {
    clientId: str('GOOGLE_CLIENT_ID'),
    clientSecret: str('GOOGLE_CLIENT_SECRET'),
  },
  github: {
    clientId: str('GITHUB_CLIENT_ID'),
    clientSecret: str('GITHUB_CLIENT_SECRET'),
    serverToken: str('GITHUB_SERVER_TOKEN'),
  },
  email: {
    brevoApiKey: str('BREVO_API_KEY'),
    from: str('EMAIL_FROM'),
    fromName: str('EMAIL_FROM_NAME', 'Partner in Project'),
  },
  /** Serve the built React app from this folder (production single-service deploy). */
  webDist: str('WEB_DIST', ''),
  /** In development, OTP codes are also returned in API responses when email is not configured. */
  exposeDevCodes: !isProd && str('EXPOSE_DEV_CODES', 'true') === 'true',
};

export function assertProductionConfig(): void {
  if (!config.isProd) return;
  const missing: string[] = [];
  if (!process.env.MONGODB_URI) missing.push('MONGODB_URI');
  if (!config.sessionSecret || config.sessionSecret.length < 32) missing.push('SESSION_JWT_SECRET (32+ chars)');
  if (!config.tokenEncryptionKey || config.tokenEncryptionKey.length < 32) missing.push('TOKEN_ENCRYPTION_KEY (32+ chars)');
  if (!config.cronSecret || config.cronSecret.length < 16) missing.push('CRON_SECRET (16+ chars)');
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }
}

export const features = {
  get google() {
    return Boolean(config.google.clientId && config.google.clientSecret);
  },
  get githubOAuth() {
    return Boolean(config.github.clientId && config.github.clientSecret);
  },
  get email() {
    return Boolean(config.email.brevoApiKey && config.email.from);
  },
};
