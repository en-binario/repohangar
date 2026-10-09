import { describe, expect, it } from 'vitest';
import { batchTargets, toolbarLabel, type BatchTrigger } from '../../src/shared/batch';
import type { BatchAction } from '../../src/shared/model';

const listed = ['auth-service', 'billing-api', 'ledger', 'notifications', 'web-shop', 'scratch'];
const three = ['billing-api', 'ledger', 'web-shop'];

// batch-operations :: Batch target matrix
const cases: [string, BatchTrigger, string[], BatchAction, string[], string | null][] = [
  ['R1 fetches every listed repository without a selection', 'fetchAll', [], 'fetch', listed, '⟳ Fetch all'],
  ['R2 fetches the selected rows', 'fetchAll', three, 'fetch', three, '⟳ Fetch (3)'],
  ['R3 fetches the selected rows with f', 'f', three, 'fetch', three, null],
  ['R4 pulls (ff) every listed repository without a selection', 'pullAllFf', [], 'pullFf', listed, '⇣ Pull all (ff)'],
  ['R5 pulls (ff) the selected rows', 'pullAllFf', three, 'pullFf', three, '⇣ Pull (ff) (3)'],
  ['R6 pulls (ff) the selected rows with p', 'p', three, 'pullFf', three, null],
];

describe('batchTargets', () => {
  it.each(cases)('%s', (_name, trigger, selected, action, ids, label) => {
    expect(batchTargets(trigger, selected, listed)).toEqual({ action, ids });
    if (label !== null) expect(toolbarLabel(action, selected.length)).toBe(label);
  });

  it('R7 pulls (ff) the active repository whatever is selected', () => {
    expect(batchTargets('pullFf', three, listed, 'notifications')).toEqual({ action: 'pullFf', ids: ['notifications'] });
    expect(batchTargets('pullFf', [], listed, undefined)).toEqual({ action: 'pullFf', ids: [] });
  });

  it('drops selected ids that are no longer listed', () => {
    expect(batchTargets('fetchAll', ['gone', 'ledger'], listed)).toEqual({ action: 'fetch', ids: ['ledger'] });
  });
});
