import { describe, expect, it } from 'vitest';
import { batchTargets, branchTargets, toolbarLabel, type BatchTrigger, type BranchTrigger, type BranchTargets } from '../../src/shared/batch';
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

// batch-operations :: Branch batch target matrix (the targets; 122-branchTargets.test.ts runs them in VS Code)
const four = ['billing-api', 'ledger', 'web-shop', 'notifications'];
const branchCases: [string, BranchTrigger, string[], BranchTargets | undefined, string | null][] = [
  ['R1 switches in the selected rows with b', 'b', three, { action: 'switch', ids: three }, null],
  ['R2 leaves b without a selection to the focused row', 'b', [], undefined, null],
  ['R3 switches in the selected rows from the command or toolbar', 'switchBranch', three, { action: 'switch', ids: three }, '⎇ Switch… (3)'],
  ['R4 switches in every listed repository without a selection', 'switchBranch', [], { action: 'switch', ids: listed }, '⎇ Switch…'],
  ['R5 creates in the selected rows with n', 'n', four, { action: 'createBranch', ids: four }, null],
  ['R6 creates in the focused row with n and no selection', 'n', [], { action: 'createBranch', ids: ['ledger'] }, null],
  ['R7 creates in the selected rows from the command or toolbar', 'createBranch', ['billing-api', 'ledger'], { action: 'createBranch', ids: ['billing-api', 'ledger'] }, '＋ Branch… (2)'],
  ['R8 creates in every listed repository without a selection', 'createBranch', [], { action: 'createBranch', ids: listed }, '＋ Branch…'],
];

describe('branchTargets', () => {
  it.each(branchCases)('%s', (_name, trigger, selected, targets, label) => {
    expect(branchTargets(trigger, selected, listed, 'ledger')).toEqual(targets);
    if (label !== null && targets) expect(toolbarLabel(targets.action, selected.length)).toBe(label);
  });
});
