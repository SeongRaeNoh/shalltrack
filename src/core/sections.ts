// Section headings: reference numbers, titles, and the kind of section (instructions, evaluation, work, ...).
import { Heading, SectionInfo, SectionKind } from './types';
import { normalizePunct, normalizeSpace } from './text';

export function parseHeading(text: string, level: number): Heading {
  const t = normalizeSpace(normalizePunct(text).replace(/^[*_#\s]+|[*_\s]+$/g, ''));
  let m = t.match(/^section\s+([A-Z])(?:[.\s-]*(\d{1,2}(?:\.\d{1,2})*))?(?![\w])[\s.:-]*(.*)$/i);
  if (m && (m[2] || m[1] === m[1].toUpperCase())) {
    const ref = m[2] ? m[1].toUpperCase() + '.' + m[2] : m[1].toUpperCase();
    return { ref, title: m[3] || t, level };
  }
  m = t.match(/^([A-Z])\.(\d{1,2}(?:\.\d{1,2})*)\.?\s+(.*)$/);
  if (m) return { ref: m[1] + '.' + m[2], title: m[3], level };
  m = t.match(/^(?:section\s+)?(\d{1,2}(?:\.\d{1,2})*)\.?(?:\s+|\s*[-:]\s*)(.*)$/i);
  if (m && m[2]) return { ref: m[1], title: m[2], level };
  m = t.match(/^(?:section\s+)?(\d{1,2}(?:\.\d{1,2})+)\.?$/i);
  if (m) return { ref: m[1], title: t, level };
  return { ref: '', title: t, level };
}

const KIND_RULES: Array<[SectionKind, RegExp]> = [
  ['evaluation', /\b(evaluation|evaluated|basis (?:for|of) award|factors? \d|factor [ivx]+\b|selection|rating|section m\b|award criteria|price evaluation)/i],
  ['instructions', /\b(instructions?|submission|submittal|submitting|preparation|proposal format|quote format|volume|section l\b|response format|deadlines?|questions|oral (?:interview|presentation)|demonstration|price submission|technical submission)/i],
  ['administration', /\b(administration|invoic|contract type|place of performance|clauses?|terms and conditions|government personnel|authorit|payment|limitation of funds|post award|contractor performance|period of performance|ordering period|open season)/i],
  ['work', /\b(scope|statement of work|performance work statement|objectives?|requirements?|tasks?|deliverables?|section c\b|constraints|security|508|accessibility|personnel|skills|environment|system access|quality assurance|qasp|backlog|user stor|data rights|services|support|training|software|design)/i],
  ['background', /\b(background|purpose|problem|vision|introduction|overview|current|summary|about|history)/i],
];

/** Classify the section from its heading path, innermost heading first. */
export function classifySection(path: string[]): SectionKind {
  for (let i = path.length - 1; i >= 0; i--) {
    for (const [kind, re] of KIND_RULES) if (re.test(path[i])) return kind;
  }
  return 'other';
}

/** Tracks the heading stack while walking the blocks of a document. */
export class SectionTracker {
  private stack: Heading[] = [];

  push(h: Heading): void {
    while (this.stack.length && this.stack[this.stack.length - 1].level >= h.level) this.stack.pop();
    this.stack.push(h);
  }

  current(): SectionInfo {
    const path = this.stack.map((h) => (h.ref ? h.ref + ' ' + h.title : h.title));
    let ref = '';
    for (let i = this.stack.length - 1; i >= 0; i--) if (this.stack[i].ref) { ref = this.stack[i].ref; break; }
    const inner = this.stack[this.stack.length - 1];
    const title = inner ? inner.title : '';
    const kindPath = this.stack.map((h) => h.title);
    // explicit UCF letters override keyword rules
    const letter = [...this.stack].reverse().find((h) => /^[A-Z](\.|$)/.test(h.ref))?.ref[0];
    let kind = classifySection(kindPath);
    if (letter === 'L') kind = 'instructions';
    else if (letter === 'M') kind = 'evaluation';
    else if (letter === 'C') kind = kind === 'other' ? 'work' : kind;
    return { ref, title, kind, path };
  }
}
