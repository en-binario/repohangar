// mr-creation :: Add the reviewers after connecting (Reviewers after connecting): the one PUT that adds the profile's
// reviewers and the other assignees to a merge request created during a push.

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { GitLabProvider } from '../../src/providers/gitlab';
import { Http } from '../../src/providers/http';
import { memoryStores } from './flowHarness';
import { USERS, gitlabUsers } from './createRoutes';
import { contractServer } from './helpers';

const { server, requests } = contractServer();
const GL = { token: 'glpat-x1y2', apiHost: 'git.acme.com' };
const MR = 'https://git.acme.com/api/v4/projects/payments%2Fbilling-api/merge_requests/142';

/** `PUT …/merge_requests/142`, answering with the reviewers it kept (the first only unless `premium`). */
function update(premium: boolean) {
  const byId = Object.fromEntries(Object.entries(USERS).map(([name, id]) => [id, name]));
  return http.put(MR, async ({ request }) => {
    const body = (await request.json()) as { reviewer_ids?: number[] };
    const kept = premium ? (body.reviewer_ids ?? []) : (body.reviewer_ids ?? []).slice(0, 1);
    return HttpResponse.json({ iid: 142, reviewers: kept.map((id) => ({ id, username: byId[id] })) });
  });
}

describe('Add the reviewers after connecting', () => {
  const gitlab = () => new GitLabProvider(new Http(), 'git.acme.com', 'https://git.acme.com');

  it('sends one PUT with the user IDs of ana.perez and luis.gomez in reviewer_ids', async () => {
    server.use(gitlabUsers(), update(true));
    const result = await gitlab().updateReviewers('payments/billing-api', 142, ['ana.perez', 'luis.gomez'], [], GL, memoryStores());
    const puts = requests.filter((r) => r.method === 'PUT');
    expect(puts.map((r) => [r.url, r.body])).toEqual([[MR, { reviewer_ids: [11, 12] }]]);
    expect(result).toEqual({ notices: [], reviewers: ['ana.perez', 'luis.gomez'] });
  });

  it('adds the other assignees in the same PUT', async () => {
    server.use(gitlabUsers(), update(true));
    await gitlab().updateReviewers('payments/billing-api', 142, ['ana.perez'], ['luis.gomez'], GL, memoryStores());
    expect(requests.filter((r) => r.method === 'PUT').map((r) => r.body)).toEqual([{ reviewer_ids: [11], assignee_ids: [12] }]);
  });

  it('reports the reviewers GitLab Free did not apply and the unknown ones, as Reviewers and assignees does', async () => {
    server.use(gitlabUsers(), update(false));
    const result = await gitlab().updateReviewers('payments/billing-api', 142, ['ana.perez', 'luis.gomez', 'jdoe'], [], GL, memoryStores());
    expect(result.notices.map((n) => [n.text, n.button])).toEqual([
      ['Reviewer jdoe not found on git.acme.com.', 'Open Settings'],
      ['GitLab Free allows one reviewer: ana.perez added, luis.gomez not added.', undefined],
    ]);
  });
});
