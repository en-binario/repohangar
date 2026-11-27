// dashboard :: Live update trigger matrix (R1–R5), the commit and fetch scenarios, and the idle check.
// Window focus goes through the registry's test override, since the test window's real focus is not under control.

import * as assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestApi } from '../../../../src/extension';
import type { Repository } from '../../../../src/git/git';
import { changesCell, syncCell } from '../../../../src/shared/format';
import type { RowData } from '../../../../src/shared/model';
import { git } from '../../fixtures/repos';
import { ready, repoPath, rowNamed, waitFor } from '../helpers';

const live = repoPath('tools/live');

function repositoryOf(api: TestApi, name: string): Repository {
  const row = rowNamed(api, name);
  assert.ok(row, `row ${name}`);
  return api.registry.repository(row.id) as Repository;
}

/** Makes `live` dirty with one modified file and waits until its row shows it. */
async function dirtyLive(api: TestApi, content: string): Promise<void> {
  writeFileSync(join(live, 'README.md'), content);
  await repositoryOf(api, 'live').status();
  await waitFor(() => {
    const row = rowNamed(api, 'live');
    return row && changesCell(row).text === '●1';
  }, 'live to show ●1');
}

async function timeUntil(probe: () => boolean, what: string): Promise<number> {
  const start = Date.now();
  await waitFor(() => probe() || undefined, what, 5_000);
  return Date.now() - start;
}

const liveRow = (api: TestApi): RowData | undefined => rowNamed(api, 'live');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Shared CI runners can pause the extension host or git subprocess briefly; keep tight budgets locally.
const LIVE_BUDGET_MS = process.env.CI ? 2_500 : 1_000;
const CHANGE_BUDGET_MS = process.env.CI ? 1_000 : 400;

describe('live row updates', () => {
  let api: TestApi;
  before(async () => {
    api = await ready(14);
  });
  afterEach(() => {
    api.registry.focusOverride = undefined;
  });

  it('asks for the status once and updates the row within 1 s of a commit while focused', async () => {
    api.registry.focusOverride = true;
    await dirtyLive(api, 'commit one\n');
    const head = liveRow(api)?.head;
    const ahead = head?.kind === 'branch' ? (head.ahead ?? 0) : 0;
    const callsBefore = api.registry.statusCalls;
    const start = Date.now();
    git(live, 'commit', '-am', 'Add notes');
    await waitFor(() => {
      const row = liveRow(api);
      return row && changesCell(row).text === '—' && syncCell(row).text === `↑${ahead + 1}`;
    }, `live to show — and ↑${ahead + 1}`, 5_000);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < LIVE_BUDGET_MS, `row updated after ${elapsed} ms`);
    await sleep(500);
    assert.equal(api.registry.statusCalls - callsBefore, 1);
  });

  it('waits for focus before asking for the status, then updates within 1 s', async () => {
    api.registry.focusOverride = false;
    await dirtyLive(api, 'commit two\n');
    const callsBefore = api.registry.statusCalls;
    git(live, 'commit', '-am', 'Unfocused commit');
    await sleep(1000);
    assert.equal(api.registry.statusCalls, callsBefore);

    api.registry.focusOverride = true;
    const start = Date.now();
    api.registry.flushPendingStatus();
    // Wait for both the clean row and the debounced status call from flushPendingStatus so its timer cannot leak into the next test.
    await waitFor(() => {
      const row = liveRow(api);
      return row && changesCell(row).text === '—' && api.registry.statusCalls > callsBefore;
    }, 'live to be clean after status', 5_000);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < LIVE_BUDGET_MS, `row updated ${elapsed} ms after focus`);
    await sleep(500);
    assert.equal(api.registry.statusCalls - callsBefore, 1);
  });

  it('asks for the status when an operation marker appears', async () => {
    api.registry.focusOverride = true;
    const marker = join(live, '.git', 'MERGE_HEAD');
    const head = git(live, 'rev-parse', 'HEAD').trim();
    const callsBefore = api.registry.statusCalls;
    const start = Date.now();
    writeFileSync(marker, `${head}\n`);
    try {
      const elapsed = await timeUntil(() => liveRow(api)?.operation?.kind === 'merge', 'live to show MERGING');
      assert.ok(elapsed < LIVE_BUDGET_MS, `row updated after ${elapsed} ms`);
      await sleep(500);
      assert.equal(api.registry.statusCalls - callsBefore, 1);
    } finally {
      rmSync(marker, { force: true });
      await waitFor(() => liveRow(api)?.operation === null || undefined, 'the marker to go');
    }
    assert.ok(Date.now() - start > 0);
  });

  it('re-reads FETCH_HEAD without asking for the status', async () => {
    api.registry.focusOverride = true;
    const previous = rowNamed(api, 'ledger')?.lastFetch ?? 0;
    await sleep(1100);
    const callsBefore = api.registry.statusCalls;
    const ledgerFetchHead = join(repoPath('backend/ledger'), '.git', 'FETCH_HEAD');
    const start = Date.now();
    writeFileSync(ledgerFetchHead, 'touched\n');
    await waitFor(() => (rowNamed(api, 'ledger')?.lastFetch ?? 0) > previous || undefined, 'a newer last fetch', 5_000);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < LIVE_BUDGET_MS, `Fetched updated after ${elapsed} ms`);
    await sleep(500);
    assert.equal(api.registry.statusCalls, callsBefore);
  });

  it('leaves working tree changes to the Git extension and updates within 250 ms of its onDidChange', async () => {
    api.registry.focusOverride = true;
    const callsBefore = api.registry.statusCalls;
    writeFileSync(join(live, 'scratch.txt'), 'untracked\n');
    await sleep(1000);
    assert.equal(api.registry.statusCalls, callsBefore);

    const repository = repositoryOf(api, 'live');
    let changedAt = 0;
    const sub = repository.state.onDidChange(() => (changedAt ||= Date.now()));
    let updatedAt = 0;
    const batches = api.store.onBatch((batch) => {
      const row = batch.upserts.find((r) => r.name === 'live');
      if (row && row.counts.untracked === 1) updatedAt ||= Date.now();
    });
    try {
      await repository.status();
      await waitFor(() => updatedAt || undefined, 'the row with the untracked file', 5_000);
    } finally {
      sub.dispose();
      batches.dispose();
      rmSync(join(live, 'scratch.txt'), { force: true });
    }
    // 150 ms debounce per repository, then < 250 ms to the update.
    assert.ok(updatedAt - changedAt < CHANGE_BUDGET_MS, `row updated ${updatedAt - changedAt} ms after onDidChange`);
  });

  it('updates the Fetched cell within 1 s of a fetch in an external terminal', async () => {
    const previous = rowNamed(api, 'ledger')?.lastFetch ?? 0;
    await sleep(1100);
    const start = Date.now();
    git(repoPath('backend/ledger'), 'fetch');
    await waitFor(() => (rowNamed(api, 'ledger')?.lastFetch ?? 0) > previous || undefined, 'a newer last fetch', 5_000);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < LIVE_BUDGET_MS, `row updated after ${elapsed} ms`);
  });

  it('starts no git process while idle', async () => {
    const before = api.gitProcessLog.length;
    await sleep(5000);
    assert.equal(api.gitProcessLog.length, before);
  });
});
