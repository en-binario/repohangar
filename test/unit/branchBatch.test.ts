import { describe, expect, it } from 'vitest';
import {
  createItemLabel,
  createPlan,
  plausibleBranchName,
  suggestBranches,
  switchPlan,
  type BranchPlan,
  type BranchSnapshot,
  type DirtyChoice,
} from '../../src/git/branchBatch';
import type { Head } from '../../src/shared/model';

const NOTES = 'feature/ABC-12-notes';
const REFUNDS = 'feature/ABC-31-refunds';
const STASH = `RepoHangar: before switching to ${NOTES}`;

const main: Head = { kind: 'branch', name: 'main', upstream: 'origin/main', ahead: 0, behind: 0 };
const onNotes: Head = { kind: 'branch', name: NOTES, upstream: `origin/${NOTES}`, ahead: 0, behind: 0 };
const detached = (commit: string): Head => ({ kind: 'detached', commit });

/** A clean repository on `main` with `main` and feature/ABC-12-notes locally, overridden field by field. */
function snapshot(overrides: Partial<BranchSnapshot> = {}): BranchSnapshot {
  return {
    operation: null,
    head: main,
    headCommit: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    dirtyFiles: 0,
    local: ['main', NOTES],
    remote: 'origin',
    remoteBranches: ['HEAD', 'main', NOTES],
    ...overrides,
  };
}

const none = { local: ['main'], remoteBranches: ['HEAD', 'main'] };

// batch-operations :: Suggestion matrix (targets billing-api, notifications, web-shop)
describe('suggestBranches', () => {
  const suggestions = suggestBranches([
    { local: ['main', NOTES], remoteBranches: ['HEAD', 'main', NOTES] },
    { local: ['main', NOTES], remoteBranches: ['HEAD', 'main'] },
    { local: ['main'], remoteBranches: ['HEAD', 'main', NOTES, 'feature/ABC-12-invoice-pdf'] },
  ]);
  const at = (name: string) => [suggestions.findIndex((s) => s.name === name) + 1, suggestions.find((s) => s.name === name)?.detail];

  it.each([
    ['R1 ranks a branch local in 2 and remote in 1 first', NOTES, 1, 'local in 2 · remote in 1 (tracking branch will be created)'],
    ['R2 ranks main, local in 3, second by name', 'main', 2, 'local in 3'],
    ['R3 ranks a branch only on one remote last and says where it is missing', 'feature/ABC-12-invoice-pdf', 3,
      'remote in 1 (tracking branch will be created) · missing in 2 (those repositories will be skipped)'],
  ])('%s', (_name, branch, position, detail) => {
    expect(at(branch)).toEqual([position, detail]);
  });

  it('does not list <remote>/HEAD', () => {
    expect(suggestions.map((s) => s.name)).toEqual([NOTES, 'main', 'feature/ABC-12-invoice-pdf']);
  });
});

describe('the create item of the switch quick pick', () => {
  it('reads ＋ Create "<name>" from current HEAD in all <n>', () => {
    expect(createItemLabel(REFUNDS, 3)).toBe('＋ Create "feature/ABC-31-refunds" from current HEAD in all 3');
  });

  it.each([REFUNDS, 'main', 'fix/login-timeout', 'a.b/c'])('accepts %s', (name) => {
    expect(plausibleBranchName(name)).toBe(true);
  });

  it.each(['', 'feature/a..b', 'a b', '-x', 'x/', 'x.', 'x.lock', 'a//b', '.a', 'a/.b', 'a@{1}', '@', 'a~1', 'a^', 'a:b', 'a?', 'a*', 'a[b', 'a\\b'])(
    'rejects %j',
    (name) => {
      expect(plausibleBranchName(name)).toBe(false);
    },
  );
});

