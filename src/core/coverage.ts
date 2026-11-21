// Coverage check: find, for each requirement, the response paragraph that answers it. Deterministic.
import {
  Block, CoverageItem, CoverageReport, CoverageStatus, Evidence, Limit, LimitCheck, Requirement, SourceDoc,
} from './types';
import { DOMAIN_STOPWORDS, contentTerms, normalizePunct, stem, truncate, words } from './text';
import { splitSentences } from './segment';
import { parseHeading } from './sections';

const SYNONYM_GROUPS: string[][] = [
  ['deliver', 'provide', 'supply', 'furnish'],
  ['staff', 'personnel', 'team', 'employee', 'teammate'],
  ['schedule', 'timeline', 'milestone', 'roadmap'],
  ['security', 'secure', 'fedramp'],
  ['accessibility', 'accessible', '508', 'wcag'],
  ['test', 'testing', 'tested', 'qa'],
  ['usability', 'ux'],
  ['document', 'documentation', 'documented', 'artifact'],
  ['meeting', 'meet', 'ceremony', 'standup', 'stand-up'],
  ['report', 'reporting', 'dashboard'],
  ['train', 'training', 'onboard', 'onboarding'],
  ['agile', 'scrum', 'sprint', 'iteration', 'iterative'],
  ['deploy', 'deployment', 'release'],
  ['code', 'codebase', 'repository', 'repo', 'github'],
  ['user', 'customer', 'stakeholder'],
  ['maintain', 'maintenance', 'sustain'],
  ['resume', 'cv'],
  ['experience', 'experienced'],
  ['key', 'critical'],
];

const CANON = new Map<string, string>();
for (const g of SYNONYM_GROUPS) {
  const head = stem(g[0]);
  for (const w of g) CANON.set(stem(w), head);
}
export function canon(t: string): string {
  return CANON.get(t) ?? t;
}

export function terms(s: string): string[] {
  return contentTerms(s, DOMAIN_STOPWORDS).map(canon);
}

export interface CoverageOptions {
  coveredThreshold?: number;
  partialThreshold?: number;
  wordsPerPage?: number;
  /** limitId -> response target chosen by a user */
  limitMapping?: Record<string, { docId: string; heading?: string }>;
}

interface Para {
  docId: string;
  docTitle: string;
  blockIndex: number;
  headingPath: string[];
  text: string;
  termSet: Set<string>;
  seq: string[];
  context: Set<string>;
}

/** Split response documents into scored units (paragraphs, list items, table rows) with heading context. */
export function responseParagraphs(docs: SourceDoc[]): Para[] {
  const out: Para[] = [];
  for (const d of docs) {
    const stack: Array<{ level: number; text: string }> = [];
    const docParas: Para[] = [];
    for (const b of d.blocks) {
      if (b.kind === 'heading') {
        const level = b.level ?? 2;
        while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
        stack.push({ level, text: b.text });
        continue;
      }
      const seq = terms(b.text);
      if (!seq.length) continue;
      docParas.push({
        docId: d.id, docTitle: d.title, blockIndex: b.index, headingPath: stack.map((h) => h.text), text: b.text,
        termSet: new Set(seq), seq, context: new Set<string>(),
      });
    }
    // context: own headings, page title and neighbouring units under the same heading
    docParas.forEach((p, i) => {
      for (const h of p.headingPath) for (const t of terms(h)) p.context.add(t);
      for (const t of terms(d.title)) p.context.add(t);
      for (const j of [i - 1, i + 1]) {
        const q = docParas[j];
        if (q && q.headingPath.join('/') === p.headingPath.join('/')) for (const t of q.termSet) p.context.add(t);
      }
    });
    out.push(...docParas);
  }
  return out;
}

function bigrams(seq: string[]): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i + 1 < seq.length; i++) s.add(seq[i] + ' ' + seq[i + 1]);
  return s;
}

function refPattern(ref: string): RegExp | null {
  if (!ref || !/[.]/.test(ref) || ref.length < 3) return null;
  return new RegExp('(?:^|[^\\d.])' + ref.replace(/\./g, '\\.') + '(?![\\d]|\\.\\d|-[a-z0-9])', 'i');
}

