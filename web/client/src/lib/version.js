/* global __APP_VERSION__ */
/** The app version, from web/client/package.json (set at build time). */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