// batch-operations :: Switch eligibility matrix
const switchCases: [string, BranchSnapshot, DirtyChoice, BranchPlan][] = [
  ['R1 skips during a rebase', snapshot({ operation: { kind: 'rebase', step: 3, total: 7 }, head: detached('a1b2c3d'), dirtyFiles: 2 }), 'stash',
    { result: { state: 'skipped', detail: 'rebase in progress' } }],
  ['R2 skips during a merge, cherry-pick or revert', snapshot({ operation: { kind: 'cherry-pick' }, dirtyFiles: 1 }), 'switchAnyway',
    { result: { state: 'skipped', detail: 'cherry-pick in progress' } }],
  ['R3 is already on the branch', snapshot({ head: onNotes, dirtyFiles: 3 }), 'skip',
    { result: { state: 'ok', detail: `already on ${NOTES}` } }],
  ['R4 skips a repository without the branch, local or remote', snapshot({ ...none, dirtyFiles: 3 }), 'stash',
    { result: { state: 'skipped', detail: `no branch ${NOTES}` } }],
  ['R5 skips a dirty repository when the choice is Skip', snapshot({ dirtyFiles: 3 }), 'skip',
    { result: { state: 'skipped', detail: 'dirty (3 files)' } }],
  ['R6 checks out a local branch', snapshot(), 'skip',
    { steps: [{ kind: 'checkout', branch: NOTES }], done: { state: 'ok' } }],
  ['R7 checks out a local branch from a detached HEAD', snapshot({ head: detached('9f8e7d6') }), 'skip',
    { steps: [{ kind: 'checkout', branch: NOTES }], done: { state: 'ok' } }],
  ['R8 creates a tracking branch for a remote-only branch', snapshot({ local: ['main'] }), 'skip',
    { steps: [{ kind: 'track', branch: NOTES, upstream: `origin/${NOTES}` }], done: { state: 'ok', detail: `tracking origin/${NOTES} created` } }],
  ['R9 stashes, then checks out, when the choice is Stash and switch', snapshot({ dirtyFiles: 3 }), 'stash',
    { steps: [{ kind: 'stash', message: STASH }, { kind: 'checkout', branch: NOTES }], done: { state: 'ok', detail: 'stashed 3 files' } }],
  ['R10 carries the changes when the choice is Switch anyway', snapshot({ dirtyFiles: 3 }), 'switchAnyway',
    { steps: [{ kind: 'checkout', branch: NOTES }], done: { state: 'ok' } }],
  // Git refuses the checkout when it runs; the job records its message (120-branchBatch.test.ts runs it).
  ['R11 checks out with Switch anyway even when Git may refuse it', snapshot({ dirtyFiles: 1 }), 'switchAnyway',
    { steps: [{ kind: 'checkout', branch: NOTES }], done: { state: 'ok' } }],
];

describe('switchPlan', () => {
  it.each(switchCases)('%s', (_name, repo, choice, plan) => {
    expect(switchPlan(repo, NOTES, choice)).toEqual(plan);
  });

  it('does not track a remote branch in a repository without a remote', () => {
    expect(switchPlan(snapshot({ local: ['main'], remote: null }), NOTES, 'skip')).toEqual({
      result: { state: 'skipped', detail: `no branch ${NOTES}` },
    });
  });
});

// batch-operations :: Create eligibility matrix
const createCases: [string, Partial<BranchSnapshot>, BranchPlan][] = [
  ['R1 skips during a rebase, merge, cherry-pick or revert', { operation: { kind: 'revert' } },
    { result: { state: 'skipped', detail: 'revert in progress' } }],
  ['R2 skips a repository that has the branch', { local: ['main', REFUNDS], dirtyFiles: 3 },
    { result: { state: 'skipped', detail: 'branch exists' } }],
  ['R3 creates the branch from a clean HEAD', {},
    { steps: [{ kind: 'create', branch: REFUNDS }], done: { state: 'ok', detail: 'created from a1b2c3d' } }],
  ['R4 creates the branch and carries the changes', { dirtyFiles: 3 },
    { steps: [{ kind: 'create', branch: REFUNDS }], done: { state: 'ok', detail: 'created from a1b2c3d' } }],
  ['R5 creates the branch from a detached HEAD', { head: detached('9f8e7d6c5b4a39281706f5e4d3c2b1a098765432'), headCommit: undefined },
    { steps: [{ kind: 'create', branch: REFUNDS }], done: { state: 'ok', detail: 'created from 9f8e7d6' } }],
];

describe('createPlan', () => {
  it.each(createCases)('%s', (_name, overrides, plan) => {
    expect(createPlan(snapshot(overrides), REFUNDS)).toEqual(plan);
  });
});
