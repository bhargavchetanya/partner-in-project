import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import mongoose from 'mongoose';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { loadUser } from './lib/auth';
import { errorHandler, notFound } from './lib/http';
import { authRouter } from './routes/auth';
import { profilesRouter } from './routes/profiles';
import { githubRouter } from './routes/github';
import { skillsRouter } from './routes/skills';
import { discoverRouter, catalogRouter } from './routes/discover';
import { opportunitiesRouter } from './routes/opportunities';
import { applicationsRouter, invitationsRouter } from './routes/applications';
import { connectionsRouter, blocksRouter, reportsRouter, conversationsRouter, notificationsRouter } from './routes/social';
import { adminRouter } from './routes/admin';
import { internalRouter } from './routes/internal';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render terminates TLS in front of the app
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'blob:', 'https://avatars.githubusercontent.com', 'https://lh3.googleusercontent.com', 'https://*.googleusercontent.com'],
          'connect-src': ["'self'", 'wss:', 'ws:'],
          'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'upgrade-insecure-requests': config.isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  // HTTPS only in production (QR19)
  if (config.isProd) {
    app.use((req, res, next) => {
      if (req.headers['x-forwarded-proto'] === 'http') return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
      next();
    });
  }

  const api = express.Router();
  api.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: config.isTest ? 100_000 : 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { message: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' } },
    }),
  );
  api.use(loadUser);
  api.use('/auth', authRouter);
  api.use('/profiles', profilesRouter);
  api.use('/github', githubRouter);
  api.use('/skills', skillsRouter);
  api.use('/catalog', catalogRouter);
  api.use('/discover', discoverRouter);
  api.use('/opportunities', opportunitiesRouter);
  api.use('/applications', applicationsRouter);
  api.use('/invitations', invitationsRouter);
  api.use('/connections', connectionsRouter);
  api.use('/blocks', blocksRouter);
  api.use('/reports', reportsRouter);
  api.use('/conversations', conversationsRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/admin', adminRouter);
  api.use('/internal', internalRouter);
  api.get('/health', (_req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'degraded', db: up ? 'up' : 'down', time: new Date().toISOString() });
  });
  api.use(() => {
    throw notFound('API route not found');
  });
  app.use('/api', api);

  // Production: serve the built React app from the same origin
  const webDist = config.webDist || path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    app.use('/assets', express.static(path.join(webDist, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/|\/socket\.io\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
