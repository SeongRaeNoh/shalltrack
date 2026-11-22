// Jira REST calls: projects, issue types, issue creation. Jira is an optional connected app (app.compatibility).
import api, { route } from '@forge/api';
import { ProductError } from './confluence';

export interface JiraProject { key: string; name: string; id: string }

async function check(res: { ok: boolean; status: number; text(): Promise<string> }, what: string): Promise<void> {
  if (!res.ok) throw new ProductError(what + ' failed with HTTP ' + res.status + ': ' + (await res.text()).slice(0, 300), res.status);
}

export async function listProjects(): Promise<JiraProject[]> {
  const res = await api.asUser().requestJira(route`/rest/api/3/project/search?maxResults=50&orderBy=name`, { headers: { Accept: 'application/json' } });
  await check(res, 'Listing Jira projects');
  const j = (await res.json()) as { values?: Array<{ key: string; name: string; id: string }> };
  return (j.values ?? []).map((p) => ({ key: p.key, name: p.name, id: p.id }));
}

/** Prefer "Task"; otherwise the first standard (non-subtask) issue type of the project. */
export async function pickIssueType(projectKey: string): Promise<{ id: string; name: string }> {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`, { headers: { Accept: 'application/json' } });
  await check(res, 'Reading issue types of ' + projectKey);
  const j = (await res.json()) as { issueTypes?: Array<{ id: string; name: string; subtask?: boolean }>; values?: Array<{ id: string; name: string; subtask?: boolean }> };
  const types = (j.issueTypes ?? j.values ?? []).filter((t) => !t.subtask);
  const t = types.find((x) => x.name.toLowerCase() === 'task') ?? types[0];
  if (!t) throw new ProductError('Project ' + projectKey + ' has no standard issue type', 400);
  return { id: t.id, name: t.name };
}

function adfParagraphs(lines: string[]): unknown {
  return { type: 'doc', version: 1, content: lines.filter(Boolean).map((l) => ({ type: 'paragraph', content: [{ type: 'text', text: l.slice(0, 2000) }] })) };
}

/**
 * Create several work items with one request (POST /rest/api/3/issue/bulk, at most 50).
 * Returns one entry per input item, null where Jira rejected the item.
 * One request instead of one per item keeps the Rovo action well under its time limit; a timed-out action is retried by Rovo.
 */
export async function createIssues(projectKey: string, issueTypeId: string, items: Array<{ summary: string; lines: string[]; labels: string[] }>): Promise<Array<{ key: string; id: string } | null>> {
  if (!items.length) return [];
  if (items.length > 50) throw new ProductError('At most 50 work items can be created at once', 400);
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/bulk`, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ issueUpdates: items.map((it) => ({ fields: { project: { key: projectKey }, issuetype: { id: issueTypeId }, summary: it.summary.slice(0, 250), description: adfParagraphs(it.lines), labels: it.labels } })) }),
  });
  await check(res, 'Creating Jira work items in ' + projectKey);
  const j = (await res.json()) as { issues?: Array<{ key: string; id: string }>; errors?: Array<{ failedElementNumber: number }> };
  const failed = new Set((j.errors ?? []).map((e) => e.failedElementNumber));
  const issues = j.issues ?? [];
  let next = 0;
  return items.map((_, i) => (failed.has(i) ? null : issues[next++] ?? null));
}

/** Work items of a project with a label whose summary starts with "[requirement id]": requirement id -> work item key. */
export async function findIssuesByLabel(projectKey: string, label: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const jql = 'project = "' + projectKey.replace(/"/g, '') + '" AND labels = "' + label.replace(/"/g, '') + '" ORDER BY key ASC';
  let token: string | undefined;
  for (let page = 0; page < 5; page++) {
    const res = token
      ? await api.asUser().requestJira(route`/rest/api/3/search/jql?jql=${jql}&fields=summary&maxResults=100&nextPageToken=${token}`, { headers: { Accept: 'application/json' } })
      : await api.asUser().requestJira(route`/rest/api/3/search/jql?jql=${jql}&fields=summary&maxResults=100`, { headers: { Accept: 'application/json' } });
    await check(res, 'Searching Jira work items in ' + projectKey);
    const j = (await res.json()) as { issues?: Array<{ key: string; fields?: { summary?: string } }>; nextPageToken?: string };
    for (const i of j.issues ?? []) {
      const m = /^\[([^\]\s]+)\]/.exec(i.fields?.summary ?? '');
      if (m && !out.has(m[1])) out.set(m[1], i.key);
    }
    if (!j.nextPageToken) break;
    token = j.nextPageToken;
  }
  return out;
}

export async function createIssue(projectKey: string, issueTypeId: string, summary: string, descriptionLines: string[], labels: string[]): Promise<{ key: string; id: string }> {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue`, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { project: { key: projectKey }, issuetype: { id: issueTypeId }, summary: summary.slice(0, 250), description: adfParagraphs(descriptionLines), labels } }),
  });
  await check(res, 'Creating a Jira work item in ' + projectKey);
  const j = (await res.json()) as { key: string; id: string };
  return { key: j.key, id: j.id };
}
