// mr-creation :: Create failure matrix (R1–R4).

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { billing, harness, webShop } from './flowHarness';
import { contractServer } from './helpers';
import { gitlabProject, gitlabUsers, noOpenReviews } from './createRoutes';

const { server } = contractServer();
const level = { kind: 'branch', name: 'feature/ABC-12-notes', upstream: 'origin/feature/ABC-12-notes', ahead: 0, behind: 0 } as const;

describe('Create failure matrix', () => {
  it('R1 reports a GitLab 403 as a missing api scope, with Sign In…', async () => {
    server.use(...noOpenReviews(), gitlabProject(), gitlabUsers(), http.post('https://git.acme.com/api/v4/projects/:id/merge_requests', () => HttpResponse.json({ message: '403 Forbidden' }, { status: 403 })));
    const outcome = await harness([billing({ head: level })], { user: { default: { assignees: [] } } }).flow.create('billing');
    expect(outcome).toMatchObject({ kind: 'stop', text: 'git.acme.com did not allow creating the merge request (403). The token needs the api scope.', button: 'Sign In…' });
  });

  it('R2 reports a GitLab 422 with its message and Open Settings', async () => {
    server.use(
      ...noOpenReviews(),
      gitlabProject(),
      gitlabUsers(),
      http.post('https://git.acme.com/api/v4/projects/:id/merge_requests', () => HttpResponse.json({ message: ['Target branch release/3.0 does not exist'] }, { status: 422 })),
    );
    const outcome = await harness([billing({ head: level })], { user: { default: { assignees: [], target: 'release/3.0' } } }).flow.create('billing');
    expect(outcome).toMatchObject({ kind: 'stop', text: 'Creating the merge request failed in billing-api: Target branch release/3.0 does not exist', button: 'Open Settings' });
  });

  it('R3 reports the first GitHub validation error', async () => {
    server.use(
      ...noOpenReviews(),
      http.get('https://api.github.com/repos/acme/web-shop', () => HttpResponse.json({ default_branch: 'main' })),
      http.post('https://api.github.com/repos/acme/web-shop/pulls', () =>
        HttpResponse.json({ message: 'Validation Failed', errors: [{ message: 'No commits between main and feature/x' }] }, { status: 422 }),
      ),
    );
    const outcome = await harness([webShop()], { user: { default: { assignees: [] } } }).flow.create('web');
    expect(outcome).toMatchObject({ kind: 'stop', text: 'Creating the pull request failed in web-shop: No commits between main and feature/x' });
    expect(outcome.kind === 'stop' && outcome.button).toBeUndefined();
  });

  it('R4 reports a create request without an answer within 15 s', async () => {
    server.use(...noOpenReviews(), gitlabProject(), gitlabUsers(), http.post('https://git.acme.com/api/v4/projects/:id/merge_requests', () => new Promise<Response>(() => undefined)));
    const outcome = await harness([billing({ head: level })], { user: { default: { assignees: [] } } }).flow.create('billing');
    expect(outcome).toMatchObject({ kind: 'stop', text: 'Creating the merge request failed in billing-api: timed out after 15 s' });
  }, 20_000);
});
