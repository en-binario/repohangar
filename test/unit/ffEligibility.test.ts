import { describe, expect, it } from 'vitest';
import { distinctPaths, ffDecision, ffMergeResult, type FetchOutcome, type FfDecision, type FfState } from '../../src/git/ffEligibility';
import type { Head } from '../../src/shared/model';

const ok: FetchOutcome = { state: 'ok' };
const tracking = (ahead: number, behind: number): Head => ({ kind: 'branch', name: 'main', upstream: 'origin/main', ahead, behind });
const clean = (head: Head): FfState => ({ operation: null, head, dirtyFiles: 0 });
const skipped = (detail: string): FfDecision => ({ merge: false, result: { state: 'skipped', detail } });

// batch-operations :: Pull (ff) eligibility matrix
const cases: [string, FetchOutcome, FfState, FfDecision][] = [
  ['R1 fails when the fetch failed', { state: 'failed', detail: 'Permission denied (publickey)' }, clean(tracking(0, 4)),
    { merge: false, result: { state: 'failed', detail: 'fetch failed: Permission denied (publickey)' } }],
  ['R2 skips during a rebase', ok, { operation: { kind: 'rebase', step: 1, total: 3 }, head: { kind: 'detached', commit: 'a1b2c3d' }, dirtyFiles: 1 },
    skipped('rebase in progress')],
  ['R3 skips during a merge', ok, { operation: { kind: 'merge' }, head: tracking(1, 1), dirtyFiles: 1 }, skipped('merge in progress')],
  ['R4 skips during a cherry-pick', ok, { operation: { kind: 'cherry-pick' }, head: tracking(0, 2), dirtyFiles: 0 }, skipped('cherry-pick in progress')],
  ['R5 skips during a revert', ok, { operation: { kind: 'revert' }, head: tracking(0, 2), dirtyFiles: 0 }, skipped('revert in progress')],
  ['R6 skips a detached HEAD', ok, clean({ kind: 'detached', commit: 'a1b2c3d' }), skipped('detached HEAD')],
  ['R7 skips a dirty working tree', ok, { operation: null, head: tracking(0, 4), dirtyFiles: 3 }, skipped('dirty (3 files)')],
  ['R8 skips a branch without upstream, fetched or without remote', { state: 'skipped', detail: 'no remote' },
    clean({ kind: 'branch', name: 'main' }), skipped('no upstream')],
  ['R9 skips a diverged branch', ok, clean(tracking(2, 3)), skipped('diverged (↑2 ↓3)')],
  ['R10 is up to date when not behind', ok, clean(tracking(5, 0)), { merge: false, result: { state: 'ok', detail: 'up to date' } }],
  ['R11 fast-forwards a branch behind and not ahead', ok, clean(tracking(0, 4)), { merge: true, commits: 4 }],
];

describe('ffDecision', () => {
  it.each(cases)('%s', (_name, fetch, state, decision) => {
    expect(ffDecision(fetch, state)).toEqual(decision);
  });

  it('R8 also applies when the fetch was done', () => {
    expect(ffDecision(ok, clean({ kind: 'branch', name: 'main' }))).toEqual(skipped('no upstream'));
  });
});

describe('ffMergeResult', () => {
  it('R11 records the commits fast-forwarded', () => {
    expect(ffMergeResult(4)).toEqual({ state: 'ok', detail: 'fast-forwarded 4 commits' });
  });

  it('R12 records the first line of git error output when the merge exits non-zero', () => {
    const stderr = '\nfatal: Not possible to fast-forward, aborting.\nhint: something else\n';
    expect(ffMergeResult(4, stderr)).toEqual({ state: 'failed', detail: 'fatal: Not possible to fast-forward, aborting.' });
  });
});

describe('distinctPaths', () => {
  it('counts a path that is both staged and unstaged once', () => {
    expect(distinctPaths(['/r/a.md'], ['/r/staged.md', '/r/a.md'], ['/r/a.md', '/r/b.md'], [])).toBe(3);
  });
});
