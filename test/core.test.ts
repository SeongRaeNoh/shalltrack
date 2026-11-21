import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  buildOutline, buildRows, checkCoverage, classifySentence, dedupeRequirements, extractDeadline, extractFactors, extractLimits,
  extractRequirements, filterRows, markdownToBlocks, parseHeading, scanDocument, splitSentences, storageToBlocks, summarize, toCsv,
  toStorageTable, SectionInfo, SourceRef,
} from '../src/core';

const work: SectionInfo = { ref: '5.1', title: 'System Requirements', kind: 'work', path: ['5.1 System Requirements'] };
const instr: SectionInfo = { ref: 'L.4', title: 'Instructions to Offerors', kind: 'instructions', path: ['L.4 Instructions to Offerors'] };
const evalSec: SectionInfo = { ref: 'M.2', title: 'Evaluation Factors', kind: 'evaluation', path: ['M.2 Evaluation Factors'] };
const REF: SourceRef = { docId: 'd', docTitle: 'D', blockIndex: 0, sentenceIndex: 0, sectionRef: '', sectionTitle: '', headingPath: [] };
const doc = (md: string) => ({ id: 'doc', title: 'RFP', blocks: markdownToBlocks(md) });

test('markdown blocks: headings, lists, tables, blockquote markers', () => {
  const b = markdownToBlocks('# Title\n\nPara one\ncontinues.\n\n- item a\n  more a\n- > item b\n\n| A | B |\n|---|---|\n| x | y |\n\n9.2.2 Factor 1 - Technical Approach\n');
  assert.deepEqual(b.map((x) => x.kind), ['heading', 'paragraph', 'listItem', 'listItem', 'tableRow', 'tableRow', 'heading']);
  assert.equal(b[1].text, 'Para one continues.');
  assert.equal(b[2].text, 'item a more a');
  assert.equal(b[3].text, 'item b');
  assert.equal(b[5].text, 'x | y');
});

test('storage format blocks: nested lists, tables, macros, entities', () => {
  const xhtml = '<h2>L.4 Instructions</h2><p>The offeror shall submit one volume &amp; one price.</p><ul><li><p>First item</p><ul><li>Nested</li></ul></li></ul>' +
    '<table><tbody><tr><th><p>Volume</p></th><th>Page limit</th></tr><tr><td>Technical</td><td>Maximum 10 pages</td></tr></tbody></table>' +
    '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">js</ac:parameter><ac:plain-text-body><![CDATA[shall not appear]]></ac:plain-text-body></ac:structured-macro><p>Last&nbsp;one.</p>';
  const b = storageToBlocks(xhtml);
  assert.deepEqual(b.map((x) => x.kind), ['heading', 'paragraph', 'listItem', 'listItem', 'tableRow', 'tableRow', 'paragraph']);
  assert.equal(b[1].text, 'The offeror shall submit one volume & one price.');
  assert.equal(b[3].depth, 2);
  assert.equal(b[5].text, 'Technical | Maximum 10 pages');
  assert.equal(b[6].text, 'Last one.');
  assert.ok(!b.some((x) => x.text.includes('shall not appear')));
});

test('sentence split keeps abbreviations and initials', () => {
  assert.deepEqual(splitSentences('Use the U.S. Web Design System. It is required, e.g. for forms. See Section L. Then stop.'), ['Use the U.S. Web Design System.', 'It is required, e.g. for forms. See Section L. Then stop.'].flatMap((s) => s === 'It is required, e.g. for forms. See Section L. Then stop.' ? ['It is required, e.g. for forms.', 'See Section L. Then stop.'] : [s]));
});

test('headings: numeric, UCF letters, unnumbered', () => {
  assert.deepEqual(parseHeading('9.2.2 Factor 1 - Technical Approach', 4), { ref: '9.2.2', title: 'Factor 1 - Technical Approach', level: 4 });
  assert.equal(parseHeading('Section L.4.2 Volume I', 2).ref, 'L.4.2');
  assert.equal(parseHeading('L.5 Instructions', 2).ref, 'L.5');
  assert.equal(parseHeading('SECTION M - EVALUATION FACTORS FOR AWARD', 1).ref, 'M');
  assert.equal(parseHeading('508 Compliance Requirements', 2).ref, '');
  assert.equal(parseHeading('1.0 Purpose', 2).ref, '1.0');
});

