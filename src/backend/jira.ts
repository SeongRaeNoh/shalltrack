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

export async function createIssue(projectKey: string, issueTypeId: string, summary: string, descriptionLines: string[], labels: string[]): Promise<{ key: string; id: string }> {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue`, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { project: { key: projectKey }, issuetype: { id: issueTypeId }, summary: summary.slice(0, 250), description: adfParagraphs(descriptionLines), labels } }),
  });
  await check(res, 'Creating a Jira work item in ' + projectKey);
  const j = (await res.json()) as { key: string; id: string };
  return { key: j.key, id: j.id };
}
