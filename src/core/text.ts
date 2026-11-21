// Text utilities: entity decoding, tokenising, stemming, hashing, number words.

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '\u2019', lsquo: '\u2018',
  ldquo: '\u201c', rdquo: '\u201d', mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', sect: '\u00a7',
  bull: '\u2022', middot: '\u00b7', copy: '\u00a9', reg: '\u00ae', trade: '\u2122', deg: '\u00b0',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

export function normalizeSpace(s: string): string {
  return s.replace(/[\u00a0\u2000-\u200b\s]+/g, ' ').trim();
}

/** Straight quotes and dashes so that regexes see one form. */
export function normalizePunct(s: string): string {
  return s.replace(/[\u2018\u2019\u201b]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-');
}

export const STOPWORDS = new Set((
  'a an the and or nor but if then else of to in on at by for with from into onto upon about above below over under ' +
  'as is are was were be been being am do does did done has have had having this that these those it its it\'s they them their ' +
  'there here which who whom whose what when where why how all any both each few more most other some such no not only own ' +
  'same so than too very can could would might also just via per etc e.g i.e ie eg within without between among across through ' +
  'during before after again further once our ours we us you your yours he she his her him i me my mine shall must will should may ' +
  'one two three four five six seven eight nine ten use used using include includes including following follows well able'
).split(/\s+/));

/** Words that appear in nearly every RFP requirement and carry no topic. */
export const DOMAIN_STOPWORDS = new Set((
  'contractor contractors offeror offerors quoter quoters vendor vendors bidder bidders government agency ' +
  'provide provides provided providing ensure ensures required require requires requirement requirements ' +
  'section rfq rfp quote quotes proposal proposals order task applicable appropriate necessary'
).split(/\s+/));

export function stem(word: string): string {
  let w = word.toLowerCase().replace(/'s$/, '');
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (/(ss|us|is)$/.test(w)) {
    // keep: process, status, analysis
  } else if (/ies$/.test(w) && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (/(ses|xes|zes|ches|shes)$/.test(w)) w = w.slice(0, -2);
  else if (/s$/.test(w)) w = w.slice(0, -1);
  const rules: Array<[RegExp, string]> = [
    [/ational$/, 'ate'], [/ization$/, 'ize'], [/isation$/, 'ize'], [/fulness$/, 'ful'], [/iveness$/, 'ive'],
    [/ments?$/, ''], [/ingly$/, ''], [/edly$/, ''], [/ing$/, ''], [/ied$/, 'y'], [/ed$/, ''], [/ation$/, 'ate'],
    [/ness$/, ''], [/ly$/, ''],
  ];
  for (const [re, rep] of rules) {
    if (re.test(w)) {
      const cand = w.replace(re, rep);
      if (cand.length >= 3) { w = cand; break; }
    }
  }
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  // collapse doubled final consonant: "planned" -> "plann" -> "plan"
  if (w.length > 4 && /([b-df-hj-np-tv-z])\1$/.test(w) && !/(ll|ss|zz)$/.test(w)) w = w.slice(0, -1);
  return w;
}

export function words(s: string): string[] {
  return normalizePunct(s).toLowerCase().match(/[a-z0-9][a-z0-9'+-]*[a-z0-9+]|[a-z0-9]/g) ?? [];
}

/** Content terms: lower-case stems without stopwords; numbers kept only when they look like identifiers. */
export function contentTerms(s: string, extraStop?: Set<string>): string[] {
  const out: string[] = [];
  for (const raw of words(s)) {
    const w = raw.replace(/^'+|'+$/g, '');
    if (w.length < 2 || STOPWORDS.has(w) || (extraStop && extraStop.has(w))) continue;
    if (/^\d+$/.test(w) && w.length < 3) continue;
    out.push(stem(w));
  }
  return out;
}

/** FNV-1a 32-bit hash rendered in base 36. */
export function hash36(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const NUM_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, single: 1,
};

/** "five", "5", "twenty-five", "five (5)" -> number; NaN when not a number. */
export function parseNumber(token: string): number {
  const t = token.toLowerCase().replace(/\(\s*\d+\s*\)/g, '').trim();
  if (/^\d+(,\d{3})*$/.test(t)) return parseInt(t.replace(/,/g, ''), 10);
  const parts = t.split(/[-\s]+/).filter(Boolean);
  if (!parts.length) return NaN;
  let total = 0;
  for (const p of parts) {
    const v = NUM_WORDS[p];
    if (v === undefined) return NaN;
    total = v === 100 ? (total || 1) * 100 : total + v;
  }
  return total;
}

export const NUMBER_PATTERN =
  '(?:\\d+(?:,\\d{3})*|(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?)|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|single)(?:\\s*\\(\\s*\\d+\\s*\\))?';

export function slug(s: string, max = 24): string {
  return normalizePunct(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '') || 'S';
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '\u2026';
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