test('modal strength and actor', () => {
  assert.equal(classifySentence('The Contractor shall deliver weekly status reports.', work)?.strength, 'mandatory');
  assert.equal(classifySentence('The contractor will employ the U.S. Web Design System.', work)?.strength, 'expected');
  assert.equal(classifySentence('The contractor should deliver working software early.', work)?.strength, 'recommended');
  assert.equal(classifySentence('The contractor may submit links to repositories.', work)?.strength, 'optional');
  assert.equal(classifySentence('OFA will provide the cloud.gov account.', work), null);
  assert.equal(classifySentence('The government does not anticipate that contractor personnel will need to access PII.', work), null);
  assert.equal(classifySentence('Answers will be provided as an amendment to the solicitation.', instr), null);
  assert.equal(classifySentence('Submission of any other format will constitute a nonresponsive quote.', instr), null);
  assert.equal(classifySentence('Contractors are cautioned not to include assumptions.', instr)?.strength, 'mandatory');
  assert.equal(classifySentence('Do not include pricing in the technical volume.', instr)?.modal, 'imperative');
  const ev = classifySentence('The Government will evaluate the offeror\'s staffing approach.', evalSec);
  assert.equal(ev?.type, 'evaluation');
  assert.equal(ev?.strength, 'informational');
  assert.equal(classifySentence('Quotes will be evaluated on the factors listed below.', evalSec), null);
  assert.equal(classifySentence('Personnel that are required to obtain a PIV card will be issued a laptop.', work), null);
});

test('lead-in lists inherit the strength; a following paragraph ends the list', () => {
  const r = scanDocument(doc('## 9.2.2 Technical Approach\n\nThe Technical Approach must explain the following:\n\n- How the contractor will develop the software\n- Plans to overcome obstacles\n\nThe components are:\n\n- A CI server\n'));
  const texts = r.candidates.map((c) => c.text + '|' + c.strength);
  assert.deepEqual(texts, ['How the contractor will develop the software|mandatory', 'Plans to overcome obstacles|mandatory']);
});

test('limits: pages, words, fonts, per-item and allowances', () => {
  const l = (s: string) => extractLimits(s, 'Scope', '1', REF).map((x) => x.kind + ':' + x.comparator + ':' + x.value + (x.perItem ? ':' + x.perItem : '') + (x.extra ? ':+' : ''));
  assert.deepEqual(l('This section should be no more than five pages.'), ['pages:max:5']);
  assert.deepEqual(l('This section shall not exceed three (3) pages.'), ['pages:max:3']);
  assert.deepEqual(l('Volume 1A | Part A | Maximum 3 pages'), ['pages:max:3']);
  assert.deepEqual(l('Give a brief description (less than 200 words).'), ['words:max:200']);
  assert.deepEqual(l('Written responses should be in 12-point font.'), ['font-size:min:12']);
  assert.deepEqual(l('No more than three pages plus one additional page for each resume.'), ['pages:max:3:+']);
  assert.deepEqual(l('Resumes cannot exceed two pages in length each.'), ['pages:max:2']);
});

test('deadlines: date, time, references to a date', () => {
  const d = extractDeadline('Quotes are due no later than 2:00 PM ET on March 3, 2020.', '9.1', REF);
  assert.equal(d?.isoDate, '2020-03-03');
  assert.match(d?.timeText ?? '', /2:00 PM/);
  assert.ok(extractDeadline('All questions must be submitted by the deadline provided on page 1.', '9.1', REF));
  assert.equal(extractDeadline('The contractor shall deliver reports monthly.', '9.1', REF), null);
});

test('evaluation factors and weights', () => {
  const md = '## M.1 Evaluation\n\nFactors are listed in descending order of importance.\n\n### M.2 Factor 1 - Technical Approach\n\n### M.3 Factor 2 - Staffing Plan\n\n### M.4 Factor 3 - Past Performance\n';
  const r = extractRequirements([doc(md)]);
  assert.deepEqual(r.factors.factors.map((f) => f.name + ':' + f.weight), ['Technical Approach:0.5', 'Staffing Plan:0.33', 'Past Performance:0.17']);
});

test('dedupe merges restatements but keeps items with different lead-ins', () => {
  const r = extractRequirements([doc('## 5 Work\n\nThe contractor shall host the system on cloud.gov with automated deployments.\n\n## 9 Instructions\n\nThe contractor shall host the system on cloud.gov with automated deployments.\n\nThe backend should use:\n\n- A modern open-source language such as Ruby or JavaScript\n\nThe frontend should use:\n\n- A modern open-source language such as JavaScript or TypeScript\n')]);
  assert.equal(r.stats.duplicatesMerged, 1);
  assert.equal(r.requirements[0].alsoAt.length, 1);
  assert.equal(r.requirements.filter((x) => x.text.startsWith('A modern')).length, 2);
});

