// Tests on three real public-domain RFQs (test/fixtures). Guards the measured extraction quality against regressions.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { buildOutline, extractRequirements, markdownToBlocks, storageToBlocks } from '../src/core';
import { markdownToStorage } from '../scripts/md-to-storage';
import { evaluate } from '../eval/run_eval';

const FX = path.join(__dirname, '..', '..', 'test', 'fixtures');
const GOLD = path.join(__dirname, '..', '..', 'eval', 'gold');
const read = (f: string) => fs.readFileSync(path.join(FX, f), 'utf8');

for (const f of ['tdrs_rfq.md', 'headstart_rfq.md', 'payroll_rfq.md']) {
  test('extracts a plausible matrix from ' + f, () => {
    const r = extractRequirements([{ id: f, title: f, blocks: markdownToBlocks(read(f)) }]);
    assert.ok(r.stats.requirements > 150 && r.stats.requirements < 260, 'requirements ' + r.stats.requirements);
    assert.ok(r.stats.byStrength.mandatory > 80);
    assert.ok(r.limits.some((l) => l.kind === 'pages'));
    assert.equal(new Set(r.requirements.map((x) => x.id)).size, r.requirements.length);
  });
  test('Confluence storage round trip keeps the requirement ids of ' + f, () => {
    const md = read(f);
    const a = extractRequirements([{ id: 'x', title: 'x', blocks: markdownToBlocks(md) }]).requirements.map((r) => r.id);
    const b = extractRequirements([{ id: 'x', title: 'x', blocks: storageToBlocks(markdownToStorage(md)) }]).requirements.map((r) => r.id);
    const same = a.filter((id) => b.includes(id)).length;
    assert.ok(same / a.length >= 0.97, 'shared ids ' + same + '/' + a.length);
  });
}

test('outline of the TDRS RFQ keeps only proposal sections, with section-level page limits and factor numbers', () => {
  const r = extractRequirements([{ id: 't', title: 't', blocks: markdownToBlocks(read('tdrs_rfq.md')) }]);
  const o = buildOutline(r.requirements, r.limits, r.factors.factors);
  const heads = o.sections.map((s) => s.heading);
  assert.ok(!heads.some((h) => /Contractor Performance|Invoice|Quality Assurance|Deadlines/.test(h)), heads.join('; '));
  const staffing = o.sections.find((s) => s.heading.startsWith('9.2.3'));
  assert.equal(staffing?.pageLimit, 3);
  assert.equal(o.sections.find((s) => s.heading.startsWith('9.2.2'))?.pageLimit, 5);
  assert.equal(o.sections.find((s) => s.heading.startsWith('9.2.1'))?.factor, undefined);
  assert.match(staffing?.factor?.name ?? '', /^Factor 2/);
});

for (const [g, d, id] of [['test_headstart.json', 'headstart_rfq.md', 'headstart'], ['test_payroll.json', 'payroll_rfq.md', 'payroll'], ['dev_tdrs.json', 'tdrs_rfq.md', 'tdrs']]) {
  test('gold precision and recall stay at or above 0.95 on ' + g, () => {
    const r = evaluate(FX, path.join(GOLD, g), d, id, false);
    const p = r.raw.tp / (r.raw.tp + r.raw.fp), rec = r.raw.tp / (r.raw.tp + r.raw.fn);
    assert.ok(p >= 0.95 && rec >= 0.95, 'P ' + p + ' R ' + rec);
  });
}
