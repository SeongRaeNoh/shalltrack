// Bundle the backend and each UI Kit entry with esbuild to prove that every import resolves.
// Forge builds its own bundle at deploy time; this check runs without a login.
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, 'build', 'bundle-check');
const entries = [
  { in: 'src/index.ts', platform: 'node', format: 'cjs' },
  { in: 'src/frontend/bidDesk.tsx', platform: 'browser', format: 'esm' },
  { in: 'src/frontend/contentAction.tsx', platform: 'browser', format: 'esm' },
  { in: 'src/frontend/issuePanel.tsx', platform: 'browser', format: 'esm' },
];
const results = [];
for (const e of entries) {
  const r = await build({ entryPoints: [path.join(root, e.in)], bundle: true, platform: e.platform, format: e.format, target: 'es2022', outdir: path.join(outdir, e.platform), jsx: 'automatic', metafile: true, logLevel: 'error', minify: true });
  const bytes = Object.values(r.metafile.outputs).reduce((a, o) => a + o.bytes, 0);
  results.push({ entry: e.in, platform: e.platform, kb: Math.round(bytes / 1024), errors: r.errors.length, warnings: r.warnings.length });
}
console.log(JSON.stringify(results, null, 2));
