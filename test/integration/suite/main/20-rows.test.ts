// The rows computed from real repositories: Git API state plus the local fast paths.

import * as assert from 'node:assert/strict';
import { branchCell, changesCell, fetchedCell, repositoryCell, syncCell } from '../../../../src/shared/format';
import { ready, rowNamed } from '../helpers';

async function cells(name: string) {
  const api = await ready(14);
  const row = rowNamed(api, name);
  assert.ok(row, `row ${name}`);
  return {
    row,
    repository: repositoryCell(row).text,
    branch: branchCell(row),
    sync: syncCell(row).text,
    changes: changesCell(row).text,
    fetched: fetchedCell(row.lastFetch, Date.now(), 1).text,
  };
}

describe('rows from real repositories', () => {
  it('billing-api: ahead, unstaged and staged, credentials stripped', async () => {
    const c = await cells('billing-api');
    assert.equal(c.branch.text, 'feature/ABC-12-notes');
    assert.equal(c.sync, '↑2');
    assert.equal(c.changes, '●2 +1');
    assert.equal(c.row.remote?.displayUrl, 'https://git.acme.test/payments/billing-api.git');
    assert.equal(c.repository, 'billing-api ?');
  });

  it('ledger: behind and fetched', async () => {
    const c = await cells('ledger');
    assert.equal(c.sync, '↓2');
    assert.equal(c.fetched, 'now');
  });

  it('notifications: diverged', async () => {
    assert.equal((await cells('notifications')).sync, '↑1 ↓1');
  });

  it('auth-service: no upstream, untracked files', async () => {
    const c = await cells('auth-service');
    assert.equal(c.branch.badge?.text, 'no upstream');
    assert.equal(c.sync, '⇡ publish');
    assert.equal(c.changes, '?2');
    assert.equal(c.fetched, 'never');
  });

  it('stashed: two stashes', async () => {
    assert.equal((await cells('stashed')).changes, '≡2');
  });

  it('detached: detached HEAD', async () => {
    assert.match((await cells('detached')).branch.text, /^detached [0-9a-f]{7}$/);
  });

  it('rebasing: rebase in progress with a conflict', async () => {
    const c = await cells('rebasing');
    assert.equal(c.branch.text, 'REBASING 1/1');
    assert.equal(c.sync, '—');
    assert.match(c.changes, /^⚠ 1 confl/);
  });

  it('merging: merge in progress', async () => {
    const c = await cells('merging');
    assert.equal(c.branch.text, 'MERGING');
    assert.match(c.changes, /^⚠ 1 confl/);
  });

  it('scratch: no remote', async () => {
    const c = await cells('scratch');
    assert.equal(c.row.remote, null);
    assert.equal(c.repository, 'scratch');
    assert.equal(c.sync, '—');
  });

  it('new-service: no commits yet', async () => {
    const c = await cells('new-service');
    assert.equal(c.branch.text, 'main');
    assert.equal(c.branch.badge?.text, 'no upstream');
    assert.equal(c.repository, 'new-service GH');
  });
});