export function scoreRequirement(r: Requirement, paras: Para[], idf: (t: string) => number): { score: number; evidence: Evidence[]; explicit: boolean } {
  const rTerms = Array.from(new Set(terms(r.text)));
  const leadTerms = r.leadIn ? Array.from(new Set(terms(r.leadIn))).filter((t) => !rTerms.includes(t)) : [];
  if (!rTerms.length) return { score: 0, evidence: [], explicit: false };
  const rBigrams = bigrams(terms(r.text));
  const total = rTerms.reduce((a, t) => a + idf(t), 0);
  const leadTotal = leadTerms.reduce((a, t) => a + idf(t), 0);
  const idRe = new RegExp('\\b' + r.id.replace(/[.~]/g, (c) => '\\' + c) + '\\b', 'i');
  const secRe = refPattern(r.sectionRef);
  const scored: Array<{ p: Para; score: number; matched: string[]; explicit: boolean }> = [];
  for (const p of paras) {
    let got = 0;
    const matched: string[] = [];
    for (const t of rTerms) {
      if (p.termSet.has(t)) { got += idf(t); matched.push(t); }
      else if (p.context.has(t)) got += 0.5 * idf(t);
    }
    let leadGot = 0;
    for (const t of leadTerms) if (p.termSet.has(t) || p.context.has(t)) leadGot += idf(t);
    // the lead-in or antecedent sentence only adds a bonus; it never lowers the score of the item itself
    let score = got / total + (leadTotal ? 0.15 * (leadGot / leadTotal) : 0);
    if (rBigrams.size) {
      const pb = bigrams(p.seq);
      let hit = 0;
      for (const b of rBigrams) if (pb.has(b)) hit++;
      score += 0.15 * (hit / rBigrams.size);
    }
    let explicit = false;
    if (idRe.test(p.text)) { explicit = true; score = Math.max(score, 0.9); }
    else if (secRe && matched.length && (secRe.test(p.text) || p.headingPath.some((h) => secRe.test(h)))) score += 0.2; // section cited: bonus only
    if (matched.length === 0 && !explicit) continue;
    scored.push({ p, score: Math.min(1, score), matched, explicit });
  }
  scored.sort((a, b) => b.score - a.score);
  const evidence: Evidence[] = scored.slice(0, 3).map((x) => ({
    docId: x.p.docId,
    docTitle: x.p.docTitle,
    blockIndex: x.p.blockIndex,
    headingPath: x.p.headingPath,
    excerpt: bestSentence(x.p.text, new Set(x.matched)),
    matchedTerms: x.matched,
    score: round3(x.score),
  }));
  return { score: scored.length ? round3(scored[0].score) : 0, evidence, explicit: scored.length ? scored[0].explicit : false };
}

