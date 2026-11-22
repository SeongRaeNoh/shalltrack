// Persistence in the Forge Key-Value Store. Large arrays are split into chunks below the 240 KiB value limit.
import { kvs } from '@forge/kvs';
import { slimCoverageItems } from '../core';
import type { CoverageItem, CoverageReport, Deadline, ExtractionStats, FactorSet, Limit, ReqState, Requirement } from '../core';

export interface SourceRefMeta { kind: 'page' | 'paste'; pageId?: string; title: string; url?: string; spaceId?: string }

export interface Bid {
  id: string;
  name: string;
  createdAt: string;
  createdBy?: string;
  updatedAt: string;
  sources: SourceRefMeta[];
  responsePages: Array<{ pageId: string; title: string; includeChildren?: boolean }>;
  jiraProjectKey?: string;
  exportPageId?: string;
  wordsPerPage: number;
  limitMapping: Record<string, { docId: string; heading?: string }>;
  stats: ExtractionStats;
  factors: FactorSet;
  limits: Limit[];
  deadlines: Deadline[];
  reqChunks: number;
  covChunks: number;
  /** Chunks of the coverage items with only the best evidence entry (what the matrix rows need). Absent for coverage saved before 2.6.0. */
  covSlimChunks?: number;
  lastCoverageAt?: string;
}

export interface BidIndexEntry { id: string; name: string; createdAt: string; requirements: number; mandatory: number }

const MAX_CHUNK_BYTES = 180 * 1024;

export function chunkBySize<T>(items: T[], maxBytes = MAX_CHUNK_BYTES): T[][] {
  const chunks: T[][] = [];
  let cur: T[] = [];
  let size = 2;
  for (const it of items) {
    const s = JSON.stringify(it).length + 1;
    if (cur.length && size + s > maxBytes) { chunks.push(cur); cur = []; size = 2; }
    cur.push(it);
    size += s;
  }
  if (cur.length || !chunks.length) chunks.push(cur);
  return chunks;
}

async function writeChunks<T>(prefix: string, items: T[], previous: number): Promise<number> {
  const chunks = chunkBySize(items);
  const batch = chunks.map((c, i) => ({ key: prefix + i, value: c }));
  for (let i = 0; i < batch.length; i += 20) await kvs.batchSet(batch.slice(i, i + 20));
  for (let i = chunks.length; i < previous; i++) await kvs.delete(prefix + i);
  return chunks.length;
}

async function readChunks<T>(prefix: string, n: number): Promise<T[]> {
  const parts = await Promise.all(Array.from({ length: n }, (_, i) => kvs.get<T[]>(prefix + i)));
  return parts.flatMap((p) => p ?? []);
}

const k = {
  index: 'bids',
  meta: (id: string) => 'bid:' + id + ':meta',
  req: (id: string) => 'bid:' + id + ':req:',
  state: (id: string) => 'bid:' + id + ':state',
  cov: (id: string) => 'bid:' + id + ':cov:',
  covSlim: (id: string) => 'bid:' + id + ':covs:',
  covMeta: (id: string) => 'bid:' + id + ':covmeta',
  jira: (key: string) => 'jira:' + key,
};

export async function listBids(): Promise<BidIndexEntry[]> {
  return (await kvs.get<BidIndexEntry[]>(k.index)) ?? [];
}

export async function getBid(id: string): Promise<Bid | undefined> {
  return kvs.get<Bid>(k.meta(id));
}

export async function saveBid(bid: Bid, reqs?: Requirement[]): Promise<Bid> {
  // the previous chunk count is needed only when the requirements are rewritten
  if (reqs) bid.reqChunks = await writeChunks(k.req(bid.id), reqs, (await getBid(bid.id))?.reqChunks ?? 0);
  bid.updatedAt = new Date().toISOString();
  await kvs.set(k.meta(bid.id), bid);
  const index = (await listBids()).filter((b) => b.id !== bid.id);
  index.unshift({ id: bid.id, name: bid.name, createdAt: bid.createdAt, requirements: bid.stats.requirements, mandatory: bid.stats.byStrength.mandatory });
  await kvs.set(k.index, index.slice(0, 200));
  return bid;
}

