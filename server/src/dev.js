// Local development entry point (works on Windows, macOS and Linux).
// Signs every request in as a fake user; this is ignored when NODE_ENV=production.
process.env.NODE_ENV ??= 'development';
process.env.AUTH_MODE ??= 'dev';
process.env.DATA_DIR ??= './.data';
await import('./index.js');
