import { describe, expect, it } from 'vitest';
import { syncCell } from '../../src/shared/format';
import type { Head, Operation, RowData } from '../../src/shared/model';
import { row } from './rows';

const origin: RowData['remote'] = { name: 'origin', displayUrl: 'https://git.acme.com/a/b.git' };
const up = (ahead?: number, behind?: number): Head => ({ kind: 'branch', name: 'main', upstream: 'origin/main', ahead, behind });

// dashboard :: Sync cell matrix
const rows: [string, Operation | null, Head, RowData['remote'], string][] = [
  ['shows nothing during an operation', { kind: 'rebase', step: 1, total: 2 }, up(3, 1), origin, '—'],
  ['shows nothing for a detached HEAD', null, { kind: 'detached', commit: 'a1b2c3d4' }, origin, '—'],
  ['shows nothing without upstream and remote', null, { kind: 'branch', name: 'main' }, null, '—'],
  ['offers to publish a branch without upstream', null, { kind: 'branch', name: 'main' }, origin, '⇡ publish'],
  ['shows nothing when counts are unavailable', null, up(undefined, undefined), origin, '—'],
  ['shows nothing when level', null, up(0, 0), origin, '—'],
  ['shows ahead', null, up(2, 0), origin, '↑2'],
  ['shows behind', null, up(0, 4), origin, '↓4'],
  ['shows ahead and behind', null, up(1, 1), origin, '↑1 ↓1'],
];

describe('syncCell', () => {
  it.each(rows)('%s', (_name, operation, head, remote, text) => {
    expect(syncCell(row({ operation, head, remote })).text).toBe(text);
  });
});
