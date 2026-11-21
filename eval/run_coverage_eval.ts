// Coverage scorer check on an author-written response draft. Usage: node build/eval/run_coverage_eval.js [fixturesDir]
import * as fs from 'fs';
import * as path from 'path';
import { checkCoverage, extractRequirements, markdownToBlocks } from '../src/core';
const dir = process.argv[2] ?? path.join(__dirname, '..', '..', 'test', 'fixtures');
const gold = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'eval', 'coverage_gold.json'), 'utf8')) as { covered: string[]; missing: string[] };
const rfp = extractRequirements([{ id: 'hs', title: 'Head Start RFQ', blocks: markdownToBlocks(fs.readFileSync(path.join(dir, 'headstart_rfq.md'), 'utf8')) }]);
const draft = { id: 'draft', title: 'Response draft', blocks: markdownToBlocks(fs.readFileSync(path.join(dir, 'headstart_response_draft.md'), 'utf8')) };
const report = checkCoverage(rfp.requirements, [draft], rfp.limits);
const byId = new Map(report.items.map((i) => [i.requirementId, i] as const));
const rows: string[] = [];
const conf: Record<string, number> = {};
let unmatched = 0;
for (const [label, prefixes] of [['covered', gold.covered], ['missing', gold.missing]] as const) {
  for (const p of prefixes) {
    const r = rfp.requirements.find((x) => x.text.startsWith(p));
    if (!r) { unmatched++; rows.push('NO MATCH ' + p); continue; }
    const it = byId.get(r.id);
    const pred = it ? it.status : 'n/a';
    conf[label + '->' + pred] = (conf[label + '->' + pred] ?? 0) + 1;
    rows.push(label.padEnd(8) + ' pred ' + pred.padEnd(8) + ' ' + (it ? it.score.toFixed(2) : '-') + ' ' + r.id + ' ' + r.text.slice(0, 70));
  }
}
const found = (conf['covered->covered'] ?? 0) + (conf['covered->partial'] ?? 0);
const missOk = conf['missing->missing'] ?? 0;
console.log(JSON.stringify({ goldCovered: gold.covered.length, goldMissing: gold.missing.length, unmatched, confusion: conf, coveredFoundAsCoveredOrPartial: found, missingFlaggedMissing: missOk, summary: report.summary, limitChecks: report.limitChecks.filter((l) => l.status !== 'unmapped').map((l) => l.scopeTitle + ': ' + l.status + ' ' + l.note) }));
if (process.argv.includes('--rows')) for (const r of rows) console.log('  ' + r);
