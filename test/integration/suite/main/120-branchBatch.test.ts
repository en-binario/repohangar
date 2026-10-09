// batch-operations :: Switch eligibility matrix R6, R8, R9 and R11 on real repositories, and the stash of Stash and
// switch (`git stash push --include-untracked`, design D-3). Every repository is a temp clone of its own bare remote.

import * as assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestApi } from '../../../../src/extension';
import { stashPush } from '../../../../src/git/fastPaths';
import type { BatchRun } from '../../../../src/jobs/runner';
import type { DirtyChoice, JobResult } from '../../../../src/shared/model';
import { commit, git } from '../../fixtures/repos';
import { ready, waitFor } from '../helpers';
import { branchOf, closeTempRepos, openTempRepo, porcelain, refresh, stashList, upstreamOf, type TempRepo } from '../tempRepos';

const NOTES = 'feature/ABC-12-notes';
const STASH = `RepoHangar: before switching to ${NOTES}`;

/** feature/ABC-12-notes with one commit, pushed, and HEAD back on main. */
function withLocalNotes(path: string): void {
  git(path, 'checkout', '-b', NOTES);
  commit(path, 'notes.md', 'Add notes field');
  git(path, 'push', '-u', 'origin', NOTES);
  git(path, 'checkout', 'main');
}

/** 3 changed files: one modified, one staged and one untracked. */
function dirty(path: string): void {
  writeFileSync(join(path, 'README.md'), 'changed\n');
  writeFileSync(join(path, 'staged.md'), 'staged\n');
  git(path, 'add', 'staged.md');
  writeFileSync(join(path, 'todo.txt'), 'untracked\n');
}

function results(run: BatchRun | undefined): JobResult[] {
  assert.equal(run?.kind, 'done');
  return (run as { results: JobResult[] }).results;
}

describe('switch branch in repositories', () => {
  let api: TestApi;
  const repos: TempRepo[] = [];
  const open = async (name: string, setup: (path: string, seed: string) => void) => {
    const repo = await openTempRepo(api, name, setup);
    repos.push(repo);
    return repo;
  };
  const switchIn = (repo: TempRepo, dirtyChoice: DirtyChoice) =>
    api.actions.runBatch('switch', [repo.id], { params: { branch: NOTES, dirtyChoice }, fromDashboard: true });

  before(async () => {
    api = await ready(14);
  });
  after(async () => {
    await closeTempRepos(api, repos);
  });

  it('stashes 3 changed files, untracked included, in one named stash', async () => {
    const repo = await open('sw-stash', dirty);
    await stashPush(api.git.current?.git.path ?? 'git', repo.path, STASH);
    assert.equal(porcelain(repo.path), '');
    assert.deepEqual(stashList(repo.path), [`On main: ${STASH}`]);
    assert.deepEqual(git(repo.path, 'stash', 'show', '--include-untracked', '--name-only', 'stash@{0}').split('\n').filter(Boolean).sort(), [
      'README.md',
      'staged.md',
      'todo.txt',
    ]);
  });

  it('R6 checks out a local branch', async () => {
    const repo = await open('sw-local', withLocalNotes);
    assert.deepEqual(results(await switchIn(repo, 'skip')), [{ state: 'ok' }]);
    assert.equal(branchOf(repo.path), NOTES);
    assert.equal(upstreamOf(repo.path), `origin/${NOTES}`);
    assert.equal(porcelain(repo.path), '');
  });

  it('R8 creates a tracking branch for a branch only on the remote', async () => {
    const repo = await open('sw-remote', (path, seed) => {
      withLocalNotes(seed);
      git(path, 'fetch');
    });
    assert.deepEqual(git(repo.path, 'branch', '--list', NOTES), '');
    assert.deepEqual(results(await switchIn(repo, 'skip')), [{ state: 'ok', detail: `tracking origin/${NOTES} created` }]);
    assert.equal(branchOf(repo.path), NOTES);
    assert.equal(upstreamOf(repo.path), `origin/${NOTES}`);
    assert.equal(git(repo.path, 'rev-parse', 'HEAD'), git(repo.path, 'rev-parse', `origin/${NOTES}`));
    assert.equal(porcelain(repo.path), '');
  });

  it('R9 stashes 3 files, then checks out the branch', async () => {
    const repo = await open('sw-dirty', withLocalNotes);
    dirty(repo.path);
    await refresh(api, repo);
    // The Git extension's state follows its status run a moment later.
    await waitFor(async () => (await api.operations.branchSnapshot(repo.id))?.dirtyFiles === 3, 'the 3 changed files');
    assert.deepEqual(results(await switchIn(repo, 'stash')), [{ state: 'ok', detail: 'stashed 3 files' }]);
    assert.equal(branchOf(repo.path), NOTES);
    assert.equal(upstreamOf(repo.path), `origin/${NOTES}`);
    assert.equal(porcelain(repo.path), '');
    assert.deepEqual(stashList(repo.path), [`On main: ${STASH}`]);
    assert.ok(api.gitProcessLog.some((c) => c.args.join(' ') === `stash push --include-untracked -m ${STASH}`));
  });

  it('R11 records the refused checkout and leaves HEAD and the working tree unchanged', async () => {
    const repo = await open('sw-conflict', (path) => {
      git(path, 'checkout', '-b', NOTES);
      commit(path, 'README.md', 'Notes readme');
      git(path, 'push', '-u', 'origin', NOTES);
      git(path, 'checkout', 'main');
      writeFileSync(join(path, 'README.md'), 'local change\n');
    });
    await refresh(api, repo);
    const head = git(repo.path, 'rev-parse', 'HEAD');
    const status = porcelain(repo.path);
    const [result] = results(await switchIn(repo, 'switchAnyway'));
    assert.equal(result?.state, 'failed');
    assert.match(result?.detail ?? '', /overwritten by checkout/);
    assert.ok(!(result?.detail ?? '').includes('\n'));
    assert.equal(branchOf(repo.path), 'main');
    assert.equal(git(repo.path, 'rev-parse', 'HEAD'), head);
    assert.equal(porcelain(repo.path), status);
    assert.equal(readFileSync(join(repo.path, 'README.md'), 'utf8'), 'local change\n');
    assert.deepEqual(stashList(repo.path), []);
  });
});
