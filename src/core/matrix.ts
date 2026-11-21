// Compliance matrix: rows, filters, summary, Confluence storage-format table and CSV export.
import { CoverageItem, CoverageReport, CoverageStatus, ReqType, Requirement, SectionKind, Strength, STRENGTH_RANK } from './types';
import { escapeXml, truncate } from './text';

export type WorkStatus = 'open' | 'in-progress' | 'addressed' | 'not-applicable';

export interface Owner { accountId?: string; name?: string }
export interface ManualEvidence { pageId: string; pageTitle?: string; excerpt: string; linkedBy?: string; at: string }
export interface SemanticReview { verdict: CoverageStatus; rationale: string; reviewer: 'rovo' | 'user'; at: string }

export interface ReqState {
  owner?: Owner;
  status: WorkStatus;
  note?: string;
  jiraKey?: string;
  evidence?: ManualEvidence;
  review?: SemanticReview;
  updatedAt?: string;
  updatedBy?: string;
}

export interface MatrixRow {
  id: string;
  seq: number;
  text: string;
  leadIn?: string;
  type: ReqType;
  strength: Strength;
  modal: string | null;
  sectionRef: string;
  sectionTitle: string;
  sectionKind: SectionKind;
  docId: string;
  docTitle: string;
  duplicates: number;
  owner?: Owner;
  status: WorkStatus;
  note?: string;
  jiraKey?: string;
  coverage?: CoverageStatus;
  coverageScore?: number;
  evidenceExcerpt?: string;
  evidenceDocTitle?: string;
  evidenceDocId?: string;
  /** coverage after manual evidence and semantic reviews are applied */
  effectiveCoverage: CoverageStatus | 'n/a' | 'unchecked';
  coverageSource: 'manual' | 'review' | 'auto' | 'none';
}

export function buildRows(reqs: Requirement[], state: Record<string, ReqState>, report?: CoverageReport | null): MatrixRow[] {
  const cov = new Map<string, CoverageItem>((report?.items ?? []).map((i) => [i.requirementId, i] as const));
  return reqs.map((r) => {
    const st = state[r.id] ?? { status: 'open' as WorkStatus };
    const c = cov.get(r.id);
    let effective: MatrixRow['effectiveCoverage'];
    let source: MatrixRow['coverageSource'] = 'none';
    if (st.evidence) { effective = 'covered'; source = 'manual'; }
    else if (st.review) { effective = st.review.verdict; source = 'review'; }
    else if (c) { effective = c.status; source = 'auto'; }
    else if (r.type === 'limit' || r.type === 'deadline') effective = 'n/a';
    else effective = report ? 'n/a' : 'unchecked';
    const ev = c?.evidence[0];
    return {
      id: r.id, seq: r.seq, text: r.text, leadIn: r.leadIn, type: r.type, strength: r.strength, modal: r.modal,
      sectionRef: r.sectionRef, sectionTitle: r.sectionTitle, sectionKind: r.sectionKind, docId: r.source.docId, docTitle: r.source.docTitle,
      duplicates: r.alsoAt.length, owner: st.owner, status: st.status, note: st.note, jiraKey: st.jiraKey,
      coverage: c?.status, coverageScore: c?.score,
      evidenceExcerpt: st.evidence?.excerpt ?? ev?.excerpt, evidenceDocTitle: st.evidence?.pageTitle ?? ev?.docTitle, evidenceDocId: st.evidence?.pageId ?? ev?.docId,
      effectiveCoverage: effective, coverageSource: source,
    };
  });
}

export interface MatrixFilter {
  section?: string;
  strength?: Strength[];
  type?: ReqType[];
  status?: WorkStatus[];
  coverage?: Array<MatrixRow['effectiveCoverage']>;
  owner?: string;
  text?: string;
  minStrength?: Strength;
}

export function filterRows(rows: MatrixRow[], f: MatrixFilter = {}): MatrixRow[] {
  const q = f.text?.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.section && !(r.sectionRef === f.section || r.sectionRef.startsWith(f.section + '.') || r.sectionTitle === f.section)) return false;
    if (f.strength?.length && !f.strength.includes(r.strength)) return false;
    if (f.minStrength && STRENGTH_RANK[r.strength] < STRENGTH_RANK[f.minStrength]) return false;
    if (f.type?.length && !f.type.includes(r.type)) return false;
    if (f.status?.length && !f.status.includes(r.status)) return false;
    if (f.coverage?.length && !f.coverage.includes(r.effectiveCoverage)) return false;
    if (f.owner) {
      if (f.owner === 'unassigned') { if (r.owner?.accountId || r.owner?.name) return false; }
      else if (r.owner?.accountId !== f.owner && r.owner?.name !== f.owner) return false;
    }
    if (q && !(r.text.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.sectionTitle.toLowerCase().includes(q))) return false;
    return true;
  });
}

export interface MatrixSummary {
  total: number;
  byStrength: Record<Strength, number>;
  byType: Record<ReqType, number>;
  byStatus: Record<WorkStatus, number>;
  byCoverage: Record<string, number>;
  mandatory: number;
  mandatoryMissing: number;
  unassigned: number;
}

