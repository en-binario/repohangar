import { describe, expect, it } from 'vitest';
import { chipMembership } from '../../src/shared/format';
import type { ReviewInfo, RowData } from '../../src/shared/model';
import { counts, githubReview, gitlabReview, loaded, row } from './rows';

const tracked = (ahead: number, behind: number): RowData['head'] => ({ kind: 'branch', name: 'main', upstream: 'origin/main', ahead, behind });

// dashboard :: Chip membership matrix — [dirty, behind, ahead, noUpstream]
const rows: [string, Partial<RowData>, [boolean, boolean, boolean, boolean]][] = [
  ['matches no chip when clean and level', { head: tracked(0, 0) }, [false, false, false, false]],
  ['matches Dirty and Ahead', { head: tracked(2, 0), counts: counts(0, 3, 1, 0) }, [true, false, true, false]],
  ['matches Behind', { head: tracked(0, 4) }, [false, true, false, false]],
  ['matches Behind and Ahead when diverged', { head: tracked(1, 1) }, [false, true, true, false]],
  ['matches Dirty and No upstream', { head: { kind: 'branch', name: 'feature/x' }, counts: counts(0, 0, 0, 2) }, [true, false, false, true]],
  ['matches no chip when detached and clean', { head: { kind: 'detached', commit: 'a1b2c3d4' } }, [false, false, false, false]],
  ['matches Dirty during a rebase with conflicts', { head: { kind: 'detached', commit: 'a1b2c3d4' }, operation: { kind: 'rebase', step: 3, total: 7 }, counts: counts(2, 0, 0, 0) }, [true, false, false, false]],
  ['is not dirty with only stashes', { head: tracked(0, 0), stashes: 2 }, [false, false, false, false]],
];

describe('chipMembership', () => {
  it.each(rows)('%s', (_name, overrides, [dirty, behind, ahead, noUpstream]) => {
    expect(chipMembership(row(overrides))).toEqual({ dirty, behind, ahead, noUpstream, hasReview: false, pipelineFailed: false });
  });
});

// dashboard :: Review chip membership matrix — [Has MR, Pipeline ✗]
const reviewRows: [string, ReviewInfo, [boolean, boolean]][] = [
  ['counts a draft merge request with a running pipeline as Has MR only', loaded(gitlabReview({ draft: true, pipeline: 'RUNNING' })), [true, false]],
  [
    'counts a pull request with failed checks as Has MR and Pipeline failed',
    loaded(githubReview({ pipeline: 'FAILURE', reviewDecision: 'CHANGES_REQUESTED' })),
    [true, true],
  ],
  ['counts a cached merge request that passed as Has MR', loaded(gitlabReview({ number: 88, pipeline: 'SUCCESS', approvalsRequired: 2, approvalsLeft: 0 }), 'gitlab', true), [true, false]],
  ['counts a cached merge request that failed as both', loaded(gitlabReview({ number: 57, pipeline: 'FAILED' }), 'gitlab', true), [true, true]],
  ['counts a branch without an open review as neither', loaded(null), [false, false]],
  ['counts Sign in, ? and loading cells as neither', { kind: 'signIn', host: 'git.acme.com' }, [false, false]],
];

describe('review chips', () => {
  it.each(reviewRows)('%s', (_name, review, [hasReview, pipelineFailed]) => {
    const member = chipMembership(row({ review }));
    expect([member.hasReview, member.pipelineFailed]).toEqual([hasReview, pipelineFailed]);
  });

  it.each<[string, ReviewInfo]>([
    ['the ? cell', { kind: 'unknownHost', host: 'git.acme.com' }],
    ['the … cell', { kind: 'loading' }],
  ])('counts %s as neither', (_name, review) => {
    const member = chipMembership(row({ review }));
    expect([member.hasReview, member.pipelineFailed]).toEqual([false, false]);
  });
});
