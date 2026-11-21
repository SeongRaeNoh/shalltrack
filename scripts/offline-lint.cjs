// Run the client-side linters of the Forge CLI without logging in. Server-side linters are skipped.
// Usage: FORGE_CLI_DIR=<path to @forge/cli> node scripts/offline-lint.cjs
const path = require('path');
const fs = require('fs');
const cli = process.env.FORGE_CLI_DIR;
if (!cli) { console.error('Set FORGE_CLI_DIR'); process.exit(2); }
const req = (m) => require(path.join(cli, 'node_modules', m));
const { lint, problemCount } = req('@forge/lint');
const YAML = req('yaml');
const root = path.join(__dirname, '..');
process.chdir(root);
const manifest = YAML.parse(fs.readFileSync('manifest.yml', 'utf8'));
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : /\.(ts|tsx|js|jsx)$/.test(d.name) ? [p] : [];
  });
}
const files = walk('src');
const logs = [];
const logger = new Proxy({}, { get: (_, k) => (...args) => logs.push(String(k) + ': ' + args.map(String).join(' ')) });
// feature-flag service stub: gates off, list-valued settings empty
const statsig = new Proxy({}, { get: (_, k) => async () => (/^get/.test(String(k)) ? [] : false) });
lint(files, manifest, 'development', logger, statsig, { linter: { mode: process.env.LINT_MODE || 'client-side' } })
  .then((results) => {
    const out = results.map((r) => ({ file: r.file, errors: (r.errors || []).map((e) => e.message + (e.line ? ' (line ' + e.line + ')' : '')), warnings: (r.warnings || []).map((w) => w.message + (w.line ? ' (line ' + w.line + ')' : '')) })).filter((r) => r.errors.length || r.warnings.length);
    console.log(JSON.stringify({ filesLinted: files.length, problems: problemCount(results), results: out, log: logs.slice(0, 20) }, null, 2));
    process.exit(problemCount(results).errors ? 1 : 0);
  })
  .catch((e) => { console.error('lint failed:', e && e.stack || e); process.exit(3); });