function bestSentence(text: string, matched: Set<string>): string {
  const sents = splitSentences(text);
  if (sents.length <= 1) return truncate(text, 320);
  let best = sents[0];
  let bestN = -1;
  for (const s of sents) {
    const n = terms(s).filter((t) => matched.has(t)).length;
    if (n > bestN) { best = s; bestN = n; }
  }
  return truncate(best, 320);
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export function coverageStatus(score: number, explicit: boolean, opts: CoverageOptions = {}): CoverageStatus {
  const hi = opts.coveredThreshold ?? 0.55;
  const lo = opts.partialThreshold ?? 0.3;
  if (score >= hi) return 'covered';
  if (score >= lo || explicit) return 'partial';
  return 'missing';
}

/** Which requirement types are checked against the response text. */
export function isCoverable(r: Requirement): boolean {
  return r.type === 'requirement' || r.type === 'instruction' || r.type === 'evaluation';
}

export function checkCoverage(reqs: Requirement[], response: SourceDoc[], limits: Limit[], opts: CoverageOptions = {}): CoverageReport {
  const paras = responseParagraphs(response);
  const df = new Map<string, number>();
  for (const p of paras) for (const t of p.termSet) df.set(t, (df.get(t) ?? 0) + 1);
  const n = Math.max(1, paras.length);
  const maxIdf = Math.log(1 + n);
  const idf = (t: string) => (df.has(t) ? Math.log(1 + n / (1 + df.get(t)!)) + 0.1 : maxIdf + 0.1);
  const items: CoverageItem[] = [];
  for (const r of reqs) {
    if (!isCoverable(r)) continue;
    const s = scoreRequirement(r, paras, idf);
    items.push({ requirementId: r.id, status: coverageStatus(s.score, s.explicit, opts), score: s.score, evidence: s.evidence, explicitReference: s.explicit });
  }
  const limitChecks = checkLimits(limits, response, opts);
  const byId = new Map(reqs.map((r) => [r.id, r] as const));
  const summary = {
    total: items.length,
    covered: items.filter((i) => i.status === 'covered').length,
    partial: items.filter((i) => i.status === 'partial').length,
    missing: items.filter((i) => i.status === 'missing').length,
    mandatoryMissing: items.filter((i) => i.status === 'missing' && byId.get(i.requirementId)?.strength === 'mandatory').length,
    limitBreaches: limitChecks.filter((l) => l.status === 'breach').length,
  };
  return { generatedAt: new Date().toISOString(), items, limitChecks, summary };
}

interface ResponseSection { docId: string; docTitle: string; heading?: string; words: number; terms: Set<string>; text: string }

export function responseSections(docs: SourceDoc[]): ResponseSection[] {
  const out: ResponseSection[] = [];
  for (const d of docs) {
    const docWords = d.blocks.reduce((a, b) => a + words(b.text).length, 0);
    out.push({ docId: d.id, docTitle: d.title, words: docWords, terms: new Set(terms(d.title)), text: d.title });
    const heads: Array<{ idx: number; level: number; block: Block }> = [];
    d.blocks.forEach((b, i) => { if (b.kind === 'heading') heads.push({ idx: i, level: b.level ?? 2, block: b }); });
    heads.forEach((h, k) => {
      let end = d.blocks.length;
      for (let j = k + 1; j < heads.length; j++) if (heads[j].level <= h.level) { end = heads[j].idx; break; }
      const w = d.blocks.slice(h.idx, end).reduce((a, b) => a + words(b.text).length, 0);
      out.push({ docId: d.id, docTitle: d.title, heading: h.block.text, words: w, terms: new Set(terms(h.block.text)), text: h.block.text });
    });
  }
  return out;
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / Math.min(a.size, b.size);
}

export function checkLimits(limits: Limit[], response: SourceDoc[], opts: CoverageOptions = {}): LimitCheck[] {
  const wpp = opts.wordsPerPage ?? 500;
  const sections = responseSections(response);
  const out: LimitCheck[] = [];
  for (const l of limits) {
    if (l.kind === 'font-size') {
      out.push({ limitId: l.id, kind: l.kind, max: l.value, scopeTitle: l.scopeTitle, status: 'not-checkable', note: 'Font size is set when the response is exported to PDF or Word; Confluence pages have no fixed font size.' });
      continue;
    }
    const manual = opts.limitMapping?.[l.id];
    let target: ResponseSection | undefined;
    let mapping: 'manual' | 'auto' = 'auto';
    if (manual) {
      target = sections.find((s) => s.docId === manual.docId && (manual.heading ? s.heading === manual.heading : !s.heading));
      mapping = 'manual';
    } else if (!l.perItem) {
      const scopeTerms = new Set(terms(parseHeading(l.scopeTitle, 2).title));
      const refRe = refPattern(l.sectionRef);
      let best = 0;
      for (const s of sections) {
        let sc = overlap(scopeTerms, s.terms);
        if (refRe && refRe.test(s.text)) sc = Math.max(sc, 1);
        if (sc > best) { best = sc; target = s; }
      }
      if (best < 0.5) target = undefined;
    }
    if (!target) {
      out.push({ limitId: l.id, kind: l.kind, max: l.value, scopeTitle: l.scopeTitle, status: 'unmapped', note: l.perItem ? 'Applies to each ' + l.perItem + '; map it to a response section to check.' : 'No response section matches "' + l.scopeTitle + '".' });
      continue;
    }
    const pages = Math.round((target.words / wpp) * 10) / 10;
    const measured = l.kind === 'pages' ? pages : target.words;
    const breach = l.comparator === 'max' ? measured > l.value : measured < l.value;
    out.push({
      limitId: l.id, kind: l.kind, max: l.value, scopeTitle: l.scopeTitle,
      mappedTo: { docId: target.docId, docTitle: target.docTitle, heading: target.heading, mapping },
      words: target.words, estimatedPages: l.kind === 'pages' ? pages : undefined,
      status: breach ? 'breach' : 'ok',
      note: l.kind === 'pages'
        ? target.words + ' words = about ' + pages + ' pages at ' + wpp + ' words per page (limit ' + (l.comparator === 'max' ? 'max ' : 'min ') + l.value + (l.extra ? ', ' + l.extra : '') + ').'
        : target.words + ' words (limit ' + l.value + ').',
    });
  }
  return out;
}

/** Normalised text for display in prompts and tables. */
export function plain(s: string): string {
  return normalizePunct(s);
}
