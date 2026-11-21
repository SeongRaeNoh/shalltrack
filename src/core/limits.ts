// Page, word, character and font limits; due dates.
import { Deadline, Limit, LimitKind, SourceRef } from './types';
import { NUMBER_PATTERN, hash36, normalizePunct, parseNumber } from './text';

const N = NUMBER_PATTERN;
const UNIT = '(pages?|words?|characters?)';

interface LimitPattern { re: RegExp; cmp: 'max' | 'min'; }

const PATTERNS: LimitPattern[] = [
  { re: new RegExp('(?:no|not)\\s+(?:more|longer|greater)\\s+than\\s+(' + N + ')\\s+(?:single[- ]sided\\s+|double[- ]spaced\\s+)?' + UNIT, 'i'), cmp: 'max' },
  { re: new RegExp('(?:not|never)\\s+(?:to\\s+)?exceed(?:ing)?\\s+(?:a\\s+(?:total|maximum)\\s+of\\s+)?(' + N + ')\\s+' + UNIT, 'i'), cmp: 'max' },
  { re: new RegExp('(?:cannot|can\\s*not|may\\s+not|must\\s+not|shall\\s+not|should\\s+not|will\\s+not)\\s+exceed\\s+(?:a\\s+(?:total|maximum)\\s+of\\s+)?(' + N + ')\\s+' + UNIT, 'i'), cmp: 'max' },
  { re: new RegExp('(?:maximum|max\\.?|up\\s+to|limited\\s+to|limit\\s+of|at\\s+most)\\s+(?:of\\s+)?(' + N + ')\\s+' + UNIT, 'i'), cmp: 'max' },
  { re: new RegExp('(' + N + ')[- ]' + '(page|word|character)' + '\\s+(?:limit|limitation|maximum|max)', 'i'), cmp: 'max' },
  { re: new RegExp('(' + N + ')\\s+' + UNIT + '\\s+(?:maximum|max\\b|or\\s+(?:less|fewer))', 'i'), cmp: 'max' },
  { re: new RegExp('page\\s+limit(?:ation)?\\s+(?:of|is|:)\\s*(' + N + ')()', 'i'), cmp: 'max' },
  { re: new RegExp('(?<!\\bno\\s)(?<!\\bnot\\s)\\b(?:less|fewer)\\s+than\\s+(' + N + ')\\s+' + UNIT, 'i'), cmp: 'max' },
  { re: new RegExp('(?:at\\s+least|minimum\\s+of|no\\s+(?:less|fewer)\\s+than)\\s+(' + N + ')\\s+' + UNIT, 'i'), cmp: 'min' },
];

const FONT = /(\d{1,2})[- ]?(?:point|pt\.?)\s+(?:font|type|text)|font\s+size\s+(?:of\s+|no\s+smaller\s+than\s+|at\s+least\s+)?(\d{1,2})/i;

function unitKind(u: string): LimitKind {
  const x = (u || 'pages').toLowerCase();
  if (x.startsWith('word')) return 'words';
  if (x.startsWith('char')) return 'characters';
  return 'pages';
}

/** Extract limits from one sentence or table row. scopeTitle: the section or row the limit applies to. */
export function extractLimits(sentence: string, scopeTitle: string, sectionRef: string, source: SourceRef): Limit[] {
  const s = normalizePunct(sentence);
  const out: Limit[] = [];
  const seen = new Set<string>();
  for (const p of PATTERNS) {
    const re = new RegExp(p.re.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const value = parseNumber(m[1]);
      if (!Number.isFinite(value) || value <= 0 || value > 100000) continue;
      const kind = unitKind(m[2]);
      const key = kind + ':' + value + ':' + p.cmp;
      if (seen.has(key)) continue;
      seen.add(key);
      const tail = s.slice(m.index + m[0].length, m.index + m[0].length + 120);
      const extra = tail.match(/^[^.]*?\b(plus\s+[^.;]+)/i)?.[1];
      const tailBeforePlus = tail.split(/\bplus\b/i)[0];
      const per = (s.slice(Math.max(0, m.index - 40), m.index) + ' ' + tailBeforePlus.slice(0, 40)).match(/\b(?:each|per)\s+([a-z]+(?:\s+of\s+[a-z]+)?)/i)?.[1];
      const limit: Limit = {
        id: 'LIM-' + hash36(sectionRef + '|' + scopeTitle + '|' + key + '|' + s.slice(0, 80)).slice(0, 6),
        kind, value, comparator: p.cmp, scopeTitle, sectionRef, text: sentence, source,
      };
      if (extra) limit.extra = extra.trim();
      if (per && !/^(?:page|word)s?$/i.test(per)) limit.perItem = per.toLowerCase();
      out.push(limit);
    }
  }
  const f = s.match(FONT);
  if (f) {
    const value = parseInt(f[1] || f[2], 10);
    if (value >= 6 && value <= 24) {
      out.push({
        id: 'LIM-' + hash36(sectionRef + '|' + scopeTitle + '|font|' + value).slice(0, 6),
        kind: 'font-size', value, comparator: 'min', scopeTitle, sectionRef, text: sentence, source,
      });
    }
  }
  return out;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DATE_RE = new RegExp(
  '\\b(?:(' + MONTHS.join('|') + '|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})|(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2,4})|(\\d{4})-(\\d{2})-(\\d{2}))\\b',
  'i',
);
const TIME_RE = /\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|AM|PM)(?:\s*(?:\(?[ECMP][SD]?T\)?|eastern|central|mountain|pacific)(?:\s+time)?)?|noon)\b/i;
const DUE_RE = /\b(due|no\s+later\s+than|deadline|closing\s+date|must\s+be\s+(?:received|submitted)|shall\s+be\s+(?:received|submitted)|submitted\s+by|received\s+by|on\s+or\s+before)\b/i;

export function extractDeadline(sentence: string, sectionRef: string, source: SourceRef): Deadline | null {
  const s = normalizePunct(sentence);
  if (!DUE_RE.test(s)) return null;
  const d = s.match(DATE_RE);
  const t = s.match(TIME_RE);
  const refersToDate = /\b(deadline|date)\s+(?:provided|specified|stated|listed|shown|identified)\b/i.test(s);
  if (!d && !refersToDate) return null;
  const out: Deadline = {
    id: 'DUE-' + hash36(sectionRef + '|' + s.slice(0, 120)).slice(0, 6),
    text: sentence,
    sectionRef,
    source,
  };
  if (d) {
    out.dateText = d[0];
    let y: number | undefined, mo: number | undefined, da: number | undefined;
    if (d[1]) {
      const name = d[1].toLowerCase();
      mo = MONTHS.findIndex((x) => x.startsWith(name.slice(0, 3))) + 1;
      da = parseInt(d[2], 10); y = parseInt(d[3], 10);
    } else if (d[4]) {
      mo = parseInt(d[4], 10); da = parseInt(d[5], 10); y = parseInt(d[6], 10); if (y < 100) y += 2000;
    } else if (d[7]) {
      y = parseInt(d[7], 10); mo = parseInt(d[8], 10); da = parseInt(d[9], 10);
    }
    if (y && mo && da && mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      out.isoDate = String(y).padStart(4, '0') + '-' + String(mo).padStart(2, '0') + '-' + String(da).padStart(2, '0');
    }
  }
  if (t) out.timeText = t[0];
  return out;
}
