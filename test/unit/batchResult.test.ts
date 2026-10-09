import { describe, expect, it } from 'vitest';
import { BatchResults } from '../../src/jobs/results';
import { fixButtons, type FixId } from '../../src/shared/batchResult';
import type { BatchAction, JobResult } from '../../src/shared/model';

const NOTES = 'feature/ABC-12-notes';

// batch-operations :: Fix button matrix (the buttons; 124-fixButtons.test.ts runs their actions)
const cases: [string, BatchAction, JobResult, FixId[]][] = [
  ['R1 offers Stash and pull for a dirty Pull (ff) skip', 'pullFf', { state: 'skipped', detail: 'dirty (3 files)' }, ['stashAndPull']],
  ['R2 offers Pull with rebase and Open SCM for a diverged branch', 'pullFf', { state: 'skipped', detail: 'diverged (↑1 ↓1)' }, ['pullRebase', 'openScm']],
  ['R3 offers Publish for a branch without upstream', 'pullFf', { state: 'skipped', detail: 'no upstream' }, ['publish']],
  ['R4 offers Open SCM for an operation in progress', 'switch', { state: 'skipped', detail: 'rebase in progress' }, ['openScm']],
  ['R5 offers Show Git Output for a failed fetch', 'fetch', { state: 'failed', detail: 'Could not resolve host: git.acme.com' }, ['showGitOutput']],
  ['R6 offers Stash and switch for a dirty switch skip', 'switch', { state: 'skipped', detail: 'dirty (3 files)' }, ['stashAndSwitch']],
  ['R7 offers Create branch here where the branch is missing', 'switch', { state: 'skipped', detail: `no branch ${NOTES}` }, ['createBranchHere']],
  ['R8 offers nothing for ok', 'createBranch', { state: 'ok', detail: 'created from a1b2c3d' }, []],
];

describe('fixButtons', () => {
  it.each(cases)('%s', (_name, action, result, fixes) => {
    expect(fixButtons(action, result, NOTES)).toEqual(fixes);
  });

  it('R4 also applies to Pull (ff) and Create', () => {
    expect(fixButtons('pullFf', { state: 'skipped', detail: 'merge in progress' }, undefined)).toEqual(['openScm']);
    expect(fixButtons('createBranch', { state: 'skipped', detail: 'cherry-pick in progress' }, NOTES)).toEqual(['openScm']);
  });
});

// batch-operations :: Pull all result panel, Retry a failed fetch
describe('BatchResults', () => {
  const pull = () => {
    const results = new BatchResults();
    const panel = results.start('pullFf', {}, 6200, [
      { id: 'l', name: 'ledger', result: { state: 'ok', detail: 'fast-forwarded 4 commits' } },
      { id: 'b', name: 'billing-api', result: { state: 'skipped', detail: 'dirty (3 files)' } },
      { id: 'i', name: 'infra-charts', result: { state: 'failed', detail: 'fetch failed: Permission denied (publickey)' } },
    ]);
    return { results, panel };
  };

  it('orders the lines failed, skipped, then ok, and offers Retry failed', () => {
    const { panel } = pull();
    expect(panel.title).toBe('Pull all (ff) — finished in 6.2 s');
    expect(panel.counts).toBe('✓ 1 updated · ↷ 1 skipped · ✗ 1 failed');
    expect(panel.lines.map((l) => l.text)).toEqual([
      '✗ infra-charts  fetch failed: Permission denied (publickey)',
      '↷ billing-api  dirty (3 files)',
      '✓ ledger  fast-forwarded 4 commits',
    ]);
    expect(panel.canRetry).toBe(true);
  });

  it('replaces one line in place and recounts', () => {
    const { results } = pull();
    expect(results.failedIds()).toEqual(['i']);
    expect(results.replace('i', { state: 'ok', detail: 'up to date' })).toEqual({
      line: { id: 'i', name: 'infra-charts', state: 'ok', text: '✓ infra-charts  up to date', fixes: [] },
      counts: '✓ 1 updated · = 1 up to date · ↷ 1 skipped',
      canRetry: false,
    });
    expect(results.panel()?.lines.map((l) => l.name)).toEqual(['infra-charts', 'billing-api', 'ledger']);
  });

  it('names what a plain ok did', () => {
    const results = new BatchResults();
    const panel = results.start('switch', { branch: NOTES, dirtyChoice: 'skip' }, 1200, [
      { id: 'a', name: 'auth-service', result: { state: 'ok' } },
      { id: 'w', name: 'web-shop', result: { state: 'skipped', detail: `no branch ${NOTES}` } },
    ]);
    expect(panel.lines.map((l) => l.text)).toEqual([`↷ web-shop  no branch ${NOTES}`, `✓ auth-service  switched to ${NOTES}`]);
    expect(results.params).toEqual({ branch: NOTES, dirtyChoice: 'skip' });
  });
});
