// Nightly GitLab compatibility (PROPOSAL.md §14, D20): the GitLab cases of the provider contract tests against a real
// GitLab CE 17.10.0, and the recorded fixtures checked against its answers.

import { describe, expect, inject, it } from 'vitest';
import { GITLAB_SELECTION, GitLabProvider } from '../../src/providers/gitlab';
import { Http, HttpError } from '../../src/providers/http';
import { Prober, VersionCheck, type ProbedProvider } from '../../src/providers/probe';
import { reviewCell } from '../../src/shared/review';
import { fixture } from '../contract/helpers';

const gitlab = inject('gitlab');
const http = new Http();
const host = new URL(gitlab.url).hostname;
const provider = new GitLabProvider(http, host, gitlab.url);
const credential = { token: gitlab.token, apiHost: new URL(gitlab.url).host };
const CE_SELECTION = GITLAB_SELECTION.filter((f) => f !== 'approvalsRequired' && f !== 'approvalsLeft');
const items = [
  { key: 'with', projectPath: gitlab.projectPath, branch: gitlab.branch },
  { key: 'without', projectPath: gitlab.projectPath, branch: gitlab.branchWithoutMr },
  { key: 'missing', projectPath: 'payments/does-not-exist', branch: 'main' },
];

describe('GitLab CE 17.10.0', () => {
  it('is identified as GitLab by the probe, without credentials', async () => {
    const stored = new Map<string, ProbedProvider>();
    const prober = new Prober(http, { get: (h) => stored.get(h), set: async (h, p) => void stored.set(h, p) });
    expect(await prober.probe(host, gitlab.url)).toBe('gitlab');
  });

  it('reports 17.10.0 with the token and gets no version warning', async () => {
    const warnings: string[] = [];
    const versions = new VersionCheck({
      read: () => provider.version(credential),
      warned: () => false,
      markWarned: async () => undefined,
      warn: (text) => warnings.push(text),
    });
    expect(await versions.version(host)).toMatch(/^17\.10\.0/);
    expect(warnings).toEqual([]);
  });

  it('answers the user and the default branch', async () => {
    expect((await provider.currentUser(gitlab.token)).username).toBe('root');
    expect(await provider.defaultBranch(gitlab.projectPath, credential)).toBe('main');
  });

  it('answers 401 for a token it does not know', async () => {
    const error = await provider.currentUser('glpat-not-a-token').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(401);
  });

  it('drops the approval fields CE lacks in one retry, then answers a review, none and an unreadable project', async () => {
    // CE has no approvalsRequired or approvalsLeft (Premium fields); every alias reports both.
    const answer = await provider.reviewStates(items, credential, {});
    expect(answer.requests).toBe(2);
    expect(answer.rest).toBeUndefined();
    expect(answer.selection).toEqual(CE_SELECTION);
    // With the remembered selection, the next load costs one request.
    expect((await provider.reviewStates(items, credential, { selection: CE_SELECTION })).requests).toBe(1);
    const review = answer.results.get('with');
    expect(review?.kind).toBe('review');
    if (review?.kind !== 'review') return;
    expect(review.review.number).toBe(gitlab.iid);
    expect(review.review.url).toBe(`${gitlab.url}/${gitlab.projectPath}/-/merge_requests/${gitlab.iid}`);
    expect(review.review.mergeStatus).not.toBeNull();
    // CE has no approval rules: no approval part in the cell (Approval value matrix R3).
    expect(review.review.approvalsRequired ?? 0).toBe(0);
    expect(reviewCell({ kind: 'loaded', provider: 'gitlab', review: review.review, stale: false, fetchedAt: 0 }, 0).text).toBe(`!${gitlab.iid}`);
    expect(answer.results.get('without')).toEqual({ kind: 'none' });
    expect(answer.results.get('missing')).toEqual({ kind: 'notFound' });
  });

  it('reports the approval fields as missing exactly as the recorded CE answer does', async () => {
    const recorded = fixture<{ errors: { message: string }[] }>('git.acme.com', 'schema-error-ce-17.10');
    const raw = await http.request<{ errors: { message: string }[] }>({
      method: 'POST',
      url: `${gitlab.url}/api/graphql`,
      credential,
      body: { query: provider.query(items.slice(0, 2), GITLAB_SELECTION) },
    });
    expect(raw.json.errors.map((e) => e.message)).toEqual(recorded.errors.map((e) => e.message));
  });

  it('answers the REST fallback with the same merge request', async () => {
    const answer = await provider.reviewStates(items.slice(0, 2), credential, { rest: true });
    const review = answer.results.get('with');
    expect(review?.kind === 'review' && review.review.number).toBe(gitlab.iid);
    expect(answer.results.get('without')).toEqual({ kind: 'none' });
  });

  it('answers with every field of the recorded GraphQL merge request that CE has', async () => {
    const { approvalsRequired: _required, approvalsLeft: _left, ...recorded } = fixture<Record<string, unknown>>('git.acme.com', 'merge-request-node');
    const raw = await http.request<{ data: Record<string, { mergeRequests: { nodes: Record<string, unknown>[] } }> }>({
      method: 'POST',
      url: `${gitlab.url}/api/graphql`,
      credential,
      body: { query: provider.query(items.slice(0, 1), CE_SELECTION) },
    });
    const live = raw.json.data.r0?.mergeRequests.nodes[0] ?? {};
    expect(Object.keys(live).sort()).toEqual(Object.keys(recorded).sort());
    for (const [key, value] of Object.entries(recorded)) {
      if (value === null) continue;
      // headPipeline is null without CI; every other field has the recorded type.
      if (key === 'headPipeline' && live[key] === null) continue;
      expect([key, typeof live[key]]).toEqual([key, typeof value]);
    }
  });

  it('answers with every field of the recorded REST merge request', async () => {
    const recorded = fixture<Record<string, unknown>[]>('git.acme.com', 'merge-requests-rest')[0] ?? {};
    const raw = await http.request<Record<string, unknown>[]>({
      url: `${gitlab.url}/api/v4/projects/${encodeURIComponent(gitlab.projectPath)}/merge_requests?source_branch=${encodeURIComponent(gitlab.branch)}&state=opened&per_page=1`,
      credential,
    });
    const live = raw.json[0] ?? {};
    for (const key of Object.keys(recorded)) expect(Object.keys(live)).toContain(key);
  });
});
