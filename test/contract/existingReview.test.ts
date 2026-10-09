// mr-creation :: Existing review matrix (R1–R3).

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { billing, harness, webShop } from './flowHarness';
import { contractServer } from './helpers';
import { gitlabProject, gitlabUsers, noOpenReviews } from './createRoutes';
import { recordedNode, statusAnswer } from './graphql';

const { server, requests } = contractServer();

describe('Existing review matrix', () => {
  it('R1 opens !142 found by the review request, with no push and no create request', async () => {
    server.use(http.post('https://git.acme.com/api/graphql', async ({ request }) => statusAnswer('gitlab', ((await request.json()) as { query: string }).query)));
    const h = harness([billing()]);
    const outcome = await h.flow.create('billing');
    expect(outcome).toEqual({
      kind: 'exists',
      ref: '!142',
      url: 'https://git.acme.com/payments/billing-api/-/merge_requests/142',
      text: '!142 already exists for feature/ABC-12-notes in billing-api.',
    });
    expect(h.pushes).toEqual([]);
    expect(requests.filter((r) => r.url.endsWith('/merge_requests'))).toHaveLength(0);
  });

  it('R2 opens the merge request a GitLab 409 names', async () => {
    server.use(
      ...noOpenReviews(),
      gitlabProject(),
      gitlabUsers(),
      http.post('https://git.acme.com/api/v4/projects/:id/merge_requests', () =>
        HttpResponse.json({ message: ['Another open merge request already exists for this source branch: !142'] }, { status: 409 }),
      ),
    );
    const outcome = await harness([billing()], { user: { default: { assignees: [] } } }).flow.create('billing');
    expect(outcome).toEqual({
      kind: 'exists',
      ref: '!142',
      url: 'https://git.acme.com/payments/billing-api/-/merge_requests/142',
      text: '!142 already exists for feature/ABC-12-notes in billing-api.',
    });
  });

  it('R3 asks GitHub for the pull request after a 422 duplicate and opens #311', async () => {
    let statusCalls = 0;
    server.use(
      http.post('https://api.github.com/graphql', async ({ request }) => {
        statusCalls++;
        const query = ((await request.json()) as { query: string }).query;
        return statusAnswer('github', query, () => (statusCalls === 1 ? [] : [recordedNode('github')]));
      }),
      http.get('https://api.github.com/repos/acme/web-shop', () => HttpResponse.json({ default_branch: 'main' })),
      http.post('https://api.github.com/repos/acme/web-shop/pulls', () =>
        HttpResponse.json({ message: 'Validation Failed', errors: [{ message: 'A pull request already exists for acme:feature/ABC-12-notes.' }] }, { status: 422 }),
      ),
    );
    const outcome = await harness([webShop()], { user: { default: { assignees: [] } } }).flow.create('web');
    expect(outcome).toEqual({
      kind: 'exists',
      ref: '#311',
      url: 'https://github.com/acme/web-shop/pull/311',
      text: '#311 already exists for feature/ABC-12-notes in web-shop.',
    });
  });
});
