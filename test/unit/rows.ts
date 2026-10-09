import type { RowData } from '../../src/shared/model';

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
