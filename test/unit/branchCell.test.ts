import { describe, expect, it } from 'vitest';
import { readOperation } from '../../src/git/fastPaths';
import { branchCell } from '../../src/shared/format';
import type { Head } from '../../src/shared/model';
import { memFs } from './memFs';
import { row } from './rows';

const branch = (name: string, upstream?: string): Head => ({ kind: 'branch', name, ...(upstream ? { upstream, ahead: 0, behind: 0 } : {}) });
const detached: Head = { kind: 'detached', commit: 'a1b2c3d4e5f60718' };

// dashboard :: Branch cell matrix — the operation comes from marker files in the git dir.
const rows: [string, Record<string, string>, string[], Head, string, string | null][] = [
  ['shows the rebase-merge step', { 'rebase-merge/msgnum': '3\n', 'rebase-merge/end': '7\n' }, [], detached, 'REBASING 3/7', null],
  ['shows the rebase-apply step', { 'rebase-apply/next': '2\n', 'rebase-apply/last': '5\n' }, [], detached, 'REBASING 2/5', null],
  ['shows a rebase without a step', { 'rebase-merge/head-name': 'refs/heads/main' }, [], detached, 'REBASING', null],
  ['shows a merge', { MERGE_HEAD: 'abc' }, [], branch('main', 'origin/main'), 'MERGING', null],
  ['shows a cherry-pick', { CHERRY_PICK_HEAD: 'abc' }, [], branch('main', 'origin/main'), 'CHERRY-PICKING', null],
  ['shows a revert', { REVERT_HEAD: 'abc' }, [], branch('main'), 'REVERTING', null],
  ['shows a detached HEAD with 7 characters', {}, [], detached, 'detached a1b2c3d', null],
  ['shows the branch name with an upstream', {}, [], branch('feature/ABC-12-notes', 'origin/feature/ABC-12-notes'), 'feature/ABC-12-notes', null],
  ['adds the no upstream badge', {}, [], branch('fix/login-timeout'), 'fix/login-timeout', 'no upstream'],
  ['adds the badge to a branch with no commits', {}, [], branch('main'), 'main', 'no upstream'],
];

describe('branchCell', () => {
  it.each(rows)('%s', async (_name, markers, dirs, head, text, badge) => {
    const files = Object.fromEntries(Object.entries(markers).map(([p, c]) => [`/repo/.git/${p}`, c]));
    const operation = await readOperation('/repo/.git', memFs({ '/repo/.git/HEAD': 'x', ...files }, dirs));
    const cell = branchCell(row({ head, operation }));
    expect(cell.text).toBe(text);
    expect(cell.badge?.text ?? null).toBe(badge);
  });
});