test('stable ids: same text gives the same id across runs', () => {
  const md = '## 5.2 Security\n\nThe contractor must use multi-factor authentication.\n';
  assert.equal(extractRequirements([doc(md)]).requirements[0].id, extractRequirements([doc('# Other\n\n' + md)]).requirements[0].id);
  assert.match(extractRequirements([doc(md)]).requirements[0].id, /^5\.2-[a-z0-9]{1,5}$/);
});

const RFP = '## C.3 Requirements\n\nThe contractor shall provide 24x7 help desk support by phone and email.\n\nThe contractor shall encrypt all data at rest with FIPS 140-3 validated modules.\n\nThe contractor shall deliver a monthly performance report.\n\n## L.4 Technical Volume\n\nThe technical volume shall not exceed two pages.\n';
const draftFor = (encryptId: string) => '# Technical Volume\n\n## Support\n\nOur help desk answers phone calls and email around the clock, 24x7, staffed by certified agents.\n\n## Security\n\nAll stored data is encrypted [' + encryptId + '].\n\n' + 'Filler words for length. '.repeat(260);
const idOf = (r: ReturnType<typeof extractRequirements>, start: string) => r.requirements.find((q) => q.text.startsWith(start))!.id;

test('coverage: covered, missing, limit breach', () => {
  const r = extractRequirements([doc(RFP)]);
  const rep = checkCoverage(r.requirements, [doc(draftFor(idOf(r, 'The contractor shall encrypt')))], r.limits);
  const st = (start: string) => rep.items.find((i) => r.requirements.find((q) => q.id === i.requirementId)!.text.startsWith(start))!;
  assert.equal(st('The contractor shall provide 24x7').status, 'covered');
  assert.equal(st('The contractor shall deliver a monthly').status, 'missing');
  assert.equal(st('The contractor shall encrypt').status, 'covered');
  assert.equal(st('The contractor shall encrypt').explicitReference, true);
  const lc = rep.limitChecks.find((l) => l.kind === 'pages')!;
  assert.equal(lc.status, 'breach');
  assert.ok(rep.summary.mandatoryMissing >= 1);
});

test('matrix rows, filters, summary, exports', () => {
  const r = extractRequirements([doc(RFP)]);
  const rep = checkCoverage(r.requirements, [doc(draftFor('none'))], r.limits);
  const first = r.requirements[0].id;
  const rows = buildRows(r.requirements, { [first]: { status: 'addressed', owner: { name: 'Dana' }, evidence: { pageId: '1', excerpt: 'x', at: 'now' } } }, rep);
  assert.equal(rows[0].effectiveCoverage, 'covered');
  assert.equal(rows[0].coverageSource, 'manual');
  assert.equal(filterRows(rows, { owner: 'unassigned' }).length, rows.length - 1);
  assert.equal(filterRows(rows, { section: 'C' }).length, 3);
  assert.equal(filterRows(rows, { section: 'D' }).length, 0);
  assert.equal(filterRows(rows, { section: 'C.3' }).length, 3);
  const s = summarize(rows);
  assert.equal(s.total, rows.length);
  const xhtml = toStorageTable(rows, { bidName: 'Test <bid>', generatedAt: '2026-11-21' });
  assert.ok(xhtml.includes('Test &lt;bid&gt;'));
  assert.equal((xhtml.match(/<tr>/g) ?? []).length, rows.length + 1);
  assert.equal((xhtml.match(/<tr>/g) ?? []).length, (xhtml.match(/<\/tr>/g) ?? []).length);
  assert.match(toCsv(rows).split('\n')[1], /^C\.3-/);
});

test('outline follows instruction sections with page limits', () => {
  const r = extractRequirements([doc(RFP)]);
  const o = buildOutline(r.requirements, r.limits, r.factors.factors);
  assert.equal(o.sections[0].heading, 'L.4 Technical Volume');
  assert.equal(o.sections[0].pageLimit, 2);
});

test('factor extraction ignores subfactors', () => {
  const f = extractFactors([{ info: evalSec, blocks: markdownToBlocks('### Factor 1: Technical\n\n#### Subfactor 1.1: Design\n') }]);
  assert.deepEqual(f.factors.map((x) => x.number), ['1']);
});
