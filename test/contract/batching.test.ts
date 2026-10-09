// hosting-providers :: Forty repositories on two hosts, Chunks of 50 aliases; the queries sent and the answers mapped.

import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { GitHubProvider } from '../../src/providers/github';
import { GitLabProvider } from '../../src/providers/gitlab';
import { Http } from '../../src/providers/http';
import type { ReviewItem } from '../../src/providers/provider';
import { contractServer } from './helpers';
import { aliases, statusAnswer } from './graphql';

const { server, requests } = contractServer();
const GL = { token: 'glpat-x1y2', apiHost: 'git.acme.com' };
const GH = { token: 'gho_abc', apiHost: 'api.github.com' };

const items = (n: number, prefix: string): ReviewItem[] =>
  Array.from({ length: n }, (_, i) => ({ key: `${prefix}-${i}`, projectPath: `${prefix}/repo-${i}`, branch: 'feature/ABC-12-notes' }));

describe('Batched review status', () => {
  it('costs exactly 2 requests for 25 repositories on git.acme.com and 15 on github.com', async () => {
    server.use(
      http.post('https://git.acme.com/api/graphql', async ({ request }) => statusAnswer('gitlab', ((await request.json()) as { query: string }).query)),
      http.post('https://api.github.com/graphql', async ({ request }) => statusAnswer('github', ((await request.json()) as { query: string }).query)),
    );
    const client = new Http();
    const [gitlab, github] = await Promise.all([
      new GitLabProvider(client, 'git.acme.com', 'https://git.acme.com').reviewStates(items(25, 'payments'), GL, {}),
      new GitHubProvider(client, 'github.com', 'https://github.com').reviewStates(items(15, 'acme'), GH, {}),
    ]);
    expect(requests.map((r) => `${r.method} ${r.url}`).sort()).toEqual([
      'POST https://api.github.com/graphql',
      'POST https://git.acme.com/api/graphql',
    ]);
    const count = (url: string) => aliases((requests.find((r) => r.url === url)?.body as { query: string }).query).length;
    expect(count('https://git.acme.com/api/graphql')).toBe(25);
    expect(count('https://api.github.com/graphql')).toBe(15);
    expect(gitlab.results.size).toBe(25);
    expect(github.results.size).toBe(15);
    expect(requests.find((r) => r.url.includes('api.github.com'))?.headers.authorization).toBe('Bearer gho_abc');
  });

  it('splits 120 repositories into requests of 50, 50 and 20 aliases, one after another', async () => {
    const order: string[] = [];
    server.use(
      http.post('https://git.acme.com/api/graphql', async ({ request }) => {
        const query = ((await request.json()) as { query: string }).query;
        const n = aliases(query).length;
        order.push(`start ${n}`);
        await new Promise((r) => setTimeout(r, 20));
        order.push(`end ${n}`);
        return statusAnswer('gitlab', query);
      }),
    );
    const answer = await new GitLabProvider(new Http(), 'git.acme.com', 'https://git.acme.com').reviewStates(items(120, 'payments'), GL, {});
    expect(order).toEqual(['start 50', 'end 50', 'start 50', 'end 50', 'start 20', 'end 20']);
    expect(answer.requests).toBe(3);
    expect(answer.results.size).toBe(120);
  });

  it('sends the GitLab and GitHub query shapes of §6.4', async () => {
    const gitlab = new GitLabProvider(new Http(), 'git.acme.com', 'https://git.acme.com');
    const github = new GitHubProvider(new Http(), 'github.com', 'https://github.com');
    const one = [{ key: 'a', projectPath: 'payments/billing-api', branch: 'feature/ABC-12-notes' }];
    expect(gitlab.query(one, ['iid', 'webUrl', 'headPipeline.status'])).toBe(
      'query RepoHangarStatus { r0: project(fullPath: "payments/billing-api") { mergeRequests(sourceBranches: ["feature/ABC-12-notes"], state: opened, first: 1) { nodes { iid webUrl headPipeline { status } } } } }',
    );
    expect(github.query([{ key: 'b', projectPath: 'acme/web-shop', branch: 'feature/ABC-12-notes' }], ['number', 'url'])).toBe(
      'query RepoHangarStatus { r0: repository(owner: "acme", name: "web-shop") { pullRequests(headRefName: "feature/ABC-12-notes", states: [OPEN], first: 1) { nodes { number url } } } }',
    );
  });

  it('maps the recorded merge request and pull request', async () => {
    server.use(
      http.post('https://git.acme.com/api/graphql', async ({ request }) => statusAnswer('gitlab', ((await request.json()) as { query: string }).query)),
      http.post('https://github.acme.com/api/graphql', async ({ request }) => statusAnswer('github', ((await request.json()) as { query: string }).query)),
    );
    const client = new Http();
    const gl = await new GitLabProvider(client, 'git.acme.com', 'https://git.acme.com').reviewStates(items(1, 'payments'), GL, {});
    const gh = await new GitHubProvider(client, 'github.acme.com', 'https://github.acme.com').reviewStates(
      items(1, 'acme'),
      { token: 'ghp_x', apiHost: 'github.acme.com' },
      {},
    );
    expect(gl.results.get('payments-0')).toEqual({
      kind: 'review',
      review: {
        provider: 'gitlab',
        number: 142,
        url: 'https://git.acme.com/payments/billing-api/-/merge_requests/142',
        title: 'feat: ABC-12 Add billing notes',
        draft: false,
        pipeline: 'SUCCESS',
        approvalsRequired: 2,
        approvalsLeft: 1,
        mergeStatus: 'MERGEABLE',
        autoMerge: false,
        headSha: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2',
      },
    });
    expect(gh.results.get('acme-0')).toMatchObject({
      kind: 'review',
      review: { provider: 'github', number: 311, pipeline: 'FAILURE', reviewDecision: 'CHANGES_REQUESTED', autoMerge: false },
    });
  });
});
