// Rovo actions and MCP tools. Inputs come from the model, so every value is validated; results are compact JSON.
import { CoverageStatus, MatrixFilter, MatrixRow, ReqType, Strength, WorkStatus, truncate } from '../core';
import * as svc from './service';

type Payload = Record<string, unknown> & { context?: { confluence?: { contentId?: string }; jira?: { issueKey?: string } } };
type Ctx = { principal?: { accountId?: string }; accountId?: string } | undefined;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+$/.test(v) ? parseInt(v, 10) : undefined);
const bool = (v: unknown): boolean => v === true || v === 'true';

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T[] {
  return svc.splitList(str(v)).map((x) => x.toLowerCase()).filter((x): x is T => (allowed as readonly string[]).includes(x));
}

function accountId(payload: Payload, ctx: Ctx): string | undefined {
  return ctx?.principal?.accountId ?? ctx?.accountId;
}

export function compactRow(r: MatrixRow) {
  return {
    id: r.id, section: (r.sectionRef ? r.sectionRef + ' ' : '') + r.sectionTitle, type: r.type, strength: r.strength, status: r.status,
    coverage: r.effectiveCoverage, score: r.coverageScore, owner: r.owner?.name ?? r.owner?.accountId, jira: r.jiraKey,
    text: truncate(r.text, 260), evidence: r.evidenceExcerpt ? truncate(r.evidenceExcerpt, 160) + (r.evidenceDocTitle ? ' [' + r.evidenceDocTitle + ']' : '') : undefined,
  };
}

function wrap(fn: (p: Payload, accountId?: string) => Promise<unknown>) {
  return async (payload: Payload, ctx?: Ctx) => {
    try {
      return await fn(payload ?? {}, accountId(payload ?? {}, ctx));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: msg, hint: e instanceof svc.UserError ? undefined : 'If this mentions authorization, open the ShallTrack page in Confluence once to grant the app access, then retry.' };
    }
  };
}

const STRENGTHS = svc.STRENGTHS;
const TYPES = svc.TYPES;
const STATUSES = svc.STATUSES;
const COVERAGE = ['covered', 'partial', 'missing', 'unchecked', 'n/a'] as const;

export const listBidsAction = wrap(async (p) => {
  const q = str(p.nameContains)?.toLowerCase();
  const bids = await svc.listBids();
  return { bids: bids.filter((b) => !q || b.name.toLowerCase().includes(q)) };
});

export const importRfpPageAction = wrap(async (p, acc) => {
  const pageId = str(p.pageId) ?? p.context?.confluence?.contentId;
  if (!pageId) return { error: 'Give the Confluence page id or URL of the RFP, or run this from the RFP page.' };
  const r = await svc.createBid({ name: str(p.bidName), pageRefs: svc.splitList(pageId) }, acc);
  return { bid: { id: r.bid.id, name: r.bid.name }, stats: r.stats };
});

export const listRequirementsAction = wrap(async (p) => {
  const filter: MatrixFilter = {
    section: str(p.section), strength: oneOf<Strength>(p.strength, STRENGTHS), type: oneOf<ReqType>(p.type, TYPES),
    status: oneOf<WorkStatus>(p.status, STATUSES), coverage: oneOf(p.coverage, COVERAGE), owner: str(p.owner), text: str(p.text),
  };
  const limit = Math.min(100, num(p.limit) ?? 40);
  const m = await svc.getMatrix(str(p.bid), filter, { offset: num(p.offset) ?? 0, limit });
  return { bid: { id: m.bid.id, name: m.bid.name }, total: m.total, returned: m.rows.length, summary: m.filteredSummary, rows: m.rows.map(compactRow) };
});

export const getRequirementAction = wrap(async (p) => {
  const id = str(p.requirementId);
  if (!id) return { error: 'requirementId is required' };
  return svc.requirementDetail(str(p.bid), id);
});

/** Coverage counts over the given rows; "checked" rows are the requirement, instruction and evaluation items that the coverage check scores. */
function coverageCounts(rows: MatrixRow[]) {
  const n = (c: MatrixRow['effectiveCoverage']) => rows.filter((r) => r.effectiveCoverage === c).length;
  const covered = n('covered'), partial = n('partial'), missing = n('missing');
  return { items: rows.length, checked: covered + partial + missing, covered, partial, missing, notChecked: rows.length - covered - partial - missing };
}

