// Dump every sentence unit of selected sections so that a person can label it (gold data for extraction).
import * as fs from 'fs';
import { markdownToBlocks, parseHeading, SectionTracker, splitSentences } from '../src/core';
export interface Unit { key: string; section: string; kind: string; text: string }
export function units(docId: string, md: string, sectionPrefixes: string[]): Unit[] {
  const blocks = markdownToBlocks(md);
  const tr = new SectionTracker();
  const out: Unit[] = [];
  for (const b of blocks) {
    if (b.kind === 'heading') { const h = parseHeading(b.text, b.level ?? 2); if (h.title || h.ref) tr.push(h); continue; }
    const info = tr.current();
    const label = info.ref || info.title;
    const inScope = sectionPrefixes.some((p) => p.startsWith('=') ? info.path.join(' / ').includes(p.slice(1)) : (info.ref === p || info.ref.startsWith(p + '.')));
    if (!inScope) continue;
    const sents = b.kind === 'tableRow' ? [b.text] : splitSentences(b.text);
    sents.forEach((s, i) => out.push({ key: docId + '#' + b.index + '.' + i, section: label, kind: b.kind, text: s }));
  }
  return out;
}
if (require.main === module) {
  const [file, docId, ...prefixes] = process.argv.slice(2);
  const u = units(docId, fs.readFileSync(file, 'utf8'), prefixes);
  for (const x of u) console.log(x.key.split('#')[1] + ' [' + x.section + '|' + x.kind[0] + '] ' + x.text.slice(0, 170));
  console.error('units', u.length);
}
