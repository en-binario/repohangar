import { describe, expect, it } from 'vitest';
import { reviewCell } from '../../src/shared/review';
import { compareRows, DEFAULT_SORT, headerText, nextSort, type Sort, type SortColumn } from '../../src/shared/sort';
import type { RowData } from '../../src/shared/model';
import { counts, githubReview, gitlabReview, loaded, row } from './rows';

const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;

const sync: Sort = { column: 'sync', direction: 'desc' };
const syncUp: Sort = { column: 'sync', direction: 'asc' };
const repoDown: Sort = { column: 'repository', direction: 'desc' };
const branchUp: Sort = { column: 'branch', direction: 'asc' };
const branchDown: Sort = { column: 'branch', direction: 'desc' };

// dashboard :: Sort cycle matrix (R12, a click on the selection column header, is a UI case in test/ui/keys.spec.ts)
const cycle: [string, Sort, SortColumn, Sort, string][] = [
  ['sorts by Sync, most behind first, from the default', DEFAULT_SORT, 'sync', sync, 'Sync ▼'],
  ['reverses Sync on a second click', sync, 'sync', syncUp, 'Sync ▲'],
  ['restores the default on a third click', syncUp, 'sync', DEFAULT_SORT, 'Repository ▲'],
  ['moves to Changes, most first, from Sync', sync, 'changes', { column: 'changes', direction: 'desc' }, 'Changes ▼'],
  ['sorts Repository Z to A from the default', DEFAULT_SORT, 'repository', repoDown, 'Repository ▼'],
  ['restores the default from Repository Z to A', repoDown, 'repository', DEFAULT_SORT, 'Repository ▲'],
  ['sorts by Branch A to Z from the default', DEFAULT_SORT, 'branch', branchUp, 'Branch ▲'],
  ['reverses Branch on a second click', branchUp, 'branch', branchDown, 'Branch ▼'],
  ['restores the default from Branch Z to A', branchDown, 'branch', DEFAULT_SORT, 'Repository ▲'],
  ['sorts by Fetched, oldest first, from the default', DEFAULT_SORT, 'fetched', { column: 'fetched', direction: 'desc' }, 'Fetched ▼'],
  ['sorts by MR / PR, most urgent first, from the default', DEFAULT_SORT, 'review', { column: 'review', direction: 'desc' }, 'MR / PR ▼'],
];

describe('nextSort', () => {
  it.each(cycle)('%s', (_name, before, clicked, after, header) => {
    const next = nextSort(before, clicked);
    expect(next).toEqual(after);
    expect(headerText(next.column, next)).toBe(header);
  });

  it('shows no arrow on the columns that are not sorted', () => {
    expect(headerText('repository', sync)).toBe('Repository');
  });
});

function backendRow(name: string, overrides: Partial<RowData>): RowData {
  return row({ id: `file:///home/dev/code/acme/backend/${name}`, name, path: `/home/dev/code/acme/backend/${name}`, ...overrides });
}

// The rows of `backend` in the Sort order matrix.
const backend: RowData[] = [
  backendRow('auth-service', { lastFetch: NOW - 2 * HOUR - 10 * MIN, review: loaded(null, 'gitlab') }),
  backendRow('billing-api', {
    head: { kind: 'branch', name: 'feature/ABC-12-notes', upstream: 'origin/feature/ABC-12-notes', ahead: 2, behind: 0 },
    counts: counts(0, 3, 1, 0),
    lastFetch: NOW - 30_000,
    review: loaded(gitlabReview({ draft: true, pipeline: 'RUNNING' })),
  }),
  backendRow('ledger', {
    operation: { kind: 'rebase', step: 3, total: 7 },
    head: { kind: 'branch', name: 'main', upstream: 'origin/main', ahead: 5, behind: 9 },
    counts: counts(2, 0, 0, 0),
    lastFetch: null,
    review: { kind: 'signIn', host: 'git.acme.com' },
  }),
  backendRow('notifications', {
    head: { kind: 'branch', name: 'fix/login-timeout' },
    counts: counts(0, 0, 0, 2),
    stashes: 1,
    lastFetch: NOW - 4 * MIN - 50_000,
    review: { kind: 'none' },
  }),
  backendRow('payments-api', {
    head: { kind: 'branch', name: 'main', upstream: 'origin/main', ahead: 0, behind: 4 },
    stashes: 2,
    lastFetch: NOW - 26 * HOUR,
    review: loaded(githubReview({ pipeline: 'FAILURE', reviewDecision: 'CHANGES_REQUESTED' })),
  }),
];

