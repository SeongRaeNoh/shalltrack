// Proposal outline skeleton that follows the submission instructions and the evaluation factor weights.
import { Factor, Limit, Requirement, STRENGTH_RANK } from './types';
import { contentTerms, DOMAIN_STOPWORDS } from './text';

export interface OutlineSection {
  heading: string;
  sectionRef: string;
  pageLimit?: number;
  pageBudget?: number;
  factor?: { name: string; weight?: number };
  requirementIds: string[];
  mandatoryCount: number;
}

export interface Outline {
  sections: OutlineSection[];
  unplaced: string[];
  markdown: string;
}

function overlap(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let i = 0;
  for (const x of A) if (B.has(x)) i++;
  return i / Math.min(A.size, B.size);
}

/**
 * Build an outline from instruction sections (Section L style) in document order.
 * Work requirements are placed under the instruction section whose title shares the most terms.
 */
export function buildOutline(reqs: Requirement[], limits: Limit[], factors: Factor[], opts: { totalPages?: number } = {}): Outline {
  const groups = new Map<string, OutlineSection>();
  const order: string[] = [];
  for (const r of reqs) {
    if (r.type !== 'instruction' && r.type !== 'limit' && r.type !== 'evaluation') continue;
    const key = r.sectionRef || r.sectionTitle;
    if (!groups.has(key)) {
      groups.set(key, { heading: (r.sectionRef ? r.sectionRef + ' ' : '') + r.sectionTitle, sectionRef: r.sectionRef, requirementIds: [], mandatoryCount: 0 });
      order.push(key);
    }
  }
  // drop pure evaluation groups when an instruction group with a similar title exists (e.g. 9.6.1 vs 9.2.2)
  const sections = order.map((k) => groups.get(k)!);
  const unplaced: string[] = [];
  for (const r of reqs) {
    const own = groups.get(r.sectionRef || r.sectionTitle);
    if (own) { own.requirementIds.push(r.id); if (r.strength === 'mandatory') own.mandatoryCount++; continue; }
    const rt = contentTerms(r.sectionTitle + ' ' + r.text, DOMAIN_STOPWORDS);
    let best: OutlineSection | undefined;
    let bestScore = 0.34;
    for (const s of sections) {
      const sc = overlap(contentTerms(s.heading, DOMAIN_STOPWORDS), rt);
      if (sc > bestScore) { bestScore = sc; best = s; }
    }
    if (best && STRENGTH_RANK[r.strength] >= STRENGTH_RANK.expected) { best.requirementIds.push(r.id); if (r.strength === 'mandatory') best.mandatoryCount++; }
    else unplaced.push(r.id);
  }
  for (const s of sections) {
    const lim = limits.filter((l) => l.kind === 'pages' && l.comparator === 'max' && !l.perItem && l.sectionRef && l.sectionRef === s.sectionRef);
    if (lim.length) s.pageLimit = Math.min(...lim.map((l) => l.value));
    const ft = contentTerms(s.heading, DOMAIN_STOPWORDS);
    const f = factors.find((x) => overlap(contentTerms(x.name, DOMAIN_STOPWORDS), ft) >= 0.5);
    if (f) s.factor = { name: 'Factor ' + f.number + ' - ' + f.name, weight: f.weight };
  }
  if (opts.totalPages) {
    const weighted = sections.filter((s) => s.factor?.weight);
    const sum = weighted.reduce((a, s) => a + (s.factor!.weight ?? 0), 0);
    for (const s of weighted) {
      const budget = Math.max(1, Math.round((opts.totalPages * (s.factor!.weight ?? 0)) / (sum || 1)));
      s.pageBudget = s.pageLimit ? Math.min(budget, s.pageLimit) : budget;
    }
  }
  for (const s of sections) if (s.pageBudget === undefined && s.pageLimit !== undefined) s.pageBudget = s.pageLimit;
  const kept = sections.filter((s) => s.requirementIds.length);
  const md: string[] = ['# Proposal outline (generated from the RFP instructions)', ''];
  for (const s of kept) {
    md.push('## ' + s.heading);
    const meta: string[] = [];
    if (s.factor) meta.push(s.factor.name + (s.factor.weight !== undefined ? ' (weight ' + Math.round(s.factor.weight * 100) + '%)' : ''));
    if (s.pageLimit !== undefined) meta.push('page limit ' + s.pageLimit);
    if (s.pageBudget !== undefined) meta.push('page budget ' + s.pageBudget);
    meta.push(s.requirementIds.length + ' items, ' + s.mandatoryCount + ' mandatory');
    md.push('_' + meta.join('; ') + '_', '');
    for (const id of s.requirementIds) md.push('- [ ] ' + id);
    md.push('');
  }
  if (unplaced.length) md.push('## Items not placed in a section', '', ...unplaced.map((id) => '- [ ] ' + id), '');
  return { sections: kept, unplaced, markdown: md.join('\n') };
}
