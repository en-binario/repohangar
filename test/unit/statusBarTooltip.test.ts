import { describe, expect, it } from 'vitest';
import { statusBarModel } from '../../src/shared/format';
import type { RowData } from '../../src/shared/model';
import { counts, row } from './rows';

function repo(name: string, behind = 0, dirty = false): RowData {
  return row({
    id: name,
    name,
    head: { kind: 'branch', name: 'main', upstream: 'origin/main', ahead: 0, behind },
    counts: dirty ? counts(0, 1, 0, 0) : counts(0, 0, 0, 0),
  });
}

/** Pads the given repositories with clean ones up to 14. */
function fourteen(...given: RowData[]): RowData[] {
  const filler = Array.from({ length: 14 - given.length }, (_, i) => repo(`zz-clean-${i}`));
  return [...given, ...filler];
}

const twelveBehind = Array.from({ length: 12 }, (_, i) => repo(`svc-${String(i + 1).padStart(2, '0')}`, 1));

// status-bar :: Status bar tooltip matrix
const rows: [string, RowData[], string][] = [
  ['says everything is clean', fourteen(), 'RepoHangar: 14 repositories\nAll repositories are clean and up to date.'],
  ['lists behind repositories by name', fourteen(repo('notifications', 1), repo('ledger', 4)), 'RepoHangar: 14 repositories\nBehind: ledger ↓4, notifications ↓1'],
  ['lists dirty repositories by name', fourteen(repo('web-shop', 0, true), repo('billing-api', 0, true)), 'RepoHangar: 14 repositories\nDirty: billing-api, web-shop'],
  ['lists behind and dirty repositories', fourteen(repo('ledger', 4), repo('billing-api', 0, true)), 'RepoHangar: 14 repositories\nBehind: ledger ↓4\nDirty: billing-api'],
  [
    'shows at most 10 names',
    fourteen(...twelveBehind),
    'RepoHangar: 14 repositories\nBehind: svc-01 ↓1, svc-02 ↓1, svc-03 ↓1, svc-04 ↓1, svc-05 ↓1, svc-06 ↓1, svc-07 ↓1, svc-08 ↓1, svc-09 ↓1, svc-10 ↓1 and 2 more',
  ],
];

describe('statusBarModel tooltip', () => {
  it.each(rows)('%s', (_name, rows, tooltip) => {
    expect(statusBarModel(rows, true).tooltip).toBe(tooltip);
  });

  it('reads the accessible label', () => {
    const rows = fourteen(repo('a', 1), repo('b', 1), repo('c', 1), repo('d', 0, true), repo('e', 0, true));
    expect(statusBarModel(rows, true).label).toBe('RepoHangar: 14 repositories, 3 behind, 2 with changes');
  });
});
