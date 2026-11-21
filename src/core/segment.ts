// Sentence segmentation tuned for RFP prose (abbreviations, section numbers, initials).

const ABBREV = new Set([
  'e.g', 'i.e', 'etc', 'u.s', 'no', 'nos', 'sec', 'secs', 'mr', 'ms', 'mrs', 'dr', 'st', 'inc', 'ltd', 'co', 'corp',
  'vs', 'approx', 'fig', 'figs', 'al', 'jr', 'sr', 'para', 'paras', 'vol', 'pp', 'ref', 'est', 'dept', 'u.s.c', 'c.f.r',
  'cf', 'ca', 'incl', 'attn', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'a.m', 'p.m', 'art', 'ch', 'seq', 'hrs', 'min', 'max',
]);

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const chunk of text.split(/\n+/)) {
    let start = 0;
    const re = /[.!?]["')\]\u201d\u2019]*\s+(?=["'(\[\u201c\u2018]?[A-Z0-9])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(chunk))) {
      const before = chunk.slice(start, m.index + 1);
      const lw = before.match(/([A-Za-z][A-Za-z.]*)\.$/)?.[1] ?? '';
      if (lw.length === 1 && lw === lw.toUpperCase()) continue; // initials, "Section L."
      if (ABBREV.has(lw.toLowerCase())) continue;
      if (/(?:^|\s)\d{1,2}\.$/.test(before) && before.trim().length <= 4) continue; // "1. Text" list numbering
      const piece = chunk.slice(start, m.index + m[0].length).trim();
      if (piece) out.push(piece);
      start = m.index + m[0].length;
    }
    const rest = chunk.slice(start).trim();
    if (rest) out.push(rest);
  }
  return out.filter((s) => /[A-Za-z]{2}/.test(s));
}
