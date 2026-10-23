import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * Fills the service worker's list of build files (and a build id), so it can save the
 * whole app for offline use when it installs. See public/sw.js.
 */
function precacheServiceWorker() {
  return {
    name: 'precache-service-worker',
    apply: 'build',
    writeBundle(options, bundle) {
      const dir = options.dir;
      const files = Object.keys(bundle).filter((f) => f.startsWith('assets/')).sort().map((f) => `/${f}`);
      const build = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      const sw = path.join(dir, 'sw.js');
      const src = readFileSync(sw, 'utf8');
      const out = src
        .replace("const BUILD = 'dev';", `const BUILD = '${build}';`)
        .replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(files)};`);
      if (out === src) throw new Error('sw.js placeholders not found');
      writeFileSync(sw, out);
    },
  };
}

export default defineConfig({
  plugins: [react(), precacheServiceWorker()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
});
