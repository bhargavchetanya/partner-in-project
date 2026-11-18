import http from 'node:http';
import { config, assertProductionConfig } from './config';
import { connectDb } from './db';
import { createApp } from './app';
import { initRealtime } from './lib/realtime';

async function main() {
  assertProductionConfig();
  await connectDb();
  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);
  server.listen(config.port, () => {
    console.log(`[api] Partner in Project listening on :${config.port} (${config.nodeEnv})`);
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error('[api] failed to start:', e instanceof Error ? e.message : e);
  process.exit(1);
});