export function summarize(rows: MatrixRow[]): MatrixSummary {
  const s: MatrixSummary = {
    total: rows.length,
    byStrength: { mandatory: 0, expected: 0, recommended: 0, optional: 0, informational: 0 },
    byType: { requirement: 0, instruction: 0, evaluation: 0, limit: 0, deadline: 0 },
    byStatus: { open: 0, 'in-progress': 0, addressed: 0, 'not-applicable': 0 },
    byCoverage: {},
    mandatory: 0,
    mandatoryMissing: 0,
    unassigned: 0,
  };
  for (const r of rows) {
    s.byStrength[r.strength]++;
    s.byType[r.type]++;
    s.byStatus[r.status]++;
    s.byCoverage[r.effectiveCoverage] = (s.byCoverage[r.effectiveCoverage] ?? 0) + 1;
    if (r.strength === 'mandatory') {
      s.mandatory++;
      if (r.effectiveCoverage === 'missing' && r.status !== 'not-applicable') s.mandatoryMissing++;
    }
    if (!r.owner?.accountId && !r.owner?.name) s.unassigned++;
  }
  return s;
}

export function sectionsOf(rows: MatrixRow[]): Array<{ ref: string; title: string; count: number }> {
  const m = new Map<string, { ref: string; title: string; count: number }>();
  for (const r of rows) {
    const key = r.sectionRef || r.sectionTitle;
    const e = m.get(key) ?? { ref: r.sectionRef, title: r.sectionTitle, count: 0 };
    e.count++;
    m.set(key, e);
  }
  return Array.from(m.values());
}

const STATUS_COLOUR: Record<string, string> = {
  covered: 'Green', partial: 'Yellow', missing: 'Red', 'n/a': 'Grey', unchecked: 'Grey',
  open: 'Grey', 'in-progress': 'Blue', addressed: 'Green', 'not-applicable': 'Grey',
  mandatory: 'Red', expected: 'Purple', recommended: 'Blue', optional: 'Grey', informational: 'Grey',
};

function statusMacro(title: string, colourKey: string): string {
  return '<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">' + (STATUS_COLOUR[colourKey] ?? 'Grey') +
    '</ac:parameter><ac:parameter ac:name="title">' + escapeXml(title.toUpperCase()) + '</ac:parameter></ac:structured-macro>';
}

/** Confluence storage-format page body with a summary and the full matrix table. */
export function toStorageTable(rows: MatrixRow[], opts: { bidName: string; generatedAt: string; ownerNames?: Record<string, string> }): string {
  const s = summarize(rows);
  const head = ['ID', 'Section', 'Requirement', 'Type', 'Strength', 'Owner', 'Status', 'Coverage', 'Evidence', 'Jira'];
  const out: string[] = [];
  out.push('<p>Compliance matrix for <strong>' + escapeXml(opts.bidName) + '</strong>, generated by ShallTrack on ' + escapeXml(opts.generatedAt) + '.</p>');
  out.push('<p>' + s.total + ' items; ' + s.mandatory + ' mandatory; ' + s.mandatoryMissing + ' mandatory items without coverage; ' + s.unassigned + ' without an owner.</p>');
  out.push('<table data-layout="full-width"><tbody><tr>' + head.map((h) => '<th><p>' + h + '</p></th>').join('') + '</tr>');
  for (const r of rows) {
    const owner = r.owner?.accountId ? '<ac:link><ri:user ri:account-id="' + escapeXml(r.owner.accountId) + '" /></ac:link>' : escapeXml(r.owner?.name ?? '');
    const ev = r.evidenceExcerpt ? escapeXml(truncate(r.evidenceExcerpt, 200)) + (r.evidenceDocTitle ? ' <em>(' + escapeXml(r.evidenceDocTitle) + ')</em>' : '') : '';
    out.push('<tr>' + [
      '<code>' + escapeXml(r.id) + '</code>',
      escapeXml((r.sectionRef ? r.sectionRef + ' ' : '') + r.sectionTitle),
      escapeXml(r.text),
      escapeXml(r.type),
      statusMacro(r.strength, r.strength),
      owner,
      statusMacro(r.status, r.status),
      statusMacro(r.effectiveCoverage === 'unchecked' ? 'not checked' : r.effectiveCoverage, r.effectiveCoverage),
      ev,
      r.jiraKey ? escapeXml(r.jiraKey) : '',
    ].map((c) => '<td><p>' + c + '</p></td>').join('') + '</tr>');
  }
  out.push('</tbody></table>');
  return out.join('');
}

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(rows: MatrixRow[]): string {
  const head = ['id', 'seq', 'section_ref', 'section_title', 'type', 'strength', 'modal', 'text', 'owner', 'status', 'coverage', 'coverage_score', 'evidence', 'jira'];
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push([
      r.id, r.seq, r.sectionRef, r.sectionTitle, r.type, r.strength, r.modal ?? '', r.text, r.owner?.name ?? r.owner?.accountId ?? '',
      r.status, r.effectiveCoverage, r.coverageScore ?? '', r.evidenceExcerpt ?? '', r.jiraKey ?? '',
    ].map(csvCell).join(','));
  }
  return lines.join('\n');
}
