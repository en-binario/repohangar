// mr-creation :: GitHub follow-up matrix (R1–R3).

import { describe, expect, it } from 'vitest';
import { harness, webShop } from './flowHarness';
import { contractServer } from './helpers';
import { githubCreate, githubFollowUps, noOpenReviews } from './createRoutes';

const { server, requests } = contractServer();
const after = (path: string) => requests.find((r) => r.method === 'POST' && r.url.includes(path));

describe('GitHub follow-up matrix', () => {
  it('R1 requests reviewers and teams, the assignee @me and the labels after the create', async () => {
    server.use(...noOpenReviews(), githubCreate(), ...githubFollowUps());
    const h = harness([webShop()], {
      user: { default: { reviewers: ['luis.gomez', 'team:frontend'], assignees: ['@me'], labels: ['frontend'], title: 'feat: ABC-12 Add billing notes' } },
      me: 'ana.perez',
    });
    const outcome = await h.flow.create('web');
    expect(requests.find((r) => r.url === 'https://api.github.com/repos/acme/web-shop/pulls')?.body).toMatchObject({
      title: 'feat: ABC-12 Add billing notes',
      head: 'feature/ABC-12-notes',
      base: 'main',
      draft: false,
    });
    expect(after('/requested_reviewers')?.body).toEqual({ reviewers: ['luis.gomez'], team_reviewers: ['frontend'] });
    expect(after('/assignees')?.body).toEqual({ assignees: ['ana.perez'] });
    expect(after('/labels')?.body).toEqual({ labels: ['frontend'] });
    expect(outcome.kind === 'created' && outcome.text).toBe('Created #311 in web-shop: reviewers luis.gomez, team:frontend · labels frontend');
  });

  it('R2 sends no follow-up request without reviewers, assignees or labels', async () => {
    server.use(...noOpenReviews(), githubCreate(), ...githubFollowUps());
    const h = harness([webShop()], { user: { default: { reviewers: [], assignees: [], labels: [] } } });
    const outcome = await h.flow.create('web');
    expect(requests.filter((r) => r.method === 'POST' && /requested_reviewers|assignees|labels/.test(r.url))).toHaveLength(0);
    expect(outcome.kind === 'created' && outcome.text).toBe('Created #311 in web-shop');
  });

  it('R3 keeps the pull request and reports labels that were not added', async () => {
    server.use(...noOpenReviews(), githubCreate(), ...githubFollowUps({ labels: 422 }));
    const h = harness([webShop()], { user: { default: { reviewers: ['luis.gomez'], assignees: [], labels: ['frontend'] } } });
    const outcome = await h.flow.create('web');
    expect(after('/requested_reviewers')).toBeDefined();
    expect(after('/labels')).toBeDefined();
    expect(outcome.kind === 'created' && outcome.text).toBe('Created #311 in web-shop: reviewers luis.gomez');
    expect(outcome.kind === 'created' && outcome.notices.map((n) => n.text)).toEqual(['Labels were not added to #311: Could not resolve to a node']);
  });
});
