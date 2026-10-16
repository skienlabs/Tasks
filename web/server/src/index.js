import { buildApp } from './app.js';
import { createDevVerifier, createEmulatorVerifier, createVerifier } from './auth.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';

const config = loadConfig();
const db = openDb(config.dbPath);

let verify;
if (config.devAuth) {
  console.warn('[auth] AUTH_MODE=dev: every request is signed in as dev@localhost. Never use this in production.');
  verify = createDevVerifier();
} else if (config.authEmulator && config.firebase) {
  console.warn(`[auth] Using the Firebase Auth emulator at ${config.authEmulator} (tokens unsigned). Development only.`);
  verify = createEmulatorVerifier({ projectId: config.firebase.projectId, allowList: config.allowList });
} else {
  verify = createVerifier({ projectId: config.firebase?.projectId, allowList: config.allowList });
}

const app = buildApp({
  db,
  verify,
  config,
  logger: { level: process.env.LOG_LEVEL || 'info' },
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  app.log.info(`${signal} received, shutting down`);
  const timer = setTimeout(() => process.exit(1), 10000);
  try {
    await app.close();
    db.close();
  } finally {
    clearTimeout(timer);
    process.exit(0);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    `Tasks ready on :${config.port} | db=${config.dbPath} | sign-in=${config.devAuth ? 'dev' : config.firebase ? `firebase:${config.firebase.projectId}` : 'NOT CONFIGURED'}` +
      (config.allowList.length ? ` | allowed=${config.allowList.join(',')}` : ''),
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
