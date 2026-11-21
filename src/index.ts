// Forge entry point: the UI resolver and one handler per Rovo action / MCP tool.
import Resolver from '@forge/resolver';
import * as svc from './backend/service';
import * as store from './backend/store';
import type { MatrixFilter } from './core';

const resolver = new Resolver();

type Ctx = { accountId?: string };
function define<P>(name: string, fn: (payload: P, accountId?: string) => Promise<unknown>) {
  resolver.define(name, async (req) => {
    try {
      return { ok: true, data: await fn((req.payload ?? {}) as P, (req.context as Ctx)?.accountId) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}

define('listBids', async () => svc.listBids());
define<svc.ImportInput>('createBid', (p, acc) => svc.createBid(p, acc));
define<{ bidId: string }>('reimportBid', (p) => svc.reimportBid(p.bidId));
define<{ bidId: string }>('deleteBid', (p) => svc.deleteBid(p.bidId));
define<{ pageRef: string }>('previewPage', (p) => svc.previewPage(p.pageRef));
define<{ bidId?: string; filter?: MatrixFilter }>('getMatrix', (p) => svc.getMatrix(p.bidId, p.filter ?? {}));
define<{ bidId: string; reqIds: string[]; patch: svc.RequirementPatch }>('updateRequirements', (p, acc) => svc.updateRequirements(p.bidId, p.reqIds, p.patch, acc));
define<{ bidId: string; pageRefs: string[]; includeChildren?: boolean; wordsPerPage?: number }>('runCoverage', (p) => svc.runCoverage(p.bidId, p.pageRefs, { includeChildren: p.includeChildren, wordsPerPage: p.wordsPerPage }));
define<{ bidId: string; reqId: string; pageRef: string; excerpt: string }>('linkEvidence', (p, acc) => svc.linkEvidence(p.bidId, p.reqId, p.pageRef, p.excerpt, acc));
define<{ bidId: string; reqId: string; verdict: 'covered' | 'partial' | 'missing'; rationale: string }>('recordReview', (p) => svc.recordReview(p.bidId, p.reqId, p.verdict, p.rationale, 'user'));
define<{ bidId: string; reqId: string }>('requirementDetail', (p) => svc.requirementDetail(p.bidId, p.reqId));
define<{ bidId: string; totalPages?: number }>('outline', (p) => svc.outline(p.bidId, p.totalPages));
define<{ bidId: string; parentPageRef?: string }>('exportMatrix', (p) => svc.exportMatrix(p.bidId, p.parentPageRef));
define<{ bidId: string } & svc.JiraTaskInput>('createJiraTasks', (p) => svc.createJiraTasks(p.bidId, p));
define<{ issueKey: string }>('issueContext', (p) => svc.issueContext(p.issueKey));
define('listJiraProjects', () => svc.listJiraProjects());
define<{ bidId: string; limitId: string; docId?: string; heading?: string }>('setLimitMapping', async (p) => {
  const bid = await svc.resolveBid(p.bidId);
  if (p.docId) bid.limitMapping[p.limitId] = { docId: p.docId, heading: p.heading || undefined };
  else delete bid.limitMapping[p.limitId];
  await store.saveBid(bid);
  return bid.limitMapping;
});

export const resolverHandler = resolver.getDefinitions();

export {
  listBidsAction, importRfpPageAction, listRequirementsAction, getRequirementAction, getCoverageReportAction, runCoverageCheckAction,
  updateRequirementAction, linkEvidenceAction, recordReviewAction, getMatchCandidatesAction, getOutlinePlanAction, exportMatrixPageAction,
  createJiraTasksAction,
} from './backend/actions';
