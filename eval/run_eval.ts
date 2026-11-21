// Extraction precision/recall against hand-labelled gold sets. Usage: node build/eval/run_eval.js <dataDir> [dev|test|all] [--errors]
import * as fs from 'fs';
import * as path from 'path';
import { markdownToBlocks, scanDocument, Strength } from '../src/core';

const LETTER: Record<Strength, string> = { mandatory: 'M', expected: 'E', recommended: 'R', optional: 'O', informational: 'V' };
interface Gold { key: string; label: string; prefix: string }

export function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - h) / d), Math.min(1, (c + h) / d)];
}
const pct = (x: number) => (100 * x).toFixed(1);
const fmt = (k: number, n: number) => { const [lo, hi] = wilson(k, n); return pct(n ? k / n : 0) + '% (' + k + '/' + n + ', 95% CI ' + pct(lo) + '-' + pct(hi) + ')'; };

export function evaluate(dataDir: string, goldFile: string, docFile: string, docId: string, showErrors: boolean) {
  const gold: Gold[] = JSON.parse(fs.readFileSync(goldFile, 'utf8'));
  const md = fs.readFileSync(path.join(dataDir, docFile), 'utf8');
  const blocks = markdownToBlocks(md);
  const scan = scanDocument({ id: docId, title: docId, blocks });
  const pred = new Map<string, { letter: string; text: string; modal: string | null; type: string }>();
  for (const c of scan.candidates) pred.set(docId + '#' + c.blockIndex + '.' + c.sentenceIndex, { letter: LETTER[c.strength], text: c.text, modal: c.modal, type: c.type });
  let tp = 0, fp = 0, fn = 0, strengthOk = 0, mTp = 0, mFp = 0, mFn = 0;
  const errors: string[] = [];
  for (const g of gold) {
    const p = pred.get(g.key);
    const gi = g.label !== 'N';
    if (gi && p) { tp++; if (p.letter === g.label) strengthOk++; else errors.push('STR  gold ' + g.label + ' pred ' + p.letter + ' (' + p.modal + ') ' + g.key + ' ' + g.prefix); }
    else if (gi && !p) { fn++; errors.push('FN   gold ' + g.label + ' ' + g.key + ' ' + g.prefix); }
    else if (!gi && p) { fp++; errors.push('FP   pred ' + p.letter + ' (' + p.modal + ') ' + g.key + ' ' + g.prefix); }
    const gm = g.label === 'M', pm = p?.letter === 'M';
    if (gm && pm) mTp++; else if (gm && !pm) mFn++; else if (!gm && pm) mFp++;
  }
  const out = {
    set: path.basename(goldFile), units: gold.length, goldItems: gold.filter((g) => g.label !== 'N').length,
    precision: fmt(tp, tp + fp), recall: fmt(tp, tp + fn), strengthAgreementOnTP: fmt(strengthOk, tp),
    mandatoryPrecision: fmt(mTp, mTp + mFp), mandatoryRecall: fmt(mTp, mTp + mFn),
    raw: { tp, fp, fn, strengthOk, mTp, mFp, mFn },
  };
  console.log(JSON.stringify(out));
  if (showErrors) for (const e of errors) console.log('  ' + e.slice(0, 150));
  return out;
}

if (require.main === module) {
  const [dataDir, which = 'dev', flag] = process.argv.slice(2);
  const gdir = path.join(__dirname, '..', '..', 'eval', 'gold');
  const sets: Array<[string, string, string, string]> = [];
  if (which === 'dev' || which === 'all') sets.push(['dev', 'dev_tdrs.json', 'tdrs_rfq.md', 'tdrs']);
  if (which === 'test' || which === 'all') sets.push(['test', 'test_headstart.json', 'headstart_rfq.md', 'headstart'], ['test', 'test_payroll.json', 'payroll_rfq.md', 'payroll']);
  for (const [, g, d, id] of sets) evaluate(dataDir, path.join(gdir, g), d, id, flag === '--errors');
}
