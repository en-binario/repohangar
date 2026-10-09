// mr-creation :: Reviewer resolution matrix (R1–R9), GitLab user IDs resolved once.

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { billing, harness, memoryStores, webShop } from './flowHarness';
import { contractServer } from './helpers';
import { githubCreate, githubFollowUps, gitlabCreate, gitlabProject, gitlabUsers, noOpenReviews } from './createRoutes';

const { server, requests } = contractServer();
const createBody = () => requests.find((r) => r.method === 'POST' && r.url.endsWith('/merge_requests'))?.body as Record<string, unknown>;
const level = { kind: 'branch', name: 'feature/ABC-12-notes', upstream: 'origin/feature/ABC-12-notes', ahead: 0, behind: 0 } as const;

async function gitlab(reviewers: string[], me: string, options: { premium?: boolean; stores?: ReturnType<typeof memoryStores> } = {}) {
  const h = harness([billing({ head: level })], {
    user: { default: { reviewers, assignees: [] } },
    me,
    ...(options.stores ? { stores: options.stores } : {}),
  });
  const outcome = await h.flow.create('billing');
  if (outcome.kind !== 'created') throw new Error(JSON.stringify(outcome));
  return { outcome, stores: h.stores, notices: outcome.notices.map((n) => [n.text, n.button]) };
}

describe('Reviewer resolution matrix', () => {
  it('R1 sends both reviewer IDs on Premium and reports nothing', async () => {
    server.use(...noOpenReviews(), gitlabProject(), gitlabUsers(), gitlabCreate({ premium: true }));
    const { notices } = await gitlab(['ana.perez', 'luis.gomez'], 'carla.ruiz', { premium: true });
    expect(createBody().reviewer_ids).toEqual([11, 12]);
    expect(notices).toEqual([]);
  });

  it('R2 replaces @me and removes the author from the reviewers', async () => {
    server.use(...noOpenReviews(), gitlabProject(), gitlabUsers(), gitlabCreate());
    const { notices } = await gitlab(['@me', 'luis.gomez'], 'ana.perez');
    expect(createBody().reviewer_ids).toEqual([12]);
    expect(notices).toEqual([]);
  });

  it('R3 leaves a GitHub team out on GitLab and says so', async () => {
    server.use(...noOpenReviews(), gitlabProject(), gitlabUsers(), gitlabCreate());
    const { notices } = await gitlab(['team:sre', 'luis.gomez'], 'ana.perez');
    expect(createBody().reviewer_ids).toEqual([12]);
    expect(notices).toEqual([['team:sre is a GitHub team and was not added on git.acme.com.', undefined]]);
  });

  it('R4 creates without an unknown reviewer and reports it with Open Settings', async () => {
    server.use(...noOpenReviews(), gitlabProject(), gitlabUsers(), gitlabCreate());
    const { notices } = await gitlab(['jdoe', 'luis.gomez'], 'ana.perez');
    expect(createBody().reviewer_ids).toEqual([12]);
    expect(notices).toEqual([['Reviewer jdoe not found on git.acme.com.', 'Open Settings']]);
  });

  it('R5 reports the reviewer GitLab Free did not apply, read back from the answer', async () => {
    server.use(...noOpenReviews(), gitlabProject(), gitlabUsers(), gitlabCreate());
    const { notices } = await gitlab(['ana.perez', 'luis.gomez'], 'carla.ruiz');
    expect(createBody().reviewer_ids).toEqual([11, 12]);
    expect(notices).toEqual([['GitLab Free allows one reviewer: ana.perez added, luis.gomez not added.', undefined]]);
  });

  it('R6 retries with the first reviewer after a 400 about the number of reviewers, and remembers the host', async () => {
    let calls = 0;
    server.use(
      ...noOpenReviews(),
      gitlabProject(),
      gitlabUsers(),
      http.post('https://git.acme.com/api/v4/projects/:id/merge_requests', async ({ request }) => {
        calls++;
        const body = (await request.json()) as { reviewer_ids: number[] };
        if (body.reviewer_ids.length > 1) return HttpResponse.json({ message: 'You can only assign one reviewer on this plan' }, { status: 400 });
        return HttpResponse.json({ iid: 142, web_url: 'https://git.acme.com/payments/billing-api/-/merge_requests/142', reviewers: [{ username: 'ana.perez' }], assignees: [], labels: [] }, { status: 201 });
      }),
    );
    const { notices, stores } = await gitlab(['ana.perez', 'luis.gomez'], 'carla.ruiz');
    expect(calls).toBe(2);
    expect(createBody().reviewer_ids).toEqual([11, 12]);
    expect((requests.filter((r) => r.method === 'POST' && r.url.endsWith('/merge_requests'))[1]?.body as Record<string, unknown>).reviewer_ids).toEqual([11]);
    expect(stores.singleReviewer('git.acme.com')).toBe(true);
    expect(notices).toEqual([['GitLab Free allows one reviewer: ana.perez added, luis.gomez not added.', undefined]]);
  });

  it('R7 sends only the first reviewer to a host remembered as single-reviewer', async () => {
    server.use(...noOpenReviews(), gitlabProject(), gitlabUsers(), gitlabCreate());
    const { notices } = await gitlab(['ana.perez', 'luis.gomez'], 'carla.ruiz', { stores: memoryStores(['git.acme.com']) });
    expect(createBody().reviewer_ids).toEqual([11]);
    expect(notices).toEqual([['GitLab Free allows one reviewer: ana.perez added, luis.gomez not added.', undefined]]);
  });

  it('R8 replaces @me and removes the author on GitHub', async () => {
    server.use(...noOpenReviews(), githubCreate(), ...githubFollowUps());
    const h = harness([webShop()], { user: { default: { reviewers: ['@me', 'luis.gomez'], assignees: [] } }, me: 'ana.perez' });
    const outcome = await h.flow.create('web');
    expect(requests.find((r) => r.url.endsWith('/requested_reviewers'))?.body).toEqual({ reviewers: ['luis.gomez'], team_reviewers: [] });
    expect(outcome.kind === 'created' && outcome.notices).toEqual([]);
  });

  it('R9 reports an unknown GitHub reviewer with Open Settings', async () => {
    server.use(...noOpenReviews(), githubCreate(), ...githubFollowUps({ reviewers: 422 }));
    const h = harness([webShop()], { user: { default: { reviewers: ['jdoe'], assignees: [] } }, me: 'ana.perez' });
    const outcome = await h.flow.create('web');
    expect(requests.find((r) => r.url.endsWith('/requested_reviewers'))?.body).toEqual({ reviewers: ['jdoe'], team_reviewers: [] });
    expect(outcome.kind === 'created' && outcome.notices.map((n) => [n.text, n.button])).toEqual([['Reviewer jdoe not found on github.com.', 'Open Settings']]);
  });
});

describe('GitLab user IDs resolved once', () => {
  it('asks for luis.gomez once over two creations', async () => {
    server.use(...noOpenReviews(), gitlabProject(), gitlabUsers(), gitlabCreate());
    const stores = memoryStores();
    await gitlab(['luis.gomez'], 'ana.perez', { stores });
    await gitlab(['luis.gomez'], 'ana.perez', { stores });
    expect(requests.filter((r) => r.url === 'https://git.acme.com/api/v4/users?username=luis.gomez')).toHaveLength(1);
  });
});
