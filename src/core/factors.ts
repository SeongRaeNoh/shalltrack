// Evaluation factors (Section M style) and their relative importance.
import { Block, Factor, FactorSet, SectionInfo } from './types';
import { hash36, normalizePunct, normalizeSpace } from './text';
import { splitSentences } from './segment';

const FACTOR_RE = /\b([Ss]ub-?)?[Ff]actor\s+(\d{1,2}|[IVX]{1,4}|[A-H])\b\s*(?:[-:.)]|\u2013|\u2014)?\s*([A-Z][A-Za-z/&,' -]{2,60}?)(?=$|[.:;(]|\s+-\s|\s{2}|\s+(?:is|are|will|shall|consists?)\b)/g;
const IMPORTANCE_RE = /(descending order of importance|in order of (?:decreasing )?importance|(?:significantly |slightly |much )?more important than|(?:approximately |roughly )?equal(?:ly)?(?: in)? (?:importance|important|weight)|less important than|of equal importance|weighted)/i;
const PERCENT_RE = /(\d{1,3})\s*(?:%|percent|points?)/i;

export function extractFactors(sections: Array<{ info: SectionInfo; blocks: Block[] }>): FactorSet {
  const found = new Map<string, Factor>();
  const notes: string[] = [];
  for (const sec of sections) {
    for (const b of sec.blocks) {
      const text = normalizePunct(b.text);
      const candidates = b.kind === 'heading' ? [text] : splitSentences(text);
      for (const s of candidates) {
        if (b.kind !== 'heading' && IMPORTANCE_RE.test(s) && notes.length < 12 && !notes.includes(normalizeSpace(s))) notes.push(normalizeSpace(s));
        const re = new RegExp(FACTOR_RE.source, 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(s))) {
          if (m[1]) continue; // subfactors are not ranked here
          const number = m[2].toUpperCase();
          const name = m[3].replace(/\s+-\s*$/, '').replace(/[\s,-]+$/, '').trim();
          if (!name || /^(and|or|of|the|is|will)$/i.test(name)) continue;
          const key = number;
          const prev = found.get(key);
          // prefer the heading form, then the shortest name
          if (!prev || (b.kind === 'heading' && name.length <= prev.name.length + 20)) {
            const pct = s.slice(m.index, m.index + m[0].length + 40).match(PERCENT_RE);
            found.set(key, {
              id: 'F' + number + '-' + hash36(name.toLowerCase()).slice(0, 4),
              number, name, sectionRef: sec.info.ref,
              weight: pct ? Math.min(100, parseInt(pct[1], 10)) / 100 : prev?.weight,
              weightSource: pct ? 'explicit' : prev?.weightSource ?? 'none',
            });
          }
        }
      }
    }
  }
  const factors = Array.from(found.values()).sort((a, b) => factorOrder(a.number) - factorOrder(b.number));
  applyWeights(factors, notes);
  return { factors, importanceNotes: notes };
}

function factorOrder(n: string): number {
  if (/^\d+$/.test(n)) return parseInt(n, 10);
  const roman: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
  if (roman[n]) return roman[n];
  return n.charCodeAt(0) - 64;
}

/** Derive relative weights: explicit percentages win; else descending order; else equal. */
export function applyWeights(factors: Factor[], notes: string[]): void {
  if (!factors.length) return;
  if (factors.every((f) => f.weightSource === 'explicit' && f.weight !== undefined)) {
    const sum = factors.reduce((a, f) => a + (f.weight ?? 0), 0) || 1;
    factors.forEach((f) => (f.weight = round2((f.weight ?? 0) / sum)));
    return;
  }
  const joined = notes.join(' ').toLowerCase();
  if (/descending order of importance|in order of (?:decreasing )?importance/.test(joined)) {
    const n = factors.length;
    const total = (n * (n + 1)) / 2;
    factors.forEach((f, i) => { f.weight = round2((n - i) / total); f.weightSource = 'order'; });
  } else if (/equal(?:ly)?(?: in)? (?:importance|important|weight)|of equal importance/.test(joined)) {
    factors.forEach((f) => { f.weight = round2(1 / factors.length); f.weightSource = 'equal'; });
  } else {
    factors.forEach((f) => { if (f.weightSource !== 'explicit') { f.weight = undefined; f.weightSource = 'none'; } });
  }
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
