// Persistence in the Forge Key-Value Store. Large arrays are split into chunks below the 240 KiB value limit.
import { kvs } from '@forge/kvs';
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
  const prev = await getBid(bid.id);
  if (reqs) bid.reqChunks = await writeChunks(k.req(bid.id), reqs, prev?.reqChunks ?? 0);
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
  await kvs.set(k.covMeta(bid.id), { generatedAt: report.generatedAt, limitChecks: report.limitChecks, summary: report.summary });
  bid.lastCoverageAt = report.generatedAt;
  await kvs.set(k.meta(bid.id), bid);
  return bid;
}

export async function getCoverage(bid: Bid): Promise<CoverageReport | null> {
  const meta = await kvs.get<Omit<CoverageReport, 'items'>>(k.covMeta(bid.id));
  if (!meta) return null;
  const items = await readChunks<CoverageItem>(k.cov(bid.id), bid.covChunks ?? 0);
  return { ...meta, items };
}

export async function linkIssue(issueKey: string, bidId: string, reqIds: string[]): Promise<void> {
  await kvs.set(k.jira(issueKey), { bidId, reqIds });
}

export async function getIssueLink(issueKey: string): Promise<{ bidId: string; reqIds: string[] } | undefined> {
  return kvs.get(k.jira(issueKey));
}
