import { describe, expect, it } from 'vitest';
import { chipMembership } from '../../src/shared/format';
import type { RowData } from '../../src/shared/model';
import { counts, row } from './rows';

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
    expect(chipMembership(row(overrides))).toEqual({ dirty, behind, ahead, noUpstream });
  });
});
