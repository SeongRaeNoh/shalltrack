// Convert source documents into blocks: Confluence storage format (XHTML), Markdown, or plain text.
import { Block, BlockKind } from './types';
import { decodeEntities, normalizeSpace } from './text';

const MD_HEADING = /^(#{1,6})\s*(.*?)\s*#*\s*$/;
const MD_LIST = /^(\s*)(?:[-*+\u2022\u25cf\u25aa]|\d{1,3}[.)]|[a-zA-Z][.)]|\((?:[a-zA-Z]|[ivxIVX]+|\d{1,3})\))\s+(.*)$/;
const MD_TABLE_SEP = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** Plain-text numbered heading: "9.2.2 Factor 1 - Technical Approach", "Section L.4 Instructions", "L.4.2 Volume I". */
const NUMBERED_HEADING = /^(?:section\s+[A-Z0-9][\w.]*\b|[A-Z]\.\d{1,2}(?:\.\d{1,2})*\.?\s|\d{1,2}\.\d{1,2}(?:\.\d{1,2})*\.?\s|\d{1,2}\.0\.?\s)/i;

export function inlineMarkdownToText(s: string): string {
  return normalizeSpace(
    decodeEntities(
      s
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\*\*|__/g, '')
        .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\\([\\`*_{}\[\]()#+\-.!|])/g, '$1'),
    ).replace(/\s*\n\s*/g, '\n'),
  ).replace(/ ?\n ?/g, '\n');
}

function headingLevelFromNumber(text: string): number {
  const m = text.match(/^(?:section\s+)?([A-Z]\.)?(\d{1,2}(?:\.\d{1,2})*)/i);
  if (!m) return 2;
  const parts = m[2].split('.').filter((p) => p !== '0');
  return Math.min(6, (m[1] ? 2 : 1) + Math.max(0, parts.length - 1) + 1);
}

/** True when a single line of plain text looks like a numbered section heading. */
export function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 120) return false;
  if (/[.;:,]$/.test(t) && !/\b(?:etc|inc)\.$/i.test(t)) return false;
  if (/\b(shall|must|will|should)\b/i.test(t)) return false;
  return NUMBERED_HEADING.test(t);
}

/** Markdown or plain text to blocks. */
export function markdownToBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { depth: number; parts: string[] } | null = null;
  let inFence = false;

  const push = (kind: BlockKind, text: string, extra: Partial<Block> = {}) => {
    const clean = kind === 'tableRow' ? normalizeSpace(text) : inlineMarkdownToText(text);
    if (!/[A-Za-z0-9]/.test(clean)) return;
    blocks.push({ kind, text: clean, index: blocks.length, ...extra });
  };
  const flushPara = () => {
    if (para.length) {
      const joined = para.join('\n');
      if (para.length === 1 && looksLikeHeading(inlineMarkdownToText(para[0]))) {
        const t = inlineMarkdownToText(para[0]);
        push('heading', t, { level: headingLevelFromNumber(t) });
      } else push('paragraph', joined.replace(/\n(?![-*+]\s)/g, ' '));
    }
    para = [];
  };
  const flushList = () => {
    if (list) push('listItem', list.parts.join(' '), { depth: list.depth });
    list = null;
  };

  let html: string[] | null = null;
  for (const raw of lines) {
    // raw HTML tables inside Markdown (pandoc output) are parsed as storage-format XHTML
    if (html) {
      html.push(raw);
      if (/<\/table>/i.test(raw)) {
        for (const hb of storageToBlocks(html.join('\n'))) blocks.push({ ...hb, index: blocks.length });
        html = null;
      }
      continue;
    }
    if (/^\s*<table[\s>]/i.test(raw)) {
      flushPara(); flushList();
      html = [raw];
      if (/<\/table>/i.test(raw)) { for (const hb of storageToBlocks(raw)) blocks.push({ ...hb, index: blocks.length }); html = null; }
      continue;
    }
    const line = raw.replace(/\t/g, '    ').replace(/^(\s*(?:[-*+]\s+)?)>\s?/, '$1');
    if (/^\s*(```|~~~)/.test(line)) { flushPara(); flushList(); inFence = !inFence; continue; }
    if (inFence) continue;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    const h = line.match(MD_HEADING);
    if (h) {
      flushPara(); flushList();
      push('heading', h[2], { level: h[1].length });
      continue;
    }
    if (/^\s*\|/.test(line)) {
      flushPara(); flushList();
      if (MD_TABLE_SEP.test(line.trim())) continue;
      const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => inlineMarkdownToText(c)).filter((c) => c.length);
      if (cells.length) push('tableRow', cells.join(' | '));
      continue;
    }
    const li = line.match(MD_LIST);
    if (li && !looksLikeHeading(line.trim())) {
      flushPara(); flushList();
      list = { depth: Math.floor(li[1].length / 2) + 1, parts: [li[2]] };
      continue;
    }
    if (list && /^\s+\S/.test(line)) { list.parts.push(line.trim().replace(/^>\s?/, '')); continue; }
    if (list) flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

const BLOCK_PARA = new Set(['p', 'blockquote', 'pre', 'dd', 'dt', 'figcaption', 'caption']);
const SKIP_TAGS = new Set(['ac:parameter', 'ac:plain-text-body', 'style', 'script', 'ac:placeholder']);

/** Confluence storage format (XHTML) to blocks. */
export function storageToBlocks(xhtml: string): Block[] {
  const blocks: Block[] = [];
  type Cur = { kind: BlockKind; level?: number; depth?: number; parts: string[]; cells?: string[] } | null;
  let cur: Cur = null;
  let listDepth = 0;
  let skip = 0;
  let cellOpen = false;

  const flush = () => {
    if (!cur) return;
    let text: string;
    if (cur.kind === 'tableRow') {
      if (cellOpen) { cur.cells!.push(cur.parts.join('')); cur.parts = []; cellOpen = false; }
      text = (cur.cells ?? []).map((c) => normalizeSpace(c)).filter(Boolean).join(' | ');
    } else {
      text = cur.parts.join('').replace(/[ \t\u00a0]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n+/g, '\n').trim();
    }
    if (/[A-Za-z0-9]/.test(text)) {
      const b: Block = { kind: cur.kind, text, index: blocks.length };
      if (cur.level) b.level = cur.level;
      if (cur.depth) b.depth = cur.depth;
      blocks.push(b);
    }
    cur = null;
  };

  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[^>]*?)?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xhtml))) {
    if (m[1] !== undefined || m[0].startsWith('<!--')) continue; // CDATA bodies (code macros) and comments are skipped
    const text = m[6];
    if (text !== undefined) {
      if (skip) continue;
      const t = decodeEntities(text);
      if (!t.trim() && !cur) continue;
      if (!cur) cur = { kind: 'paragraph', parts: [] };
      cur.parts.push(t);
      continue;
    }
    const closing = m[2] === '/';
    const tag = m[3].toLowerCase();
    const selfClosing = m[5] === '/';
    if (SKIP_TAGS.has(tag)) {
      if (!selfClosing) skip += closing ? -1 : 1;
      if (skip < 0) skip = 0;
      continue;
    }
    if (skip) continue;
    if (tag === 'br') { if (cur) cur.parts.push('\n'); continue; }
    if (/^h[1-6]$/.test(tag)) {
      if (!closing) { flush(); cur = { kind: 'heading', level: parseInt(tag[1], 10), parts: [] }; }
      else flush();
      continue;
    }
    if (tag === 'ul' || tag === 'ol') { if (!closing) { flush(); listDepth++; } else { flush(); listDepth = Math.max(0, listDepth - 1); } continue; }
    if (tag === 'li') {
      if (!closing) { flush(); cur = { kind: 'listItem', depth: Math.max(1, listDepth), parts: [] }; }
      else flush();
      continue;
    }
    if (tag === 'tr') {
      if (!closing) { flush(); cur = { kind: 'tableRow', parts: [], cells: [] }; cellOpen = false; }
      else flush();
      continue;
    }
    if (tag === 'td' || tag === 'th') {
      if (!cur || cur.kind !== 'tableRow') { flush(); cur = { kind: 'tableRow', parts: [], cells: [] }; }
      if (!closing) { if (cellOpen) cur.cells!.push(cur.parts.join('')); cur.parts = []; cellOpen = true; }
      else { cur.cells!.push(cur.parts.join('')); cur.parts = []; cellOpen = false; }
      continue;
    }
    if (BLOCK_PARA.has(tag) || tag === 'div' || tag === 'table' || tag === 'tbody' || tag === 'thead') {
      if (cur && (cur.kind === 'listItem' || cur.kind === 'tableRow' || cur.kind === 'heading')) {
        if (!closing && BLOCK_PARA.has(tag) && cur.parts.length) cur.parts.push('\n');
        continue;
      }
      if (BLOCK_PARA.has(tag)) {
        if (!closing) { flush(); cur = { kind: 'paragraph', parts: [] }; } else flush();
      } else flush();
      continue;
    }
    // inline tags (strong, em, a, span, ac:link, ri:*) carry no structure
  }
  flush();
  // promote single-line numbered paragraphs to headings (pages written without heading styles)
  for (const b of blocks) {
    if (b.kind === 'paragraph' && !b.text.includes('\n') && looksLikeHeading(b.text)) {
      b.kind = 'heading';
      b.level = headingLevelFromNumber(b.text);
    }
  }
  return blocks;
}

/** Best-effort detection of the input format. */
export function textToBlocks(input: string): Block[] {
  const s = input.trim();
  if (/^<(?:p|h[1-6]|ul|ol|table|ac:|div)[\s>]/i.test(s) || /<\/(?:p|h[1-6]|li|td)>/i.test(s)) return storageToBlocks(s);
  return markdownToBlocks(s);
}
