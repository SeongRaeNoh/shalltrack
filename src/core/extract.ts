// Requirement extraction: modal verbs and strength, actor, type, lead-in lists, limits, deadlines.
import {
  Actor, Block, Deadline, ExtractionResult, Limit, ReqType, Requirement, SectionInfo, SourceDoc, SourceRef, Strength,
} from './types';
import { DOMAIN_STOPWORDS, contentTerms, hash36, normalizePunct, normalizeSpace } from './text';
import { splitSentences } from './segment';
import { SectionTracker, parseHeading } from './sections';
import { extractDeadline, extractLimits } from './limits';
import { extractFactors } from './factors';
import { dedupeRequirements } from './dedupe';

export { STRENGTH_RANK } from './types';
import { STRENGTH_RANK } from './types';

interface ModalRule { re: RegExp; strength: Strength; label: string; }

const MODAL_RULES: ModalRule[] = [
  { re: /\b(?:shall|must)\s+not\b|\bcan\s*not\b|\bmay\s+not\b|\b(?:is|are)\s+(?:not\s+permitted|prohibited)\b/i, strength: 'mandatory', label: 'shall not' },
  { re: /\b(?:is|are)\s+(?:cautioned|warned)\s+not\s+to\b/i, strength: 'mandatory', label: 'cautioned not to' },
  { re: /\b(?:government|agency|we)\s+requires?\b/i, strength: 'mandatory', label: 'requires' },
  { re: /\b(?:government|agency|we)\s+expects?\b/i, strength: 'expected', label: 'expects' },
  { re: /\b(?:will\s+be|is|are)\s+able\s+to\b/i, strength: 'optional', label: 'able to' },
  { re: /\bshall\b/i, strength: 'mandatory', label: 'shall' },
  { re: /\bmust\b/i, strength: 'mandatory', label: 'must' },
  { re: /\b(?:is|are|will\s+be)\s+required\s+to\b|\b(?:is|are)\s+required\b|\brequired\s+to\b|\bmandatory\b/i, strength: 'mandatory', label: 'required' },
  { re: /\b(?:is|are)\s+responsible\s+for\b/i, strength: 'mandatory', label: 'responsible for' },
  { re: /\b(?:is|are)\s+expected\s+to\b/i, strength: 'expected', label: 'expected to' },
  { re: /\bwill\b/i, strength: 'expected', label: 'will' },
  { re: /\bshould\b/i, strength: 'recommended', label: 'should' },
  { re: /\b(?:is|are)\s+(?:strongly\s+)?encouraged\s+to\b|\bencourages?\b|\b(?:is|are)\s+advised\s+to\b/i, strength: 'recommended', label: 'encouraged' },
  { re: /\b(?:is|are)\s+(?:preferable|preferred|desirable|desired)\b/i, strength: 'recommended', label: 'preferred' },
  { re: /\bmay\b/i, strength: 'optional', label: 'may' },
  { re: /\bcan\b(?!\s*not)/i, strength: 'optional', label: 'can' },
];

/** Labels whose subject is fixed by the phrase itself (the government states what it expects of the bidder). */
const BIDDER_BY_PHRASE = new Set(['requires', 'expects', 'cautioned not to']);

export interface ModalHit { label: string; strength: Strength; index: number; }