// dashboard :: Sort order matrix
const orders: [string, Sort, string[]][] = [
  ['orders by repository name A to Z', { column: 'repository', direction: 'asc' }, ['auth-service', 'billing-api', 'ledger', 'notifications', 'payments-api']],
  ['orders by repository name Z to A', { column: 'repository', direction: 'desc' }, ['payments-api', 'notifications', 'ledger', 'billing-api', 'auth-service']],
  ['orders by the Branch cell A to Z, equal branches by name', branchUp, ['billing-api', 'notifications', 'auth-service', 'payments-api', 'ledger']],
  ['orders by the Branch cell Z to A, equal branches still by name', branchDown, ['ledger', 'auth-service', 'payments-api', 'notifications', 'billing-api']],
  ['puts the most behind first, then ahead, then publish', sync, ['payments-api', 'billing-api', 'notifications', 'auth-service', 'ledger']],
  ['puts nothing to sync first in ascending Sync', syncUp, ['auth-service', 'ledger', 'notifications', 'billing-api', 'payments-api']],
  ['puts conflicts first, then the most changed files, then stashes', { column: 'changes', direction: 'desc' }, ['ledger', 'billing-api', 'notifications', 'payments-api', 'auth-service']],
  ['puts no changes first in ascending Changes', { column: 'changes', direction: 'asc' }, ['auth-service', 'payments-api', 'notifications', 'billing-api', 'ledger']],
  ['puts never fetched first, then the oldest fetch', { column: 'fetched', direction: 'desc' }, ['ledger', 'payments-api', 'auth-service', 'notifications', 'billing-api']],
  ['puts the newest fetch first in ascending Fetched', { column: 'fetched', direction: 'asc' }, ['billing-api', 'notifications', 'auth-service', 'payments-api', 'ledger']],
  ['puts a failed pipeline first, then running, then sign in, then none', { column: 'review', direction: 'desc' }, ['payments-api', 'billing-api', 'ledger', 'auth-service', 'notifications']],
  ['puts rows without a review first in ascending MR / PR', { column: 'review', direction: 'asc' }, ['auth-service', 'notifications', 'ledger', 'billing-api', 'payments-api']],
];

describe('compareRows', () => {
  it('builds the cells of the scenario', () => {
    expect(reviewCell(backend[1]?.review, NOW).text).toBe('!142  Draft  ⟳ running');
    expect(reviewCell(backend[4]?.review, NOW).text).toBe('#311  ✗ failed  changes requested');
  });

  it.each(orders)('%s', (_name, sort, names) => {
    expect([...backend].sort(compareRows(sort, NOW)).map((r) => r.name)).toEqual(names);
  });

  it('ranks an unknown pipeline state with a review that has no pipeline', () => {
    const unknown = backendRow('a-unknown', { review: loaded(gitlabReview({ pipeline: 'SKIPPED' })) });
    const plain = backendRow('b-plain', { review: loaded(gitlabReview({ pipeline: null })) });
    const passed = backendRow('c-passed', { review: loaded(gitlabReview({ pipeline: 'SUCCESS' })) });
    const none = backendRow('d-none', { review: { kind: 'none' } });
    const sorted = [none, passed, plain, unknown].sort(compareRows({ column: 'review', direction: 'desc' }, NOW));
    expect(sorted.map((r) => r.name)).toEqual(['c-passed', 'a-unknown', 'b-plain', 'd-none']);
  });
});
