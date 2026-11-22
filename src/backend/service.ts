// Operations shared by the UI resolvers, the Rovo actions and the MCP tools.
import {
  CoverageStatus, MatrixFilter, ReqState, ReqType, Requirement, SourceDoc, Strength, WorkStatus,
  buildOutline, buildRows, checkCoverage, extractRequirements, filterRows, hash36, sectionsOf, slug, storageToBlocks,
  summarize, textToBlocks, toStorageTable, truncate, MatrixRow,
} from '../core';
import * as store from './store';
import * as conf from './confluence';
import * as jira from './jira';

export class UserError extends Error {}

const MAX_SOURCE_PAGES = 10;
const MAX_RESPONSE_PAGES = 25;

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function splitList(s?: string | string[]): string[] {
  if (!s) return [];
  const arr = Array.isArray(s) ? s : s.split(/[\s,;]+/);
  return arr.map((x) => x.trim()).filter(Boolean);
}

export async function resolveBid(ref?: string): Promise<store.Bid> {
  const bids = await store.listBids();
  if (!bids.length) throw new UserError('No bids yet. Import an RFP first: open ShallTrack in Confluence, or ask the agent to import an RFP page.');
  const r = ref?.trim().toLowerCase();
  const entry = r
    ? bids.find((b) => b.id === ref) ?? bids.find((b) => b.name.toLowerCase() === r) ?? bids.find((b) => b.name.toLowerCase().includes(r))
    : bids[0];
  if (!entry) throw new UserError('No bid matches "' + ref + '". Known bids: ' + bids.map((b) => b.name + ' (' + b.id + ')').join('; '));
  const bid = await store.getBid(entry.id);
  if (!bid) throw new UserError('Bid ' + entry.id + ' has no stored data.');
  return bid;
}

async function loadPages(refs: string[]): Promise<{ docs: SourceDoc[]; metas: store.SourceRefMeta[]; spaceId?: string }> {
  const ids = refs.map((r) => conf.parsePageRef(r)).filter((x): x is string => !!x).slice(0, MAX_SOURCE_PAGES);
  if (refs.length && !ids.length) throw new UserError('Could not read a Confluence page id from: ' + refs.join(', '));
  const pages = await Promise.all(ids.map((id) => conf.getPage(id)));
  return {
    docs: pages.map((p) => ({ id: p.id, title: p.title, blocks: storageToBlocks(p.storage) })),
    metas: pages.map((p) => ({ kind: 'page', pageId: p.id, title: p.title, url: p.webui, spaceId: p.spaceId })),
    spaceId: pages[0]?.spaceId,
  };
}

export interface ImportInput { name?: string; pageRefs?: string[]; pastedText?: string; pastedTitle?: string }

export async function createBid(input: ImportInput, accountId?: string) {
  const { docs, metas } = await loadPages(input.pageRefs ?? []);
  if (input.pastedText && input.pastedText.trim()) {
    const id = 'paste-' + hash36(input.pastedText.slice(0, 5000));
    const title = input.pastedTitle?.trim() || 'Pasted text';
    docs.push({ id, title, blocks: textToBlocks(input.pastedText) });
    metas.push({ kind: 'paste', title });
  }
  if (!docs.length) throw new UserError('Give at least one Confluence page or some pasted RFP text.');
  const result = extractRequirements(docs);
  const now = new Date().toISOString();
  const bid: store.Bid = {
    id: newId(), name: input.name?.trim() || docs[0].title, createdAt: now, createdBy: accountId, updatedAt: now,
    sources: metas, responsePages: [], wordsPerPage: 500, limitMapping: {}, stats: result.stats, factors: result.factors,
    limits: result.limits, deadlines: result.deadlines, reqChunks: 0, covChunks: 0,
  };
  await store.saveBid(bid, result.requirements);
  await store.saveState(bid.id, {});
  return { bid: bidSummary(bid), stats: result.stats };
}

