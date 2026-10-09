// batch-operations :: Fix button matrix (R1–R8) and Retry a failed fetch, on temp clones of their own bare remotes.
// Each case runs the batch, then the line's first fix button, and checks what it did and the line it left.

import * as assert from 'node:assert/strict';
import { renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestApi } from '../../../../src/extension';
import type { FixId } from '../../../../src/shared/batchResult';
import type { BatchAction, BatchParams } from '../../../../src/shared/model';
import { commit, git, pushFromSeed } from '../../fixtures/repos';
import { ready, recordGitCalls } from '../helpers';
import { branchOf, closeTempRepos, openTempRepo, porcelain, refresh, stashList, upstreamOf, type TempRepo } from '../tempRepos';

const NOTES = 'feature/ABC-12-notes';

/** 3 changed files: one modified, one staged and one untracked. */
function dirty(path: string): void {
  writeFileSync(join(path, 'README.md'), 'changed\n');
  writeFileSync(join(path, 'staged.md'), 'staged\n');
  git(path, 'add', 'staged.md');
  writeFileSync(join(path, 'todo.txt'), 'untracked\n');
}

describe('fix buttons', () => {
  let api: TestApi;
  const repos: TempRepo[] = [];
  const open = async (name: string, setup: (path: string, seed: string) => void) => {
    const repo = await openTempRepo(api, name, setup);
    repos.push(repo);
    return repo;
  };
  /** Runs a batch from the dashboard and returns the repository's line of the result panel. */
  const batch = async (action: BatchAction, repo: TempRepo, params: BatchParams = {}) => {
    await refresh(api, repo);
    await api.actions.runBatch(action, [repo.id], { params, fromDashboard: true });
    const line = api.actions.results.lineOf(repo.id);
    assert.ok(line, `${repo.name} has a line`);
    return line;
  };
  const fix = async (repo: TempRepo, id: FixId) => {
    await api.actions.fix(repo.id, id);
    return api.actions.results.lineOf(repo.id);
  };

  before(async () => {
    api = await ready(14);
  });
  after(async () => {
    await closeTempRepos(api, repos);
  });

  it('R1 stashes, then pulls (ff), with Stash and pull', async () => {
    const repo = await open('fx-dirty', (path, seed) => {
      pushFromSeed(seed, 'remote.md', 'Remote change');
      git(path, 'fetch');
      dirty(path);
    });
    const line = await batch('pullFf', repo);
    assert.equal(line.text, '↷ fx-dirty  dirty (3 files)');
    assert.deepEqual(line.fixes, ['stashAndPull']);
    assert.equal((await fix(repo, 'stashAndPull'))?.text, '✓ fx-dirty  fast-forwarded 1 commit');
    assert.deepEqual(stashList(repo.path), ['On main: RepoHangar: before pulling']);
    assert.equal(git(repo.path, 'rev-parse', 'HEAD'), git(repo.path, 'rev-parse', 'origin/main'));
    assert.equal(porcelain(repo.path), '');
  });

  it('R2 pulls with rebase with git.pullRebase, and offers Open SCM', async () => {
    const repo = await open('fx-diverged', (path, seed) => {
      pushFromSeed(seed, 'remote.md', 'Remote change');
      commit(path, 'local.md', 'Local change');
      git(path, 'fetch');
    });
    const line = await batch('pullFf', repo);
    assert.equal(line.text, '↷ fx-diverged  diverged (↑1 ↓1)');
    assert.deepEqual(line.fixes, ['pullRebase', 'openScm']);
    const recorder = recordGitCalls(api);
    try {
      assert.equal((await fix(repo, 'pullRebase'))?.text, '✓ fx-diverged  pulled with rebase');
      assert.deepEqual(recorder.commands, [{ command: 'git.pullRebase', args: [repo.repository.rootUri] }]);
    } finally {
      recorder.restore();
    }
  });

  it('R3 publishes a branch without upstream to the chosen remote', async () => {
    const repo = await open('fx-noupstream', (path) => git(path, 'checkout', '-b', 'fix/login-timeout'));
    const line = await batch('pullFf', repo);
    assert.equal(line.text, '↷ fx-noupstream  no upstream');
    assert.deepEqual(line.fixes, ['publish']);
    assert.equal((await fix(repo, 'publish'))?.text, '✓ fx-noupstream  published');
    assert.equal(upstreamOf(repo.path), 'origin/fix/login-timeout');
    assert.ok(git(repo.bare, 'branch', '--list', 'fix/login-timeout').includes('fix/login-timeout'));
  });

  it('R4 opens Source Control for an operation in progress', async () => {
    const repo = await open('fx-rebasing', (path, seed) => {
      pushFromSeed(seed, 'README.md', 'Remote readme');
      commit(path, 'README.md', 'Local readme');
      git(path, 'fetch');
      try {
        git(path, 'rebase', 'origin/main');
      } catch {
        // Stopped on the conflict, as intended.
      }
    });
    const line = await batch('switch', repo, { branch: NOTES, dirtyChoice: 'skip' });
    assert.equal(line.text, '↷ fx-rebasing  rebase in progress');
    assert.deepEqual(line.fixes, ['openScm']);
    const recorder = recordGitCalls(api);
    try {
      await fix(repo, 'openScm');
      assert.deepEqual(recorder.commands, [{ command: 'repohangar.showInSourceControl', args: [repo.repository.rootUri] }]);
    } finally {
      recorder.restore();
      git(repo.path, 'rebase', '--abort');
    }
  });

  it('R5 shows the Git output for a failed fetch', async () => {
    const repo = await open('fx-unreachable', (path) => git(path, 'remote', 'set-url', 'origin', join(path, '..', 'missing.git')));
    const line = await batch('fetch', repo);
    assert.equal(line.state, 'failed');
    assert.deepEqual(line.fixes, ['showGitOutput']);
    const recorder = recordGitCalls(api);
    try {
      await fix(repo, 'showGitOutput');
      assert.deepEqual(recorder.commands, [{ command: 'git.showOutput', args: [] }]);
    } finally {
      recorder.restore();
    }
  });

  it('R6 stashes, then switches, with Stash and switch', async () => {
    const repo = await open('fx-switchdirty', (path) => {
      git(path, 'branch', NOTES);
      dirty(path);
    });
    const line = await batch('switch', repo, { branch: NOTES, dirtyChoice: 'skip' });
    assert.equal(line.text, '↷ fx-switchdirty  dirty (3 files)');
    assert.deepEqual(line.fixes, ['stashAndSwitch']);
    assert.equal((await fix(repo, 'stashAndSwitch'))?.text, '✓ fx-switchdirty  stashed 3 files');
    assert.equal(branchOf(repo.path), NOTES);
    assert.deepEqual(stashList(repo.path), [`On main: RepoHangar: before switching to ${NOTES}`]);
  });

  it('R7 creates the missing branch from HEAD with Create branch here', async () => {
    const repo = await open('fx-nobranch', () => undefined);
    const head = git(repo.path, 'rev-parse', 'HEAD').trim();
    const line = await batch('switch', repo, { branch: NOTES, dirtyChoice: 'skip' });
    assert.equal(line.text, `↷ fx-nobranch  no branch ${NOTES}`);
    assert.deepEqual(line.fixes, ['createBranchHere']);
    assert.equal((await fix(repo, 'createBranchHere'))?.text, `✓ fx-nobranch  created from ${head.slice(0, 7)}`);
    assert.equal(branchOf(repo.path), NOTES);
    assert.equal(git(repo.path, 'rev-parse', 'HEAD').trim(), head);
  });

  it('R8 offers no button for an ok result, and a fix sent for it does nothing', async () => {
    const repo = await open('fx-ok', (path) => git(path, 'branch', NOTES));
    const other = await open('fx-ok-missing', () => undefined);
    await refresh(api, repo);
    await refresh(api, other);
    await api.actions.runBatch('switch', [repo.id, other.id], { params: { branch: NOTES, dirtyChoice: 'skip' }, fromDashboard: true });
    const line = api.actions.results.lineOf(repo.id);
    assert.equal(line?.text, `✓ fx-ok  switched to ${NOTES}`);
    assert.deepEqual(line?.fixes, []);
    const recorder = recordGitCalls(api);
    try {
      await api.actions.fix(repo.id, 'openScm');
      assert.deepEqual(recorder.commands, []);
    } finally {
      recorder.restore();
    }
  });

  it('retries a failed fetch on that repository only', async () => {
    const repo = await open('fx-retry', () => undefined);
    const local = await open('fx-noremote', (path) => git(path, 'remote', 'remove', 'origin'));
    const moved = `${repo.bare}-away`;
    renameSync(repo.bare, moved);
    try {
      await refresh(api, repo);
      await refresh(api, local);
      await api.actions.runBatch('fetch', [repo.id, local.id], { fromDashboard: true });
      assert.equal(api.actions.results.lineOf(repo.id)?.state, 'failed');
      assert.equal(api.actions.results.lineOf(local.id)?.text, '↷ fx-noremote  no remote');
      assert.equal(api.actions.results.panel()?.canRetry, true);
    } finally {
      renameSync(moved, repo.bare);
    }
    const recorder = recordGitCalls(api, ['fetch']);
    try {
      await api.actions.retryFailed();
      assert.deepEqual(recorder.calls.map((c) => [c.name, c.method, c.args]), [['fx-retry', 'fetch', [{ prune: true }]]]);
    } finally {
      recorder.restore();
    }
    const panel = api.actions.results.panel();
    assert.deepEqual(panel?.lines.map((l) => l.text), ['✓ fx-retry  fetched', '↷ fx-noremote  no remote']);
    assert.equal(panel?.canRetry, false);
  });
});
