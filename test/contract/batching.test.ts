// hosting-providers :: Forty repositories on two hosts, Chunks of 50 aliases, GitLab chunk limit matrix (R1–R5); the
// queries sent and the answers mapped.

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { GitHubProvider } from '../../src/providers/github';
import { GitLabProvider } from '../../src/providers/gitlab';
import { Http } from '../../src/providers/http';
import { ProviderFactory, type ReviewItem } from '../../src/providers/provider';
import { ReviewLoader } from '../../src/providers/reviewLoader';
import { row } from '../unit/rows';
import { contractServer } from './helpers';
import { aliases, statusAnswer } from './graphql';

const { server, requests } = contractServer();
const GL = { token: 'glpat-x1y2', apiHost: 'git.acme.com' };
const GH = { token: 'gho_abc', apiHost: 'api.github.com' };

const items = (n: number, prefix: string): ReviewItem[] =>
  Array.from({ length: n }, (_, i) => ({ key: `${prefix}-${i}`, projectPath: `${prefix}/repo-${i}`, branch: 'feature/ABC-12-notes' }));

describe('Batched review status', () => {
  it('costs 3 requests to git.acme.com for 25 repositories and 1 to github.com for 15', async () => {
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
      'POST https://git.acme.com/api/graphql',
      'POST https://git.acme.com/api/graphql',
    ]);
    const counts = (url: string) => requests.filter((r) => r.url === url).map((r) => aliases((r.body as { query: string }).query).length);
    expect(counts('https://git.acme.com/api/graphql')).toEqual([10, 10, 5]);
    expect(counts('https://api.github.com/graphql')).toEqual([15]);
    expect(gitlab.results.size).toBe(25);
    expect(github.results.size).toBe(15);
    expect(requests.find((r) => r.url === 'https://api.github.com/graphql')?.headers.authorization).toBe('Bearer gho_abc');
  });

  it('splits 120 repositories on github.com into requests of 50, 50 and 20 aliases, one after another', async () => {
    const order: string[] = [];
    server.use(
      http.post('https://api.github.com/graphql', async ({ request }) => {
        const query = ((await request.json()) as { query: string }).query;
        const n = aliases(query).length;
        order.push(`start ${n}`);
        await new Promise((r) => setTimeout(r, 20));
        order.push(`end ${n}`);
        return statusAnswer('github', query);
      }),
    );
    const answer = await new GitHubProvider(new Http(), 'github.com', 'https://github.com').reviewStates(items(120, 'acme'), GH, {});
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

describe('GitLab chunk limit matrix', () => {
  const URL_GQL = 'https://git.acme.com/api/graphql';
  const tooLarge = () => HttpResponse.json({ errors: [{ message: 'Query too large' }] }, { status: 422 });
  const tooComplex = () => HttpResponse.json({ errors: [{ message: 'Query has complexity of 260, which exceeds max complexity of 250' }] });
  const sizes = () => requests.filter((r) => r.url === URL_GQL).map((r) => aliases((r.body as { query: string }).query).length);

  /** Loads `n` repositories through the loader; the first request is answered by `first`, every other one with the recorded MR. */
  async function load(n: number, first?: () => Response) {
    let sent = 0;
    server.use(
      http.post(URL_GQL, async ({ request }) => {
        const query = ((await request.json()) as { query: string }).query;
        const answer = sent++ === 0 ? first : undefined;
        return answer ? answer() : statusAnswer('gitlab', query);
      }),
    );
    const rows = new Map(
      Array.from({ length: n }, (_, i) =>
        row({
          id: `file:///acme/repo-${i}`,
          name: `repo-${i}`,
          headSha: 'c3d4e5f',
          hosted: { host: 'git.acme.com', projectPath: `payments/repo-${i}`, webUrl: `https://git.acme.com/payments/repo-${i}` },
          head: { kind: 'branch', name: 'feature/ABC-12-notes', upstream: 'origin/feature/ABC-12-notes', ahead: 0, behind: 0 },
        }),
      ).map((r) => [r.id, r]),
    );
    const stored: string[] = [];
    const logged: string[] = [];
    const loader = new ReviewLoader({
      row: (id) => rows.get(id),
      provider: (kind, host, origin) => new ProviderFactory(new Http()).get(kind, host, origin),
      credential: async () => GL,
      rejected: async () => undefined,
      selection: () => ({}),
      saveSelection: async () => undefined,
      store: (id) => void stored.push(id),
      now: () => Date.now(),
      log: (message) => void logged.push(message),
    });
    const outcome = await loader.load('git.acme.com', [...rows.keys()]);
    return { outcome, stored, logged };
  }

  it('refreshes 10 repositories from one answer', async () => {
    const { outcome, stored, logged } = await load(10);
    expect(sizes()).toEqual([10]);
    expect(outcome).toEqual({ ok: true });
    expect(stored).toHaveLength(10);
    expect(logged).toEqual([]);
  });

  it('splits 10 aliases into two requests of 5 after Query too large', async () => {
    const { outcome, stored, logged } = await load(10, tooLarge);
    expect(sizes()).toEqual([10, 5, 5]);
    expect(outcome).toEqual({ ok: true });
    expect(stored).toHaveLength(10);
    expect(logged).toEqual([]);
  });

  it('splits 10 aliases into two requests of 5 after a complexity error', async () => {
    const { outcome, stored, logged } = await load(10, tooComplex);
    expect(sizes()).toEqual([10, 5, 5]);
    expect(outcome).toEqual({ ok: true });
    expect(stored).toHaveLength(10);
    expect(logged).toEqual([]);
  });

  it('fails a single alias that is still too large and logs the GitLab message', async () => {
    const { outcome, stored, logged } = await load(1, tooLarge);
    expect(sizes()).toEqual([1]);
    expect(outcome).toEqual({ ok: false });
    expect(stored).toEqual([]);
    expect(logged).toEqual(['Review request to git.acme.com failed: Query too large']);
  });

  it('does not split after a 502 and logs HTTP 502', async () => {
    const { outcome, stored, logged } = await load(10, () => new HttpResponse(null, { status: 502 }));
    expect(sizes()).toEqual([10]);
    expect(outcome).toEqual({ ok: false });
    expect(stored).toEqual([]);
    expect(logged).toEqual(['Review request to git.acme.com failed: HTTP 502']);
  });
});