export function findModals(sentence: string): ModalHit[] {
  const hits: ModalHit[] = [];
  const s = sentence.replace(/["'][a-z]+["']/gi, (x) => ' '.repeat(x.length)); // ignore quoted terms like "shall"
  for (const r of MODAL_RULES) {
    const re = new RegExp(r.re.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      if (r.label === 'may' && /^\s*not\b/i.test(s.slice(m.index + m[0].length))) continue;
      if (r.label === 'will' && /^\s*not\b/i.test(s.slice(m.index + m[0].length))) continue;
      if (hits.some((h) => m!.index >= h.index && m!.index < h.index + 9)) continue;
      // modal inside a relative clause ("personnel that are required to", "individuals who will fill") is not the main obligation
      if (!BIDDER_BY_PHRASE.has(r.label) && /\b(?:that|who|which|whom)\s+(?:are\s+|is\s+)?(?:not\s+)?$/i.test(s.slice(Math.max(0, m.index - 20), m.index))) continue;
      hits.push({ label: r.label, strength: r.strength, index: m.index });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

const BIDDER_RE = /\b(contractors?|offerors?|quoters?|vendors?|bidders?|proposers?|respondents?|suppliers?|awardees?|you|your|quotes?|quotations?|proposals?|responses?|submissions?|resumes?|letters?|key\s+personnel|personnel|staff|teams?|candidates?|individuals?|products?|system|solution|software|application|code(?:base)?|deliverables?|documentation|plans?|narrative|volume|pages?|sections?|(?:the|each)\s+(?:facilitator|lead|engineer|designer|researcher|manager)s?)\b/gi;
const GOV_RE = /\b(government|govt|agency|ohs|acf|gsa|hhs|tts|18f|contracting\s+officer|cor|co|cos|we|us|our|evaluators?|evaluation\s+(?:team|panel|board|committee)|tep|source\s+selection|program\s+office|ordering\s+activit(?:y|ies))\b/gi;

/** Who the modal binds: the last bidder or government term before the modal. */
export function findActor(sentence: string, modalIndex: number): Actor {
  const windowStart = Math.max(0, modalIndex - 90);
  const before = sentence.slice(windowStart, modalIndex);
  let best: { pos: number; actor: Actor } = { pos: -1, actor: 'unknown' };
  for (const [re, actor] of [[BIDDER_RE, 'bidder'], [GOV_RE, 'government']] as Array<[RegExp, Actor]>) {
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = r.exec(before))) {
      if (actor === 'government' && /^(co|cos|us)$/i.test(m[1]) && m[1] !== m[1].toUpperCase() && !/^us$/.test(m[1])) continue;
      const end = m.index + m[0].length;
      if (end >= best.pos) best = { pos: end, actor };
    }
  }
  // an agency acronym directly before the modal ("OFA will", "OHS may") is the government
  const acr = before.match(/\b([A-Z]{2,5})\s*$/);
  if (acr && !NON_AGENCY_ACRONYMS.has(acr[1])) return 'government';
  return best.actor;
}

const NON_AGENCY_ACRONYMS = new Set(['API', 'APIS', 'CSV', 'PDF', 'SSO', 'MFA', 'PII', 'PIV', 'EIT', 'UI', 'UX', 'SAAS', 'IT', 'QA', 'FTE', 'COTS', 'SLA', 'URL', 'VPAT', 'ATO']);

const IMPERATIVE_RE = /^(?:please\s+)?(?:do\s+not\s+|don't\s+|never\s+)?(include|provide|describe|submit|explain|identify|demonstrate|list|attach|address|indicate|discuss|detail|outline|propose|present|state|specify|summarize|summarise|furnish|complete|sign|upload|email|send|ensure|note|use|limit|label|number|format|organize|organise|prepare|show|deliver)\b/i;
const EVAL_RE = /\b(evaluat\w*|assess\w*|rated|rating|consider(?:ed|s)?|scor(?:e|ed|ing)|determin\w+ (?:whether|the extent)|judg\w+|review(?:ed)?\s+(?:for|to|based))\b/i;
const EVAL_MAIN_RE = /\b(?:will|shall|may|must)\s+(?:also\s+|only\s+)?(?:be\s+)?(?:evaluat|assess|rated\b|rate\b|consider|review|scor|judg)\w*|\b(?:government|agency|we|evaluators?)\s+(?:evaluat|assess|consider)\w*/i;
const POINTER_RE = /\b(?:factors?|criteria)\s+(?:listed|set\s+forth|described|identified|stated)\s+(?:below|above|herein|in\s+(?:section|this))|\bunder\s+the\s+evaluation\s+section\b/i;
const CONSEQUENCE_RE = /\b(non-?responsive|not\s+be\s+considered|no\s+longer\s+be(?:ing)?\s+considered|removed\s+from\s+(?:further\s+)?consideration|deemed\s+(?:unacceptable|nonresponsive|non-responsive|ineligible)|not\s+receive\s+a\s+response|adversely\s+affect|will\s+(?:become|constitute|result\s+in|mean|remain)\b)/i;
const GOV_STANCE_RE = /^(?:the\s+)?(?:government|agency|we|[A-Z]{2,5})\s+(?:does\s+not\s+|do\s+not\s+)?(?:anticipates?|believes?|intends?|plans?|estimates?|understands?|reserves?)\b/i;
const SUBMISSION_RE = /\b(quotes?|quotations?|proposals?|offers?|submissions?|resumes?|letters?\s+of\s+(?:intent|commitment)|page\s+limit\w*|font|oral\s+(?:interview|presentation)s?|written\s+responses?|your\s+response|the\s+response|this\s+section|volume\s+[0-9ivx]+|questions)\b/i;

export interface Candidate {
  text: string;
  leadIn?: string;
  strength: Strength;
  modal: string | null;
  actor: Actor;
  type: ReqType;
  section: SectionInfo;
  blockIndex: number;
  sentenceIndex: number;
}

/**
 * Decide whether a sentence is a compliance item and classify it.
 * inherited: modal of a lead-in sentence ("The contractor shall:") for list items without their own modal.
 */
export function classifySentence(
  sentence: string,
  section: SectionInfo,
  opts: { isListItem?: boolean; inherited?: { strength: Strength; modal: string; actor: Actor }; isTableRow?: boolean } = {},
): Omit<Candidate, 'section' | 'blockIndex' | 'sentenceIndex' | 'text' | 'leadIn'> | null {
  const s = normalizePunct(sentence);
  if (/\?\s*$/.test(s)) return null;
  const modals = findModals(s);
  const hasLimit = extractLimits(s, '', '', DUMMY_REF).length > 0;
  const due = extractDeadline(s, '', DUMMY_REF);
  const evalWords = EVAL_RE.test(s);

  // statements of what will be evaluated
  if (EVAL_MAIN_RE.test(s) && !modals.some((h) => (h.label === 'shall' || h.label === 'must') && findActor(s, h.index) === 'bidder')) {
    if (POINTER_RE.test(s) || /:\s*$/.test(s)) return null;
    return { strength: 'informational', modal: 'evaluated', actor: 'government', type: 'evaluation' };
  }
  // choose the binding modal: strongest modal whose actor is the bidder, else unknown actor, else government
  let chosen: ModalHit | null = null;
  let actor: Actor = 'unknown';
  const ranked = [...modals].sort((a, b) => STRENGTH_RANK[b.strength] - STRENGTH_RANK[a.strength] || a.index - b.index);
  const actors = ranked.map((h) => (BIDDER_BY_PHRASE.has(h.label) ? 'bidder' : findActor(s, h.index)) as Actor);
  // strongest modal not bound to the government; among equal strength the bidder-bound one wins
  let bestI = -1;
  for (let k = 0; k < ranked.length; k++) {
    if (actors[k] === 'government') continue;
    if (bestI < 0) { bestI = k; continue; }
    if (STRENGTH_RANK[ranked[k].strength] < STRENGTH_RANK[ranked[bestI].strength]) break;
    if (actors[k] === 'bidder' && actors[bestI] !== 'bidder') bestI = k;
  }
  if (bestI >= 0) { chosen = ranked[bestI]; actor = actors[bestI]; }
  if (!chosen && ranked.length) { chosen = ranked[0]; actor = 'government'; }
  const weakLabel = (l: string) => l === 'will' || l === 'may' || l === 'can' || l === 'able to';
  if (chosen && CONSEQUENCE_RE.test(s) && weakLabel(chosen.label)) return null;
  // government process: "The government does not anticipate that ...", "Answers will be provided ...", "... will be issued a laptop"
  if (GOV_STANCE_RE.test(s) && !(chosen && (chosen.label === 'shall' || chosen.label === 'must'))) return null;
  if (chosen && weakLabel(chosen.label) && /^\w+(?:\s+\w+)?\s+be\s+[a-z]+(?:ed|en)\s+by\s+(?:the\s+)?(?:[\w-]+\s+){0,3}?(?:government|agency|contracting\s+officer|co|cor)\b/i.test(s.slice(chosen.index))) return null;
  if (chosen && chosen.label === 'will') {
    const after = s.slice(chosen.index);
    if (/^will\s+be\s+(?:issued|granted|notified|furnished|reimbursed|paid|given|sent|posted|announced)\b/i.test(after)) return null;
    if (actor === 'unknown' && /^will\s+be\s+[a-z]+(?:ed|en|wn)\b/i.test(after)) return null;
  }
  if (opts.inherited && chosen && STRENGTH_RANK[opts.inherited.strength] > STRENGTH_RANK[chosen.strength]) {
    return { strength: opts.inherited.strength, modal: opts.inherited.modal, actor: opts.inherited.actor, type: inferType(s, section, opts.inherited.modal, opts.inherited.actor, hasLimit, !!due, evalWords) };
  }

  let strength: Strength | null = null;
  let modal: string | null = null;
  if (chosen) {
    if (actor === 'government') {
      if (!(evalWords && (section.kind === 'evaluation' || /\b(evaluat|assess|rat)\w*/i.test(s)))) {
        return hasLimit || due ? { strength: 'mandatory', modal: null, actor: 'unknown', type: hasLimit ? 'limit' : 'deadline' } : null;
      }
      return { strength: 'informational', modal: chosen.label, actor, type: 'evaluation' };
    }
    if (chosen.label === 'will' || chosen.label === 'may' || chosen.label === 'should' || chosen.label === 'can' || chosen.label === 'able to') {
      if (chosen.label === 'can' && actor === 'unknown' && section.kind !== 'instructions') return null;
      if (actor === 'unknown') {
        if (evalWords && section.kind === 'evaluation') return { strength: 'informational', modal: chosen.label, actor, type: 'evaluation' };
        if (!(section.kind === 'instructions' || section.kind === 'evaluation' || hasLimit || due || SUBMISSION_RE.test(s))) {
          if (chosen.label !== 'should') return null;
        }
      }
    }
    strength = chosen.strength;
    modal = chosen.label;
  } else if (opts.inherited) {
    strength = opts.inherited.strength;
    modal = opts.inherited.modal;
    actor = opts.inherited.actor;
  } else if (IMPERATIVE_RE.test(s) && (section.kind === 'instructions' || section.kind === 'evaluation' || opts.isListItem)) {
    strength = 'mandatory';
    modal = 'imperative';
    actor = 'bidder';
  } else if (hasLimit) {
    strength = 'mandatory';
  } else if (due) {
    strength = 'mandatory';
  } else {
    return null;
  }

  return { strength: strength!, modal, actor, type: inferType(s, section, modal, actor, hasLimit, !!due, evalWords) };
}

function inferType(s: string, section: SectionInfo, modal: string | null, actor: Actor, hasLimit: boolean, due: boolean, evalWords: boolean): ReqType {
  if (hasLimit) return 'limit';
  if (due) return 'deadline';
  if (evalWords && /\b(will\s+be|are|is)\s+(evaluat|assess|rated|consider)/i.test(s)) return 'evaluation';
  if (section.kind === 'instructions') return 'instruction';
  if (section.kind === 'evaluation') return SUBMISSION_RE.test(s) || modal === 'imperative' || actor === 'bidder' ? 'instruction' : 'evaluation';
  return SUBMISSION_RE.test(s) && !/\b(?:deliverables?|reports?)\b/i.test(s) ? 'instruction' : 'requirement';
}

const DUMMY_REF: SourceRef = { docId: '', docTitle: '', blockIndex: 0, sentenceIndex: 0, sectionRef: '', sectionTitle: '', headingPath: [] };

/** Walk one document and return candidate items plus limits and deadlines. */
export function scanDocument(doc: SourceDoc): { candidates: Candidate[]; limits: Limit[]; deadlines: Deadline[]; sentences: number; sections: Array<{ info: SectionInfo; blocks: Block[] }> } {
  const tracker = new SectionTracker();
  const candidates: Candidate[] = [];
  const limits: Limit[] = [];
  const deadlines: Deadline[] = [];
  const sections: Array<{ info: SectionInfo; blocks: Block[] }> = [];
  let sentences = 0;
  let leadIn: { text: string; strength: Strength; modal: string; actor: Actor; depth: number } | null = null;

  for (const b of doc.blocks) {
    if (b.kind === 'heading') {
      const h = parseHeading(b.text, b.level ?? 2);
      if (!h.title && !h.ref) continue;
      tracker.push(h);
      leadIn = null;
      sections.push({ info: tracker.current(), blocks: [b] });
      continue;
    }
    const info = tracker.current();
    if (!sections.length) sections.push({ info, blocks: [] });
    sections[sections.length - 1].blocks.push(b);
    if (b.kind !== 'listItem') {
      // a lead-in only governs the list that directly follows it
      if (leadIn && b.kind !== 'paragraph') leadIn = null;
    }
    const src = (sentenceIndex: number): SourceRef => ({
      docId: doc.id, docTitle: doc.title, blockIndex: b.index, sentenceIndex, sectionRef: info.ref,
      sectionTitle: info.title, headingPath: info.path,
    });
    if (b.kind === 'tableRow') {
      sentences++;
      const cells = b.text.split(' | ');
      const scopeCell = cells.find((c) => /\b(part|volume|phase|tab|section|factor)\b/i.test(c) && !/\b(pages?|words?)\b/i.test(c)) ?? cells[0];
      const lims = extractLimits(b.text, (scopeCell || info.title).slice(0, 140), info.ref, src(0));
      limits.push(...lims);
      const cls = classifySentence(b.text, info, { isTableRow: true });
      if (cls && (lims.length || cls.modal)) {
        candidates.push({ ...cls, text: b.text, section: info, blockIndex: b.index, sentenceIndex: 0 });
      }
      continue;
    }
    const sents = splitSentences(b.text);
    const isList = b.kind === 'listItem';
    if (!isList) leadIn = null; // a paragraph ends the list that the previous lead-in governed
    let usedLeadIn = false;
    sents.forEach((sentence, si) => {
      sentences++;
      const lims = extractLimits(sentence, info.title, info.ref, src(si));
      limits.push(...lims);
      const due = extractDeadline(sentence, info.ref, src(si));
      if (due) deadlines.push(due);
      const inherited = isList && leadIn && si === 0 ? { strength: leadIn.strength, modal: leadIn.modal, actor: leadIn.actor } : undefined;
      const cls = classifySentence(sentence, info, { isListItem: isList, inherited });
      const endsWithColon = /:\s*$/.test(sentence);
      if (endsWithColon && si === sents.length - 1) {
        // possible lead-in for the list that follows
        const lc = cls ?? (IMPERATIVE_RE.test(normalizePunct(sentence)) ? { strength: 'mandatory' as Strength, modal: 'imperative', actor: 'bidder' as Actor, type: 'instruction' as ReqType } : null);
        if (lc && lc.modal && lc.actor !== 'government') {
          const st = inherited && STRENGTH_RANK[inherited.strength] > STRENGTH_RANK[lc.strength] ? inherited : lc;
          leadIn = { text: sentence, strength: st.strength, modal: st.modal ?? lc.modal, actor: st.actor, depth: b.depth ?? 0 };
          return; // the items carry the requirement; the lead-in is kept as context
        }
      }
      if (!cls) return;
      if (inherited) usedLeadIn = true;
      const anaphoric = si > 0 && /^(?:this|these|they|it|such|that|those|he|she|each\s+of\s+them)\b/i.test(sentence.trim());
      candidates.push({
        ...cls, text: sentence, leadIn: isList && leadIn ? leadIn.text : anaphoric ? sents[si - 1] : undefined, section: info, blockIndex: b.index, sentenceIndex: si,
      });
    });
    if (!isList && !(sents.length && /:\s*$/.test(sents[sents.length - 1]))) leadIn = null;
    void usedLeadIn;
  }
  return { candidates, limits, deadlines, sentences, sections };
}

export function requirementId(sectionRef: string, sectionTitle: string, text: string): string {
  const norm = contentTerms(text).join(' ');
  const prefix = sectionRef || (sectionTitle ? sectionTitle.replace(/[^A-Za-z0-9]+/g, '').slice(0, 6).toUpperCase() : 'S');
  return prefix + '-' + hash36(norm || normalizeSpace(text).toLowerCase()).slice(0, 5);
}

/** Full pipeline over one or more documents of a bid. */
export function extractRequirements(docs: SourceDoc[]): ExtractionResult {
  const all: Candidate[] = [];
  const limits: Limit[] = [];
  const deadlines: Deadline[] = [];
  let sentences = 0;
  let blocks = 0;
  const sectionsAll: Array<{ info: SectionInfo; blocks: Block[] }> = [];
  for (const d of docs) {
    const r = scanDocument(d);
    all.push(...r.candidates.map((c) => ({ ...c, docId: d.id, docTitle: d.title } as Candidate & { docId: string; docTitle: string })));
    limits.push(...r.limits);
    deadlines.push(...r.deadlines);
    sentences += r.sentences;
    blocks += d.blocks.length;
    sectionsAll.push(...r.sections);
  }
  const reqs: Requirement[] = [];
  const used = new Set<string>();
  all.forEach((c0) => {
    const c = c0 as Candidate & { docId: string; docTitle: string };
    let id = requirementId(c.section.ref, c.section.title, c.text);
    let k = 2;
    while (used.has(id)) id = id.replace(/~\d+$/, '') + '~' + k++;
    used.add(id);
    const source: SourceRef = {
      docId: c.docId, docTitle: c.docTitle, blockIndex: c.blockIndex, sentenceIndex: c.sentenceIndex,
      sectionRef: c.section.ref, sectionTitle: c.section.title, headingPath: c.section.path,
    };
    const terms = Array.from(new Set(contentTerms(c.text, DOMAIN_STOPWORDS)));
    const r: Requirement = {
      id, seq: reqs.length + 1, text: normalizeSpace(c.text), type: c.type, strength: c.strength, modal: c.modal, actor: c.actor,
      sectionRef: c.section.ref, sectionTitle: c.section.title, sectionKind: c.section.kind, source, alsoAt: [], terms,
    };
    if (c.leadIn) r.leadIn = normalizeSpace(c.leadIn);
    reqs.push(r);
  });
  const { kept, merged } = dedupeRequirements(reqs);
  kept.forEach((r, i) => (r.seq = i + 1));
  // link limits to the requirement sentence that carries them
  for (const l of limits) {
    const r = kept.find((x) => x.source.docId === l.source.docId && x.source.blockIndex === l.source.blockIndex && x.source.sentenceIndex === l.source.sentenceIndex);
    if (r) l.requirementId = r.id;
  }
  const seenLim = new Set<string>();
  const uniqLimits = dedupeById(limits).filter((l) => {
    const key = [l.source.docId, l.sectionRef, l.scopeTitle, l.kind, l.value, l.comparator, l.perItem ?? ''].join('|');
    return seenLim.has(key) ? false : (seenLim.add(key), true);
  });
  const uniqDeadlines = dedupeById(deadlines);
  const factors = extractFactors(sectionsAll);
  const byStrength: Record<Strength, number> = { mandatory: 0, expected: 0, recommended: 0, optional: 0, informational: 0 };
  const byType: Record<ReqType, number> = { requirement: 0, instruction: 0, evaluation: 0, limit: 0, deadline: 0 };
  for (const r of kept) { byStrength[r.strength]++; byType[r.type]++; }
  return {
    requirements: kept,
    limits: uniqLimits,
    deadlines: uniqDeadlines,
    factors,
    stats: { documents: docs.length, blocks, sentences, candidates: all.length, requirements: kept.length, duplicatesMerged: merged, byStrength, byType },
  };
}

function dedupeById<T extends { id: string }>(xs: T[]): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}
