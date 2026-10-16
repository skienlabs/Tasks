import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const WEB_KEYS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];

/**
 * Reads the Firebase *web app* config. Accepts either strict JSON or the
 * `const firebaseConfig = { apiKey: "..." }` snippet pasted straight from the
 * Firebase console, so the file can be dropped in as-is.
 */
export function parseFirebaseWebConfig(text) {
  let obj = null;
  try {
    obj = JSON.parse(text);
  } catch {
    obj = {};
    for (const m of text.matchAll(/["']?(\w+)["']?\s*:\s*["']([^"']*)["']/g)) obj[m[1]] = m[2];
  }
  if (!obj || typeof obj !== 'object') throw new Error('Firebase config is not an object');
  if (obj.type === 'service_account') {
    throw new Error(
      'This is a service-account key, not the web app config. In the Firebase console open ' +
        'Project settings > General > Your apps > (Web app) > SDK setup and configuration > Config, ' +
        'and save that object as firebase-config.json.',
    );
  }
  // google-services.json style nesting is not supported on purpose: it is the Android config.
  const cfg = {};
  for (const k of WEB_KEYS) if (typeof obj[k] === 'string' && obj[k]) cfg[k] = obj[k];
  const missing = ['apiKey', 'authDomain', 'projectId'].filter((k) => !cfg[k]);
  if (missing.length) throw new Error(`Firebase config is missing: ${missing.join(', ')}`);
  return cfg;
}

function loadFirebase(env, log) {
  const file = env.FIREBASE_CONFIG_PATH || '/config/firebase-config.json';
  if (fs.existsSync(file)) {
    try {
      return parseFirebaseWebConfig(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      log(`Could not use ${file}: ${err.message}`);
      return null;
    }
  }
  if (env.FIREBASE_API_KEY && env.FIREBASE_PROJECT_ID) {
    return {
      apiKey: env.FIREBASE_API_KEY,
      authDomain: env.FIREBASE_AUTH_DOMAIN || `${env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: env.FIREBASE_PROJECT_ID,
      ...(env.FIREBASE_APP_ID ? { appId: env.FIREBASE_APP_ID } : {}),
    };
  }
  log(`No Firebase config found (looked for ${file} and FIREBASE_API_KEY/FIREBASE_PROJECT_ID).`);
  return null;
}

function parseAllowList(value) {
  return (value || '')
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function loadConfig(env = process.env, log = (m) => console.warn(`[config] ${m}`)) {
  const production = env.NODE_ENV === 'production';
  const dataDir = env.DATA_DIR || '/data';
  // The dev auth bypass is impossible to enable in a production build.
  const devAuth = !production && env.AUTH_MODE === 'dev';
  if (env.AUTH_MODE === 'dev' && production) log('AUTH_MODE=dev ignored because NODE_ENV=production.');

  return {
    production,
    host: env.HOST || '0.0.0.0',
    port: Number(env.PORT || 8080),
    dbPath: env.DB_PATH || path.join(dataDir, 'tasks.db'),
    staticDir: path.resolve(env.STATIC_DIR || path.join(here, '../public')),
    firebase: loadFirebase(env, log),
    allowList: parseAllowList(env.ALLOWED_EMAILS),
    devAuth,
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === 'true' : true,
  };
}
