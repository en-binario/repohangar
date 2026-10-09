// mr-creation :: Related links — the update requests: one `PUT …/merge_requests/<iid>` with `description` on GitLab and
// one `PATCH …/pulls/<number>` with `body` on GitHub per review, and the scenario Description update fails.

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { batchEntry, entryDetail, writeRelatedLinks, type MrBatchEntry } from '../../src/mr/multi';
import { RELATED_END, RELATED_START } from '../../src/mr/related';
import { Http } from '../../src/providers/http';
import { ProviderFactory } from '../../src/providers/provider';
import { resultLine } from '../../src/shared/batchResult';
import type { RowData } from '../../src/shared/model';
import { billing, GH_TOKEN, GL_TOKEN, harness, webShop } from './flowHarness';
import { contractServer } from './helpers';
import { githubCreate, githubFollowUps, gitlabCreate, gitlabProject, noOpenReviews } from './createRoutes';

const { server, requests } = contractServer();

const GL_UPDATE = 'https://git.acme.com/api/v4/projects/payments%2Fbilling-api/merge_requests/142';
const GH_UPDATE = 'https://api.github.com/repos/acme/web-shop/pulls/311';

function updates(githubStatus = 200) {
  return [
    http.put(GL_UPDATE, () => HttpResponse.json({ iid: 142 })),
    http.patch(GH_UPDATE, () =>
      githubStatus >= 400 ? HttpResponse.json({ message: 'Resource not accessible by integration' }, { status: githubStatus }) : HttpResponse.json({ number: 311 }),
    ),
  ];
}

/** Creates `!142` in billing-api and `#311` in web-shop as one batch, then writes their related links. */
async function batch(githubStatus = 200) {
  server.use(...noOpenReviews(), gitlabProject(), gitlabCreate(), githubCreate(), ...githubFollowUps(), ...updates(githubStatus));
  const rows: RowData[] = [billing(), webShop()];
  const h = harness(rows, { user: { default: { reviewers: [], assignees: [], labels: [] } } });
  const entries = new Map<string, MrBatchEntry>();
  for (const r of rows) {
    const outcome = await h.flow.create(r.id, { batch: true });
    entries.set(r.id, batchEntry(outcome, { name: r.name, provider: r.provider === 'github' ? 'github' : 'gitlab', host: r.hosted?.host ?? '', projectPath: r.hosted?.projectPath ?? '' }));
  }
  const factory = new ProviderFactory(new Http());
  const tokens: Record<string, { token: string; apiHost: string }> = {
    'git.acme.com': { token: GL_TOKEN, apiHost: 'git.acme.com' },
    'github.com': { token: GH_TOKEN, apiHost: 'api.github.com' },
  };
  const outcome = await writeRelatedLinks(entries, {
    credential: async (host) => tokens[host],
    writer: (id, review) => factory.get(review.provider, review.host, new URL((rows.find((r) => r.id === id) as RowData).hosted?.webUrl as string).origin),
    concurrency: 6,
  });
  const line = (id: string) => {
    const r = rows.find((x) => x.id === id) as RowData;
    const entry = entries.get(id) as MrBatchEntry;
    const detail = entryDetail(entry, outcome.links.get(id) ?? { kind: 'none' });
    return resultLine('createMr', undefined, id, r.name, entry.result, { ...(detail === undefined ? {} : { detail }), review: true }).text;
  };
  return { outcome, line };
}

describe('related links update requests', () => {
  it('sends one PUT to GitLab and one PATCH to GitHub, each listing the other review', async () => {
    const { outcome } = await batch();
    const puts = requests.filter((r) => r.method === 'PUT');
    const patches = requests.filter((r) => r.method === 'PATCH');
    expect(puts.map((r) => r.url)).toEqual([GL_UPDATE]);
    expect(patches.map((r) => r.url)).toEqual([GH_UPDATE]);
    const description = (puts[0]?.body as { description: string }).description;
    expect(Object.keys(puts[0]?.body as object)).toEqual(['description']);
    expect(description.endsWith(`${RELATED_START}\nRelated:\n- web-shop #311 https://github.com/acme/web-shop/pull/311\n${RELATED_END}`)).toBe(true);
    const body = (patches[0]?.body as { body: string }).body;
    expect(Object.keys(patches[0]?.body as object)).toEqual(['body']);
    expect(body).toContain(`Related:\n- billing-api !142 https://git.acme.com/payments/billing-api/-/merge_requests/142\n${RELATED_END}`);
    expect(outcome.total).toBe(2);
    expect([...outcome.links.values()]).toEqual([{ kind: 'added' }, { kind: 'added' }]);
  });

  it('records a refused update on its line only, and still updates the other review', async () => {
    const { outcome, line } = await batch(403);
    expect(requests.filter((r) => r.method === 'PUT').map((r) => r.url)).toEqual([GL_UPDATE]);
    expect(outcome.links.get('web')).toEqual({ kind: 'failed', reason: '403' });
    expect(outcome.links.get('billing')).toEqual({ kind: 'added' });
    expect(line('web')).toBe('✓ web-shop  #311  github.com/acme/web-shop  (related links not added: 403)');
  });
});
