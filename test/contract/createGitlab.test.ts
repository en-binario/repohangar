// mr-creation :: GitLab payload matrix (R1–R2), One keystroke on an unpublished branch (the requests).

import { describe, expect, it } from 'vitest';
import { billing, harness } from './flowHarness';
import { contractServer } from './helpers';
import { gitlabCreate, gitlabProject, gitlabUsers, noOpenReviews } from './createRoutes';

const { server, requests } = contractServer();
const createRequest = () => requests.find((r) => r.method === 'POST' && r.url.endsWith('/merge_requests'));

describe('GitLab payload matrix', () => {
  it('R1 sends the title, squash, remove_source_branch and the labels joined with commas', async () => {
    server.use(...noOpenReviews(), gitlabProject(), gitlabUsers(), gitlabCreate());
    const h = harness([billing({ head: { kind: 'branch', name: 'feature/ABC-12-notes', upstream: 'origin/feature/ABC-12-notes', ahead: 0, behind: 0 } })], {
      user: { default: { title: 'feat: ABC-12 Add billing notes', squash: true, deleteSourceBranch: true, labels: ['needs-review', 'payments'], assignees: [] } },
    });
    const outcome = await h.flow.create('billing');
    expect(outcome.kind).toBe('created');
    expect(createRequest()?.body).toMatchObject({
      title: 'feat: ABC-12 Add billing notes',
      squash: true,
      remove_source_branch: true,
      labels: 'needs-review,payments',
      source_branch: 'feature/ABC-12-notes',
      target_branch: 'main',
    });
  });

  it('R2 prefixes Draft: and leaves out empty labels, reviewers and assignees', async () => {
    server.use(...noOpenReviews(), gitlabProject(), gitlabUsers(), gitlabCreate());
    const h = harness([billing({ head: { kind: 'branch', name: 'feature/ABC-12-notes', upstream: 'origin/feature/ABC-12-notes', ahead: 0, behind: 0 } })], {
      user: { default: { title: 'feat: ABC-12 Add billing notes', draft: true, squash: false, deleteSourceBranch: false, assignees: [] } },
    });
    await h.flow.create('billing');
    const body = createRequest()?.body as Record<string, unknown>;
    expect(body).toMatchObject({ title: 'Draft: feat: ABC-12 Add billing notes', squash: false, remove_source_branch: false });
    expect(Object.keys(body)).not.toContain('labels');
    expect(Object.keys(body)).not.toContain('reviewer_ids');
    expect(Object.keys(body)).not.toContain('assignee_ids');
  });
});

describe('One keystroke on an unpublished branch', () => {
  it('publishes, then sends one create request with every field', async () => {
    server.use(...noOpenReviews(), gitlabProject(), gitlabUsers(), gitlabCreate({ premium: true }));
    const h = harness([billing()], {
      user: { default: { reviewers: ['ana.perez', 'luis.gomez'], labels: ['needs-review'], squash: true, deleteSourceBranch: true } },
      me: 'carla.ruiz',
    });
    const outcome = await h.flow.create('billing');
    expect(h.pushes).toEqual([{ id: 'billing', publish: true }]);
    const creates = requests.filter((r) => r.method === 'POST' && r.url.endsWith('/merge_requests'));
    expect(creates).toHaveLength(1);
    expect(creates[0]?.url).toBe('https://git.acme.com/api/v4/projects/payments%2Fbilling-api/merge_requests');
    expect(creates[0]?.body).toMatchObject({
      source_branch: 'feature/ABC-12-notes',
      target_branch: 'main',
      reviewer_ids: [11, 12],
      labels: 'needs-review',
      squash: true,
      remove_source_branch: true,
    });
    expect(outcome.kind === 'created' && outcome.text).toBe(
      'Created !142 in billing-api (pushed 2 commits): reviewers ana.perez, luis.gomez · labels needs-review · squash · delete branch',
    );
  });
});
