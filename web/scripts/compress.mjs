// Pre-compresses build output so the server can send .br/.gz files without
// spending CPU per request.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(import.meta.dirname, '../dist');
const EXT = new Set(['.js', '.css', '.html', '.svg', '.json', '.webmanifest', '.txt']);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let count = 0;
for (const file of walk(root)) {
  if (!EXT.has(path.extname(file))) continue;
  const data = fs.readFileSync(file);
  if (data.length < 1024) continue;
  fs.writeFileSync(`${file}.br`, zlib.brotliCompressSync(data, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length },
  }));
  fs.writeFileSync(`${file}.gz`, zlib.gzipSync(data, { level: 9 }));
  count++;
}
console.log(`compressed ${count} files`);