/** Re-read the source pages; keep owner/status for requirement ids that still exist. */
export async function reimportBid(bidRef: string) {
  const bid = await resolveBid(bidRef);
  const old = await store.getRequirements(bid);
  const pageRefs = bid.sources.filter((s) => s.kind === 'page' && s.pageId).map((s) => s.pageId!);
  const { docs } = await loadPages(pageRefs);
  const result = extractRequirements(docs);
  const pasted = old.filter((r) => r.source.docId.startsWith('paste-'));
  const reqs = [...result.requirements, ...pasted.filter((p) => !result.requirements.some((r) => r.id === p.id))];
  reqs.forEach((r, i) => (r.seq = i + 1));
  const oldIds = new Set(old.map((r) => r.id));
  const newIds = new Set(reqs.map((r) => r.id));
  const state = await store.getState(bid.id);
  for (const id of Object.keys(state)) if (!newIds.has(id)) delete state[id];
  await store.saveState(bid.id, state);
  Object.assign(bid, { stats: { ...result.stats, requirements: reqs.length }, factors: result.factors, limits: result.limits, deadlines: result.deadlines });
  await store.saveBid(bid, reqs);
  return {
    bid: bidSummary(bid),
    added: reqs.filter((r) => !oldIds.has(r.id)).map((r) => r.id),
    removed: old.filter((r) => !newIds.has(r.id)).map((r) => r.id),
  };
}

export function bidSummary(bid: store.Bid) {
  return {
    id: bid.id, name: bid.name, createdAt: bid.createdAt, updatedAt: bid.updatedAt, sources: bid.sources, responsePages: bid.responsePages,
    requirements: bid.stats.requirements, byStrength: bid.stats.byStrength, byType: bid.stats.byType, duplicatesMerged: bid.stats.duplicatesMerged,
    lastCoverageAt: bid.lastCoverageAt, jiraProjectKey: bid.jiraProjectKey, exportPageId: bid.exportPageId, wordsPerPage: bid.wordsPerPage,
  };
}

export async function listBids() {
  return store.listBids();
}

async function loadAll(bid: store.Bid) {
  const [reqs, state, coverage] = await Promise.all([store.getRequirements(bid), store.getState(bid.id), store.getCoverage(bid)]);
  return { reqs, state, coverage, rows: buildRows(reqs, state, coverage) };
}

export async function getMatrix(bidRef: string | undefined, filter: MatrixFilter = {}, page: { offset?: number; limit?: number } = {}) {
  const bid = await resolveBid(bidRef);
  const { rows, coverage } = await loadAll(bid);
  const filtered = filterRows(rows, filter);
  const offset = Math.max(0, page.offset ?? 0);
  const limit = Math.min(1000, Math.max(1, page.limit ?? 1000));
  return {
    bid: bidSummary(bid),
    summary: summarize(rows),
    filteredSummary: summarize(filtered),
    sections: sectionsOf(rows),
    total: filtered.length,
    rows: filtered.slice(offset, offset + limit),
    factors: bid.factors,
    limits: bid.limits,
    deadlines: bid.deadlines,
    coverage: coverage ? { generatedAt: coverage.generatedAt, summary: coverage.summary, limitChecks: coverage.limitChecks } : null,
  };
}

export interface RequirementPatch { status?: WorkStatus; owner?: { accountId?: string; name?: string } | null; note?: string }

export async function updateRequirements(bidRef: string | undefined, reqIds: string[], patch: RequirementPatch, accountId?: string) {
  const bid = await resolveBid(bidRef);
  const reqs = await store.getRequirements(bid);
  const known = new Set(reqs.map((r) => r.id));
  const unknown = reqIds.filter((id) => !known.has(id));
  const state = await store.getState(bid.id);
  const now = new Date().toISOString();
  const changed: string[] = [];
  for (const id of reqIds) {
    if (!known.has(id)) continue;
    const st: ReqState = state[id] ?? { status: 'open' };
    if (patch.status) st.status = patch.status;
    if (patch.owner === null) delete st.owner;
    else if (patch.owner) st.owner = patch.owner;
    if (patch.note !== undefined) st.note = patch.note.slice(0, 2000);
    st.updatedAt = now;
    st.updatedBy = accountId;
    state[id] = st;
    changed.push(id);
  }
  await store.saveState(bid.id, state);
  return { changed, unknown };
}

export async function setResponsePages(bidRef: string | undefined, pageRefs: string[], includeChildren = false) {
  const bid = await resolveBid(bidRef);
  const ids = pageRefs.map((r) => conf.parsePageRef(r)).filter((x): x is string => !!x).slice(0, MAX_RESPONSE_PAGES);
  const pages = await Promise.all(ids.map((id) => conf.getPage(id)));
  bid.responsePages = pages.map((p) => ({ pageId: p.id, title: p.title, includeChildren }));
  await store.saveBid(bid);
  return bidSummary(bid);
}

