// Convert Markdown (or plain text) to Confluence storage format, for creating demo RFP pages and for round-trip tests.
import * as fs from 'fs';
import { escapeXml, markdownToBlocks } from '../src/core';

export function markdownToStorage(md: string): string {
  const out: string[] = [];
  let depth = 0;
  const closeLists = (to: number) => { while (depth > to) { out.push('</li></ul>'); depth--; } };
  let inTable = false;
  for (const b of markdownToBlocks(md)) {
    if (b.kind !== 'listItem') closeLists(0);
    if (b.kind !== 'tableRow' && inTable) { out.push('</tbody></table>'); inTable = false; }
    const t = escapeXml(b.text).replace(/\n/g, '<br />');
    if (b.kind === 'heading') out.push('<h' + (b.level ?? 2) + '>' + t + '</h' + (b.level ?? 2) + '>');
    else if (b.kind === 'paragraph') out.push('<p>' + t + '</p>');
    else if (b.kind === 'tableRow') {
      if (!inTable) { out.push('<table><tbody>'); inTable = true; }
      out.push('<tr>' + b.text.split(' | ').map((c) => '<td><p>' + escapeXml(c) + '</p></td>').join('') + '</tr>');
    } else {
      const d = b.depth ?? 1;
      if (d > depth) { while (depth < d) { out.push('<ul><li>'); depth++; } }
      else { closeLists(d); out.push('</li><li>'); }
      out.push('<p>' + t + '</p>');
    }
  }
  closeLists(0);
  if (inTable) out.push('</tbody></table>');
  return out.join('\n');
}

if (require.main === module) {
  const [src, dst] = process.argv.slice(2);
  fs.writeFileSync(dst, markdownToStorage(fs.readFileSync(src, 'utf8')));
}
