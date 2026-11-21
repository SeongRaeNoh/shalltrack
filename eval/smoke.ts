import * as fs from 'fs';
import * as path from 'path';
import { extractRequirements, markdownToBlocks } from '../src/core';
const dataDir = process.argv[2];
for (const name of ['tdrs_rfq', 'headstart_rfq', 'payroll_rfq']) {
  const md = fs.readFileSync(path.join(dataDir, name + '.md'), 'utf8');
  const res = extractRequirements([{ id: name, title: name, blocks: markdownToBlocks(md) }]);
  console.log('===', name, JSON.stringify(res.stats));
  console.log('factors', JSON.stringify(res.factors.factors.map((f) => [f.number, f.name, f.weight, f.weightSource])), 'notes', res.factors.importanceNotes.length);
  console.log('limits', res.limits.length, res.limits.slice(0, 8).map((l) => l.kind + ' ' + l.comparator + ' ' + l.value + ' @' + l.sectionRef + ' ' + l.scopeTitle.slice(0, 40) + (l.perItem ? ' per ' + l.perItem : '')).join(' ; '));
  console.log('deadlines', res.deadlines.length, res.deadlines.slice(0, 4).map((d) => (d.isoDate || d.dateText || '-') + ' ' + d.text.slice(0, 80)).join(' ; '));
  const show = process.argv[3] === name ? 400 : 0;
  for (const r of res.requirements.slice(0, show)) console.log(r.id.padEnd(14), r.type.slice(0, 5), r.strength.slice(0, 5), (r.modal || '-').padEnd(9), r.actor.slice(0, 3), r.text.slice(0, 120));
}