export async function runCoverage(bidRef: string | undefined, pageRefs?: string[], opts: { includeChildren?: boolean; wordsPerPage?: number } = {}) {
  let bid = await resolveBid(bidRef);
  if (pageRefs && pageRefs.length) bid = await resolveBid((await setResponsePages(bid.id, pageRefs, opts.includeChildren)).id);
  if (opts.wordsPerPage && opts.wordsPerPage >= 100 && opts.wordsPerPage <= 2000) bid.wordsPerPage = opts.wordsPerPage;
  if (!bid.responsePages.length) throw new UserError('No response draft pages are set for bid "' + bid.name + '". Give the page ids of the proposal draft.');
  const ids: string[] = [];
  for (const p of bid.responsePages) {
    ids.push(p.pageId);
    if (p.includeChildren) for (const c of await conf.getChildPageIds(p.pageId)) ids.push(c.id);
  }
  const unique = Array.from(new Set(ids)).slice(0, MAX_RESPONSE_PAGES);
  const pages = await Promise.all(unique.map((id) => conf.getPage(id)));
  const docs: SourceDoc[] = pages.map((p) => ({ id: p.id, title: p.title, blocks: storageToBlocks(p.storage) }));
  const reqs = await store.getRequirements(bid);
  const report = checkCoverage(reqs, docs, bid.limits, { wordsPerPage: bid.wordsPerPage, limitMapping: bid.limitMapping });
  await store.saveCoverage(bid, report);
  return { bid: bidSummary(bid), summary: report.summary, limitChecks: report.limitChecks, pagesChecked: pages.map((p) => ({ id: p.id, title: p.title })) };
}

export async function linkEvidence(bidRef: string | undefined, reqId: string, pageRef: string, excerpt: string, accountId?: string) {
  const bid = await resolveBid(bidRef);
  const pageId = conf.parsePageRef(pageRef);
  if (!pageId) throw new UserError('Not a Confluence page id or URL: ' + pageRef);
  const page = await conf.getPage(pageId);
  const reqs = await store.getRequirements(bid);
  if (!reqs.some((r) => r.id === reqId)) throw new UserError('Unknown requirement id ' + reqId);
  const state = await store.getState(bid.id);
  const st: ReqState = state[reqId] ?? { status: 'open' };
  st.evidence = { pageId: page.id, pageTitle: page.title, excerpt: excerpt.slice(0, 600), linkedBy: accountId, at: new Date().toISOString() };
  if (st.status === 'open') st.status = 'addressed';
  state[reqId] = st;
  await store.saveState(bid.id, state);
  return { requirementId: reqId, evidence: st.evidence, status: st.status };
}

export async function recordReview(bidRef: string | undefined, reqId: string, verdict: CoverageStatus, rationale: string, reviewer: 'rovo' | 'user') {
  if (!['covered', 'partial', 'missing'].includes(verdict)) throw new UserError('verdict must be covered, partial or missing');
  const bid = await resolveBid(bidRef);
  const reqs = await store.getRequirements(bid);
  if (!reqs.some((r) => r.id === reqId)) throw new UserError('Unknown requirement id ' + reqId);
  const state = await store.getState(bid.id);
  const st: ReqState = state[reqId] ?? { status: 'open' };
  st.review = { verdict, rationale: rationale.slice(0, 1000), reviewer, at: new Date().toISOString() };
  state[reqId] = st;
  await store.saveState(bid.id, state);
  return { requirementId: reqId, review: st.review };
}

export async function requirementDetail(bidRef: string | undefined, reqId: string) {
  const bid = await resolveBid(bidRef);
  const { reqs, state, coverage } = await loadAll(bid);
  const r = reqs.find((x) => x.id === reqId);
  if (!r) throw new UserError('Unknown requirement id ' + reqId);
  return { bid: { id: bid.id, name: bid.name }, requirement: r, state: state[reqId] ?? { status: 'open' }, coverage: coverage?.items.find((i) => i.requirementId === reqId) ?? null };
}