export async function deleteBid(id: string): Promise<void> {
  const bid = await getBid(id);
  if (!bid) return;
  for (let i = 0; i < bid.reqChunks; i++) await kvs.delete(k.req(id) + i);
  for (let i = 0; i < bid.covChunks; i++) await kvs.delete(k.cov(id) + i);
  for (let i = 0; i < (bid.covSlimChunks ?? 0); i++) await kvs.delete(k.covSlim(id) + i);
  await kvs.delete(k.state(id));
  await kvs.delete(k.covMeta(id));
  await kvs.delete(k.meta(id));
  await kvs.set(k.index, (await listBids()).filter((b) => b.id !== id));
}

export async function getRequirements(bid: Bid): Promise<Requirement[]> {
  return readChunks<Requirement>(k.req(bid.id), bid.reqChunks);
}

export async function getState(bidId: string): Promise<Record<string, ReqState>> {
  return (await kvs.get<Record<string, ReqState>>(k.state(bidId))) ?? {};
}

export async function saveState(bidId: string, state: Record<string, ReqState>): Promise<void> {
  await kvs.set(k.state(bidId), state);
}

/** Store a coverage report; evidence excerpts are shortened to keep chunks small. */
export async function saveCoverage(bid: Bid, report: CoverageReport): Promise<Bid> {
  const items: CoverageItem[] = report.items.map((i) => ({ ...i, evidence: i.evidence.slice(0, 3).map((e) => ({ ...e, excerpt: e.excerpt.slice(0, 280), matchedTerms: e.matchedTerms.slice(0, 12) })) }));
  bid.covChunks = await writeChunks(k.cov(bid.id), items, bid.covChunks ?? 0);
  bid.covSlimChunks = await writeChunks(k.covSlim(bid.id), slimCoverageItems(items), bid.covSlimChunks ?? 0);
  await kvs.set(k.covMeta(bid.id), { generatedAt: report.generatedAt, limitChecks: report.limitChecks, summary: report.summary });
  bid.lastCoverageAt = report.generatedAt;
  await kvs.set(k.meta(bid.id), bid);
  return bid;
}

/**
 * The stored coverage report. evidence 'best' reads the slim items (only the best evidence entry), which is all that
 * the matrix rows use; it falls back to the full items for coverage saved before the slim chunks existed.
 */
export async function getCoverage(bid: Bid, evidence: 'all' | 'best' = 'all'): Promise<CoverageReport | null> {
  const meta = await kvs.get<Omit<CoverageReport, 'items'>>(k.covMeta(bid.id));
  if (!meta) return null;
  const slim = evidence === 'best' && bid.covSlimChunks !== undefined;
  const items = slim ? await readChunks<CoverageItem>(k.covSlim(bid.id), bid.covSlimChunks ?? 0) : await readChunks<CoverageItem>(k.cov(bid.id), bid.covChunks ?? 0);
  return { ...meta, items };
}

/** Read chunks one after another and stop at the first item that matches, so a lookup of one item skips the later chunks. */
async function findInChunks<T>(prefix: string, n: number, match: (item: T) => boolean): Promise<T | undefined> {
  for (let i = 0; i < n; i++) {
    const hit = ((await kvs.get<T[]>(prefix + i)) ?? []).find(match);
    if (hit) return hit;
  }
  return undefined;
}

export async function findRequirement(bid: Bid, reqId: string): Promise<Requirement | undefined> {
  return findInChunks<Requirement>(k.req(bid.id), bid.reqChunks, (r) => r.id === reqId);
}

/** The full coverage item (up to three evidence entries) of one requirement, or undefined when no check has run. */
export async function findCoverageItem(bid: Bid, reqId: string): Promise<CoverageItem | undefined> {
  if (!bid.lastCoverageAt) return undefined;
  return findInChunks<CoverageItem>(k.cov(bid.id), bid.covChunks ?? 0, (i) => i.requirementId === reqId);
}

export async function linkIssue(issueKey: string, bidId: string, reqIds: string[]): Promise<void> {
  await kvs.set(k.jira(issueKey), { bidId, reqIds });
}

export async function getIssueLink(issueKey: string): Promise<{ bidId: string; reqIds: string[] } | undefined> {
  return kvs.get(k.jira(issueKey));
}
