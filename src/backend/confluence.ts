// Confluence REST calls (v2 pages API). Calls run as the current user so page permissions are respected.
import api, { route } from '@forge/api';

export interface PageContent { id: string; title: string; spaceId?: string; version: number; storage: string; webui?: string }

export class ProductError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function ok(res: { ok: boolean; status: number; text(): Promise<string> }, what: string): Promise<void> {
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new ProductError(what + ' failed with HTTP ' + res.status + (body ? ': ' + body : ''), res.status);
  }
}

/** Accepts a page id or a Confluence page URL and returns the numeric id. */
export function parsePageRef(ref: string): string | null {
  const s = ref.trim();
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/\/pages\/(\d+)/) || s.match(/[?&]pageId=(\d+)/);
  return m ? m[1] : null;
}

export async function getPage(pageId: string): Promise<PageContent> {
  const res = await api.asUser().requestConfluence(route`/wiki/api/v2/pages/${pageId}?body-format=storage`, { headers: { Accept: 'application/json' } });
  await ok(res, 'Reading page ' + pageId);
  const j = (await res.json()) as { id: string; title: string; spaceId?: string; version?: { number: number }; body?: { storage?: { value?: string } }; _links?: { webui?: string } };
  return { id: j.id, title: j.title, spaceId: j.spaceId, version: j.version?.number ?? 1, storage: j.body?.storage?.value ?? '', webui: j._links?.webui };
}

export async function getChildPageIds(pageId: string, limit = 50): Promise<Array<{ id: string; title: string }>> {
  const res = await api.asUser().requestConfluence(route`/wiki/api/v2/pages/${pageId}/children?limit=${limit}`, { headers: { Accept: 'application/json' } });
  await ok(res, 'Listing child pages of ' + pageId);
  const j = (await res.json()) as { results?: Array<{ id: string; title: string }> };
  return (j.results ?? []).map((r) => ({ id: r.id, title: r.title }));
}

export async function createPage(spaceId: string, parentId: string | undefined, title: string, storage: string): Promise<PageContent> {
  const body: Record<string, unknown> = { spaceId, status: 'current', title, body: { representation: 'storage', value: storage } };
  if (parentId) body.parentId = parentId;
  const res = await api.asUser().requestConfluence(route`/wiki/api/v2/pages`, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  await ok(res, 'Creating page "' + title + '"');
  const j = (await res.json()) as { id: string; title: string; spaceId: string; version?: { number: number }; _links?: { webui?: string } };
  return { id: j.id, title: j.title, spaceId: j.spaceId, version: j.version?.number ?? 1, storage, webui: j._links?.webui };
}

export async function updatePage(page: PageContent, title: string, storage: string): Promise<PageContent> {
  const res = await api.asUser().requestConfluence(route`/wiki/api/v2/pages/${page.id}`, {
    method: 'PUT', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: page.id, status: 'current', title, body: { representation: 'storage', value: storage }, version: { number: page.version + 1, message: 'Updated by ShallTrack' } }),
  });
  await ok(res, 'Updating page ' + page.id);
  const j = (await res.json()) as { id: string; title: string; spaceId: string; version?: { number: number }; _links?: { webui?: string } };
  return { id: j.id, title: j.title, spaceId: j.spaceId, version: j.version?.number ?? page.version + 1, storage, webui: j._links?.webui };
}
