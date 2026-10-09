import { describe, expect, it } from 'vitest';
import { pullGuard, type PullDecision } from '../../src/git/guards';
import type { Head, Operation } from '../../src/shared/model';
import { row } from './rows';

const upstream: Head = { kind: 'branch', name: 'main', upstream: 'origin/main', ahead: 0, behind: 2 };
const skip = (reason: string): PullDecision => ({
  result: { state: 'skipped', detail: reason },
  notice: { text: `Pull skipped in billing-api: ${reason}.` },
});

// git-operations :: Pull matrix
describe('pullGuard', () => {
  it('R1 skips during a rebase, merge, cherry-pick or revert', () => {
    const operations: Operation[] = [{ kind: 'rebase' }, { kind: 'merge' }, { kind: 'cherry-pick' }, { kind: 'revert' }];
    for (const operation of operations) {
      expect(pullGuard(row({ operation, head: upstream }))).toEqual(skip(`${operation.kind} in progress`));
    }
  });

  it('R2 skips a detached HEAD', () => {
    expect(pullGuard(row({ head: { kind: 'detached', commit: 'a1b2c3d' } }))).toEqual(skip('detached HEAD'));
  });

  it('R3 skips a branch without upstream', () => {
    expect(pullGuard(row({ head: { kind: 'branch', name: 'fix/login-timeout' } }))).toEqual(skip('no upstream'));
  });

  it('R4 pulls a branch with an upstream', () => {
    expect(pullGuard(row({ head: upstream }))).toEqual({ run: 'pull' });
  });
});
