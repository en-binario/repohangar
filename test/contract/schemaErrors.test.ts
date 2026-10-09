// hosting-providers :: Schema error matrix (R1–R6), REST answer not modified.

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { GitHubProvider, UnsupportedQueryError } from '../../src/providers/github';
import { GITLAB_SELECTION, GitLabProvider } from '../../src/providers/gitlab';
import { Http } from '../../src/providers/http';
import { reviewCell } from '../../src/shared/review';
import type { ReviewResult } from '../../src/providers/provider';
import { contractServer, fixture } from './helpers';
import { recordedNode, schemaError, statusAnswer } from './graphql';

const { server, requests } = contractServer();
const GL = { token: 'glpat-x1y2', apiHost: 'git.acme.com' };
const GHE = { token: 'ghp_x', apiHost: 'github.acme.com' };
const billing = [{ key: 'billing-api', projectPath: 'payments/billing-api', branch: 'feature/ABC-12-notes' }];
const portal = [{ key: 'admin-portal', projectPath: 'acme/admin-portal', branch: 'feature/ABC-12-notes' }];

type Body = { query: string };

/** Answers a schema error while the query still selects `field`, then the recorded node. */
function rejectWhileSelected(url: string, provider: 'gitlab' | 'github', field: string, type: string, node: Record<string, unknown>) {
  return http.post(url, async ({ request }) => {
    const { query } = (await request.json()) as Body;
    if (new RegExp(`\\b${field}\\b`).test(query)) return schemaError(field, type);
    return statusAnswer(provider, query, () => [node]);
  });
}

function cellOf(result: ReviewResult | undefined, provider: 'gitlab' | 'github') {
  if (result?.kind !== 'review') return undefined;
  return reviewCell({ kind: 'loaded', provider, review: result.review, stale: false, fetchedAt: 0 }, 0).text;
}

const gitlab = () => new GitLabProvider(new Http(), 'git.acme.com', 'https://git.acme.com');
const ghe = () => new GitHubProvider(new Http(), 'github.acme.com', 'https://github.acme.com');

