// Offline manifest validation with the @forge/manifest package that ships inside the Forge CLI.
// Usage: FORGE_CLI_DIR=<path to @forge/cli> node scripts/validate-manifest.cjs
const path = require('path');
const cli = process.env.FORGE_CLI_DIR;
if (!cli) { console.error('Set FORGE_CLI_DIR to the @forge/cli package directory'); process.exit(2); }
const { validate } = require(path.join(cli, 'node_modules/@forge/manifest'));
const manifestPath = path.join(__dirname, '..', 'manifest.yml');
process.chdir(path.join(__dirname, '..'));
validate(false, manifestPath).then((r) => {
  const errors = (r.errors || []).map((e) => (e.level || '') + ' ' + (e.message || JSON.stringify(e)) + (e.line ? ' (line ' + e.line + ')' : ''));
  console.log(JSON.stringify({ success: r.success, errors }, null, 2));
  process.exit(r.success ? 0 : 1);
}).catch((e) => { console.error(e); process.exit(3); });
