import type { ReviewInfo, ReviewState, RowData } from '../../src/shared/model';

/** A clean row on `main`, level with `origin/main`, that tests override field by field. */
export function row(overrides: Partial<RowData> = {}): RowData {
  return {
    id: 'file:///home/dev/code/acme/backend/billing-api',
    name: 'billing-api',
    path: '/home/dev/code/acme/backend/billing-api',
    group: 'backend',
    provider: 'gitlab',
    remote: { name: 'origin', displayUrl: 'https://git.acme.com/payments/billing-api.git' },
    head: { kind: 'branch', name: 'main', upstream: 'origin/main', ahead: 0, behind: 0 },
    operation: null,
    counts: { conflicts: 0, unstaged: 0, staged: 0, untracked: 0 },
    stashes: 0,
    lastFetch: null,
    ...overrides,
  };
}

export function counts(conflicts: number, unstaged: number, staged: number, untracked: number): RowData['counts'] {
  return { conflicts, unstaged, staged, untracked };
}

/** An open GitLab merge request `!142`, overridden field by field. */
export function gitlabReview(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    provider: 'gitlab',
    number: 142,
    url: 'https://git.acme.com/payments/billing-api/-/merge_requests/142',
    title: 'feat: ABC-12 Add billing notes',
    draft: false,
    pipeline: null,
    approvalsRequired: 0,
    approvalsLeft: 0,
    mergeStatus: 'MERGEABLE',
    autoMerge: false,
    headSha: 'c3d4e5f',
    ...overrides,
  };
}

/** An open GitHub pull request `#311`, overridden field by field. */
export function githubReview(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    provider: 'github',
    number: 311,
    url: 'https://github.com/acme/web-shop/pull/311',
    title: 'feat: ABC-12 Add billing notes',
    draft: false,
    pipeline: null,
    reviewDecision: null,
    mergeStatus: 'MERGEABLE',
    autoMerge: false,
    headSha: 'c3d4e5f',
    ...overrides,
  };
}

/** A loaded review state for a row. */
export function loaded(review: ReviewState | null, provider: 'gitlab' | 'github' = review?.provider ?? 'gitlab', stale = false, fetchedAt = 0): ReviewInfo {
  return { kind: 'loaded', provider, review, stale, fetchedAt };
}