export async function outline(bidRef: string | undefined, totalPages?: number) {
  const bid = await resolveBid(bidRef);
  const reqs = await store.getRequirements(bid);
  const o = buildOutline(reqs, bid.limits, bid.factors.factors, { totalPages });
  const byId = new Map(reqs.map((r) => [r.id, r] as const));
  return {
    bid: { id: bid.id, name: bid.name },
    factors: bid.factors,
    sections: o.sections.map((s) => ({ ...s, requirements: s.requirementIds.slice(0, 40).map((id) => ({ id, strength: byId.get(id)?.strength, text: truncate(byId.get(id)?.text ?? '', 200) })) })),
    unplaced: o.unplaced.length,
    markdown: o.markdown,
  };
}

export async function exportMatrix(bidRef: string | undefined, parentPageRef?: string) {
  const bid = await resolveBid(bidRef);
  const { rows } = await loadAll(bid);
  const storage = toStorageTable(rows, { bidName: bid.name, generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC' });
  const title = 'Compliance matrix - ' + bid.name;
  let page: conf.PageContent | undefined;
  if (bid.exportPageId) {
    try { page = await conf.updatePage(await conf.getPage(bid.exportPageId), title, storage); } catch (e) { page = undefined; }
  }
  if (!page) {
    const parentId = (parentPageRef && conf.parsePageRef(parentPageRef)) || bid.sources.find((s) => s.pageId)?.pageId;
    if (!parentId) throw new UserError('Give a parent page for the export (the bid was created from pasted text).');
    const parent = await conf.getPage(parentId);
    if (!parent.spaceId) throw new UserError('Could not read the space of page ' + parentId);
    page = await conf.createPage(parent.spaceId, parent.id, title, storage);
    bid.exportPageId = page.id;
    await store.saveBid(bid);
  }
  return { pageId: page.id, title: page.title, url: page.webui, rows: rows.length };
}

export interface JiraTaskInput {
  projectKey: string;
  scope?: 'uncovered-mandatory' | 'section' | 'ids' | 'filtered';
  section?: string;
  requirementIds?: string[];
  filter?: MatrixFilter;
  groupBy?: 'requirement' | 'section';
  dryRun?: boolean;
  max?: number;
}

export async function createJiraTasks(bidRef: string | undefined, input: JiraTaskInput) {
  const bid = await resolveBid(bidRef);
  const { rows, state } = await loadAll(bid);
  let pick: MatrixRow[];
  const scope = input.scope ?? (input.requirementIds?.length ? 'ids' : 'uncovered-mandatory');
  if (scope === 'ids') pick = rows.filter((r) => input.requirementIds?.includes(r.id));
  else if (scope === 'section') pick = filterRows(rows, { section: input.section });
  else if (scope === 'filtered') pick = filterRows(rows, input.filter ?? {});
  else pick = rows.filter((r) => r.strength === 'mandatory' && (r.effectiveCoverage === 'missing' || r.effectiveCoverage === 'partial' || r.effectiveCoverage === 'unchecked') && r.status !== 'not-applicable');
  pick = pick.filter((r) => !r.jiraKey);
  const max = Math.min(50, input.max ?? 25);
  const groups: Array<{ summary: string; rows: MatrixRow[] }> = [];
  if (input.groupBy === 'section') {
    const m = new Map<string, MatrixRow[]>();
    for (const r of pick) { const k = (r.sectionRef ? r.sectionRef + ' ' : '') + r.sectionTitle; m.set(k, [...(m.get(k) ?? []), r]); }
    for (const [k, rs] of m) groups.push({ summary: '[' + bid.name + '] Answer section ' + k + ' (' + rs.length + ' items)', rows: rs });
  } else {
    for (const r of pick) groups.push({ summary: '[' + r.id + '] ' + truncate(r.text, 180), rows: [r] });
  }
  const planned = groups.slice(0, max);
  if (input.dryRun) return { dryRun: true, wouldCreate: planned.map((g) => ({ summary: g.summary, requirementIds: g.rows.map((r) => r.id) })), skippedBeyondMax: Math.max(0, groups.length - max) };
  if (!input.projectKey) throw new UserError('projectKey is required to create Jira work items');
  const bidLabel = 'bid-' + slug(bid.name, 30).toLowerCase();
  // Rovo repeats an action that runs too long; a repeated call must link the work items that already exist instead of creating them again.
  const existing = input.groupBy === 'section' ? new Map<string, string>() : await jira.findIssuesByLabel(input.projectKey, bidLabel);
  const reused: Array<{ key: string; requirementIds: string[] }> = [];
  const todo: typeof planned = [];
  for (const g of planned) {
    const key = g.rows.length === 1 ? existing.get(g.rows[0].id) : undefined;
    if (key) reused.push({ key, requirementIds: [g.rows[0].id] });
    else todo.push(g);
  }
  const type = await jira.pickIssueType(input.projectKey);
  const results = await jira.createIssues(input.projectKey, type.id, todo.map((g) => {
    const lines = ['Created by ShallTrack for bid "' + bid.name + '".'];
    for (const r of g.rows) lines.push(r.id + ' (' + r.strength + ', ' + ((r.sectionRef ? r.sectionRef + ' ' : '') + r.sectionTitle) + '): ' + r.text);
    return { summary: g.summary, lines, labels: ['shalltrack', bidLabel] };
  }));
  const created: Array<{ key: string; requirementIds: string[] }> = [];
  const failed: string[] = [];
  todo.forEach((g, i) => {
    const issue = results[i];
    if (issue) created.push({ key: issue.key, requirementIds: g.rows.map((r) => r.id) });
    else failed.push(...g.rows.map((r) => r.id));
  });
  const linked = [...created, ...reused];
  for (const c of linked) for (const id of c.requirementIds) state[id] = { ...(state[id] ?? { status: 'open' }), jiraKey: c.key, status: state[id]?.status === 'open' || !state[id] ? 'in-progress' : state[id].status };
  await store.saveState(bid.id, state);
  for (let i = 0; i < linked.length; i += 10) await Promise.all(linked.slice(i, i + 10).map((c) => store.linkIssue(c.key, bid.id, c.requirementIds)));
  bid.jiraProjectKey = input.projectKey;
  await store.saveBid(bid);
  return { created, alreadyExisting: reused, failedRequirementIds: failed, skippedBeyondMax: Math.max(0, groups.length - max), issueType: type.name };
}

export async function issueContext(issueKey: string) {
  const link = await store.getIssueLink(issueKey);
  if (!link) return null;
  const bid = await store.getBid(link.bidId);
  if (!bid) return null;
  const { rows } = await loadAll(bid);
  return { bid: { id: bid.id, name: bid.name }, rows: rows.filter((r) => link.reqIds.includes(r.id)) };
}

export async function listJiraProjects() {
  return jira.listProjects();
}

export async function deleteBid(bidRef: string) {
  const bid = await resolveBid(bidRef);
  await store.deleteBid(bid.id);
  return { deleted: bid.id };
}

/** Preview of what an import would extract from one page, without saving. */
/** Up to 5 items that show what the matrix holds: mandatory requirements and instructions from numbered sections first, then one limit and one evaluation item. */
function previewSample<T extends { type: string; strength: string; sectionRef: string }>(reqs: T[]): T[] {
  const pick: T[] = [];
  const add = (xs: T[], n: number) => { for (const x of xs) { if (pick.length >= 5 || n <= 0) break; if (!pick.includes(x)) { pick.push(x); n--; } } };
  add(reqs.filter((x) => x.strength === 'mandatory' && x.sectionRef && (x.type === 'requirement' || x.type === 'instruction')), 3);
  add(reqs.filter((x) => x.type === 'limit'), 1);
  add(reqs.filter((x) => x.type === 'evaluation'), 1);
  add(reqs, 5 - pick.length);
  return pick.sort((a, b) => reqs.indexOf(a) - reqs.indexOf(b));
}

export async function previewPage(pageRef: string) {
  const { docs, metas } = await loadPages([pageRef]);
  const r = extractRequirements(docs);
  return { page: metas[0], stats: r.stats, sample: previewSample(r.requirements).map((x) => ({ id: x.id, strength: x.strength, type: x.type, text: truncate(x.text, 200) })), limits: r.limits.length, deadlines: r.deadlines.length, factors: r.factors.factors };
}

export const STRENGTHS: Strength[] = ['mandatory', 'expected', 'recommended', 'optional', 'informational'];
export const TYPES: ReqType[] = ['requirement', 'instruction', 'evaluation', 'limit', 'deadline'];
export const STATUSES: WorkStatus[] = ['open', 'in-progress', 'addressed', 'not-applicable'];

export type { Requirement };
