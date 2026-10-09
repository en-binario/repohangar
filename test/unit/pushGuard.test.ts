import { describe, expect, it } from 'vitest';
import { pushGuard, type PushDecision } from '../../src/git/guards';
import type { Head, Operation, RowData } from '../../src/shared/model';
import { row } from './rows';

const origin: RowData['remote'] = { name: 'origin', displayUrl: 'https://git.acme.com/payments/billing-api.git' };
const branch = (upstream: boolean, ahead?: number, behind?: number): Head => ({
  kind: 'branch',
  name: 'feature/ABC-12-notes',
  ...(upstream ? { upstream: 'origin/feature/ABC-12-notes', ahead, behind } : {}),
});
const detached: Head = { kind: 'detached', commit: 'a1b2c3d4e5' };

// git-operations :: Push matrix
const cases: [string, Operation | null, Head, RowData['remote'], PushDecision][] = [
  ['R1 skips during a rebase', { kind: 'rebase', step: 2, total: 5 }, branch(true, 1, 0), origin,
    { result: { state: 'skipped', detail: 'rebase in progress' }, notice: { text: 'Finish the rebase in billing-api first.' } }],
  ['R2 skips during a merge', { kind: 'merge' }, branch(true, 1, 0), origin,
    { result: { state: 'skipped', detail: 'merge in progress' }, notice: { text: 'Finish the merge in billing-api first.' } }],
  ['R3 skips during a cherry-pick', { kind: 'cherry-pick' }, detached, null,
    { result: { state: 'skipped', detail: 'cherry-pick in progress' }, notice: { text: 'Finish the cherry-pick in billing-api first.' } }],
  ['R4 skips during a revert', { kind: 'revert' }, branch(false), origin,
    { result: { state: 'skipped', detail: 'revert in progress' }, notice: { text: 'Finish the revert in billing-api first.' } }],
  ['R5 skips a detached HEAD', null, detached, origin,
    { result: { state: 'skipped', detail: 'detached HEAD' }, notice: { text: 'billing-api has a detached HEAD. Check out a branch to push.' } }],
  ['R6 skips a branch without upstream and remote', null, branch(false), null,
    { result: { state: 'skipped', detail: 'no remote' }, notice: { text: 'billing-api has no remote to publish to.' } }],
  ['R7 publishes a branch without upstream to the chosen remote', null, branch(false), origin,
    { run: 'publish', remote: 'origin', branch: 'feature/ABC-12-notes' }],
  ['R8 skips a branch behind its upstream and offers Pull', null, branch(true, 1, 2), origin,
    {
      result: { state: 'skipped', detail: 'behind (↓2)' },
      notice: { text: "The remote branch of billing-api has 2 commits you don't have.", pull: true },
    }],
  ['R9 has nothing to push when level', null, branch(true, 0, 0), origin, { result: { state: 'ok', detail: 'nothing to push' } }],
  ['R10 pushes a branch ahead and not behind', null, branch(true, 3, 0), origin, { run: 'push' }],
];

describe('pushGuard', () => {
  it.each(cases)('%s', (_name, operation, head, remote, decision) => {
    expect(pushGuard(row({ operation, head, remote }))).toEqual(decision);
  });
});