export const getCoverageReportAction = wrap(async (p) => {
  const m = await svc.getMatrix(str(p.bid));
  const onlyMandatory = bool(p.onlyMandatory);
  const rows = m.rows.filter((r) => (onlyMandatory ? r.strength === 'mandatory' : true));
  const gaps = rows.filter((r) => r.effectiveCoverage === 'missing' || r.effectiveCoverage === 'partial');
  const limitChecks = m.coverage?.limitChecks ?? [];
  return {
    bid: { id: m.bid.id, name: m.bid.name, responsePages: m.bid.responsePages, lastCoverageAt: m.bid.lastCoverageAt },
    countsAllItems: m.coverage ? coverageCounts(m.rows) : null,
    countsMandatoryOnly: m.coverage ? coverageCounts(m.rows.filter((r) => r.strength === 'mandatory')) : null,
    countsNote: 'countsAllItems covers every requirement of the bid; countsMandatoryOnly covers only mandatory ones. "checked" counts the items the coverage check scores (requirements, instructions, evaluation items); limits and deadlines are not scored. Counts include manual and Rovo review verdicts. The missing and partial lists below are ' + (onlyMandatory ? 'mandatory items only' : 'items of every strength') + '.',
    note: m.coverage ? undefined : 'No coverage check has run yet. Run run-coverage-check with the response draft page ids.',
    limitBreaches: limitChecks.filter((l) => l.status === 'breach').length,
    limitChecks,
    deadlines: m.deadlines.map((d) => ({ date: d.isoDate ?? d.dateText, time: d.timeText, text: truncate(d.text, 200) })),
    missing: gaps.filter((r) => r.effectiveCoverage === 'missing').slice(0, 60).map(compactRow),
    partial: gaps.filter((r) => r.effectiveCoverage === 'partial').slice(0, 30).map(compactRow),
  };
});

export const runCoverageCheckAction = wrap(async (p) => {
  const pages = svc.splitList(str(p.responsePageIds));
  return svc.runCoverage(str(p.bid), pages.length ? pages : undefined, { includeChildren: bool(p.includeChildPages) });
});

export const updateRequirementAction = wrap(async (p, acc) => {
  const ids = svc.splitList(str(p.requirementIds));
  if (!ids.length) return { error: 'requirementIds is required (comma-separated)' };
  const status = oneOf<WorkStatus>(p.status, STATUSES)[0];
  const ownerAcc = str(p.ownerAccountId), ownerName = str(p.ownerName);
  return svc.updateRequirements(str(p.bid), ids, { status, owner: ownerAcc || ownerName ? { accountId: ownerAcc, name: ownerName } : undefined, note: str(p.note) }, acc);
});

export const linkEvidenceAction = wrap(async (p, acc) => {
  const id = str(p.requirementId), page = str(p.pageId), excerpt = str(p.excerpt);
  if (!id || !page || !excerpt) return { error: 'requirementId, pageId and excerpt are required' };
  return svc.linkEvidence(str(p.bid), id, page, excerpt, acc);
});

export const recordReviewAction = wrap(async (p) => {
  const id = str(p.requirementId), verdict = str(p.verdict)?.toLowerCase() as CoverageStatus | undefined, rationale = str(p.rationale) ?? '';
  if (!id || !verdict) return { error: 'requirementId and verdict (covered, partial, missing) are required' };
  return svc.recordReview(str(p.bid), id, verdict, rationale, 'rovo');
});

export const getMatchCandidatesAction = wrap(async (p) => {
  const id = str(p.requirementId);
  if (!id) return { error: 'requirementId is required' };
  const d = await svc.requirementDetail(str(p.bid), id);
  return {
    requirement: { id: d.requirement.id, text: d.requirement.text, leadIn: d.requirement.leadIn, strength: d.requirement.strength, section: d.requirement.sectionRef + ' ' + d.requirement.sectionTitle },
    deterministic: d.coverage ? { status: d.coverage.status, score: d.coverage.score } : null,
    candidates: (d.coverage?.evidence ?? []).map((e) => ({ pageId: e.docId, page: e.docTitle, heading: e.headingPath.join(' > '), excerpt: e.excerpt, score: e.score, matchedTerms: e.matchedTerms })),
    instruction: 'Judge whether the candidates answer the requirement. Then call record-review with verdict covered, partial or missing and a one-sentence rationale.',
  };
});

export const getOutlinePlanAction = wrap(async (p) => svc.outline(str(p.bid), num(p.totalPages)));

export const exportMatrixPageAction = wrap(async (p) => svc.exportMatrix(str(p.bid), str(p.parentPageId) ?? p.context?.confluence?.contentId));

export const createJiraTasksAction = wrap(async (p) => {
  const scope = (oneOf(p.scope, ['uncovered-mandatory', 'section', 'ids'] as const)[0]) ?? undefined;
  return svc.createJiraTasks(str(p.bid), {
    projectKey: str(p.projectKey) ?? '', scope, section: str(p.section), requirementIds: svc.splitList(str(p.requirementIds)),
    groupBy: str(p.groupBy) === 'section' ? 'section' : 'requirement', dryRun: bool(p.dryRun), max: num(p.max),
  });
});