describe('Schema error matrix', () => {
  it('R1 retries without approvalsRequired, remembers the selection and shows no approvals', async () => {
    const { approvalsRequired: _, ...node } = recordedNode('gitlab');
    server.use(rejectWhileSelected('https://git.acme.com/api/graphql', 'gitlab', 'approvalsRequired', 'MergeRequest', node));
    const answer = await gitlab().reviewStates(billing, GL, {});
    expect(requests).toHaveLength(2);
    expect(answer.selection).toEqual(GITLAB_SELECTION.filter((f) => f !== 'approvalsRequired'));
    expect(cellOf(answer.results.get('billing-api'), 'gitlab')).toBe('!142  ✓ passed');
  });

  it('R2 retries without detailedMergeStatus, keeps the approvals and reads Mergeable as unknown', async () => {
    const { detailedMergeStatus: _, ...node } = recordedNode('gitlab');
    server.use(rejectWhileSelected('https://git.acme.com/api/graphql', 'gitlab', 'detailedMergeStatus', 'MergeRequest', node));
    const answer = await gitlab().reviewStates(billing, GL, {});
    expect(requests).toHaveLength(2);
    expect(answer.selection).not.toContain('detailedMergeStatus');
    const result = answer.results.get('billing-api');
    expect(cellOf(result, 'gitlab')).toBe('!142  ✓ passed  1/2');
    expect(result?.kind === 'review' && result.review.mergeStatus).toBeNull();
  });

  it('R3 switches to REST per repository, 4 at a time, when mergeRequests cannot be queried', async () => {
    let concurrent = 0;
    let most = 0;
    server.use(
      http.post('https://git.acme.com/api/graphql', () => schemaError('mergeRequests', 'Project')),
      http.get('https://git.acme.com/api/v4/projects/:id/merge_requests', async () => {
        concurrent++;
        most = Math.max(most, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
        return HttpResponse.json(fixture('git.acme.com', 'merge-requests-rest'));
      }),
    );
    const many = Array.from({ length: 9 }, (_, i) => ({ key: `r${i}`, projectPath: `payments/repo-${i}`, branch: 'feature/ABC-12-notes' }));
    const answer = await gitlab().reviewStates([...billing, ...many], GL, {});
    expect(answer.rest).toBe(true);
    expect(most).toBe(4);
    expect(requests.filter((r) => r.method === 'GET')).toHaveLength(10);
    expect(requests.find((r) => r.method === 'GET')?.url).toBe(
      'https://git.acme.com/api/v4/projects/payments%2Fbilling-api/merge_requests?source_branch=feature%2FABC-12-notes&state=opened&per_page=1',
    );
    expect(cellOf(answer.results.get('billing-api'), 'gitlab')).toBe('!142');
  });

  it('R4 switches to REST after the third retry when every retry reports a new missing field', async () => {
    const order = ['approvalsRequired', 'approvalsLeft', 'detailedMergeStatus', 'autoMergeEnabled'];
    let i = 0;
    server.use(
      http.post('https://git.acme.com/api/graphql', () => schemaError(order[i++] as string, 'MergeRequest')),
      http.get('https://git.acme.com/api/v4/projects/:id/merge_requests', () => HttpResponse.json(fixture('git.acme.com', 'merge-requests-rest'))),
    );
    const answer = await gitlab().reviewStates(billing, GL, {});
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(4);
    expect(requests.filter((r) => r.method === 'GET')).toHaveLength(1);
    expect(answer.rest).toBe(true);
    expect(cellOf(answer.results.get('billing-api'), 'gitlab')).toBe('!142');
  });

  it('R5 retries a GitHub Enterprise query without autoMergeRequest', async () => {
    const node: Record<string, unknown> = { ...recordedNode('github'), number: 57, autoMergeRequest: undefined, reviewDecision: null };
    node.commits = { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] };
    server.use(rejectWhileSelected('https://github.acme.com/api/graphql', 'github', 'autoMergeRequest', 'PullRequest', node));
    const answer = await ghe().reviewStates(portal, GHE, {});
    expect(requests).toHaveLength(2);
    expect(answer.selection).not.toContain('autoMergeRequest.mergeMethod');
    expect(cellOf(answer.results.get('admin-portal'), 'github')).toBe('#57  ✓ passed');
  });

  it('R6 sends nothing more when pullRequests cannot be queried on GitHub Enterprise', async () => {
    server.use(http.post('https://github.acme.com/api/graphql', () => schemaError('pullRequests', 'Repository')));
    await expect(ghe().reviewStates(portal, GHE, {})).rejects.toBeInstanceOf(UnsupportedQueryError);
    expect(requests).toHaveLength(1);
  });

  it('uses a remembered selection without sending the removed field again', async () => {
    server.use(http.post('https://git.acme.com/api/graphql', async ({ request }) => statusAnswer('gitlab', ((await request.json()) as Body).query)));
    await gitlab().reviewStates(billing, GL, { selection: GITLAB_SELECTION.filter((f) => f !== 'approvalsRequired') });
    expect((requests[0]?.body as Body).query).not.toContain('approvalsRequired');
  });
});

describe('REST answer not modified', () => {
  it('sends If-None-Match and keeps the value on 304', async () => {
    server.use(
      http.get('https://git.acme.com/api/v4/projects/:id/merge_requests', ({ request }) =>
        request.headers.get('if-none-match') === '"a1b2"'
          ? new HttpResponse(null, { status: 304 })
          : HttpResponse.json(fixture('git.acme.com', 'merge-requests-rest'), { headers: { ETag: '"a1b2"' } }),
      ),
    );
    const provider = gitlab();
    await provider.reviewStates(billing, GL, { rest: true });
    const second = await provider.reviewStates(billing, GL, { rest: true });
    expect(requests[1]?.headers['if-none-match']).toBe('"a1b2"');
    expect(cellOf(second.results.get('billing-api'), 'gitlab')).toBe('!142');
  });
});
