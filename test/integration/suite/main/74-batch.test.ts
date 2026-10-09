// batch-operations :: Pull all (ff) on the fixture (Pull (ff) eligibility matrix R2, R6, R7, R9, R11), and the
// scenarios Concurrency limit, Fetch timeout, Cancel a batch, Fetch all twice in a row and Pull (ff) on a dirty
// repository. Every change to the fixture is undone, since the next suites read it.

import * as assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { TestApi } from '../../../../src/extension';
import type { Repository } from '../../../../src/git/git';
import type { JobResult } from '../../../../src/shared/model';
import { git } from '../../fixtures/repos';
import { closeAllEditors, ready, recordGitCalls, remotes, repoPath, rowNamed, setConfig, waitFor } from '../helpers';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function idOf(api: TestApi, name: string): string {
  const row = rowNamed(api, name);
  assert.ok(row, `row ${name}`);
  return row.id;
}

function repositoryOf(api: TestApi, name: string): Repository {
  return api.registry.repository(idOf(api, name)) as Repository;
}

/** HEAD, branches and working tree of a repository. */
function state(path: string): string {
  return [git(path, 'rev-parse', 'HEAD'), git(path, 'branch', '-av', '--no-abbrev'), git(path, 'status', '--porcelain')].join('\n');
}

/** Points billing-api's origin, whose host does not exist, at its local bare remote until `restore`. */
function reachableBillingApi(): { restore(): void } {
  const billing = repoPath('backend/billing-api');
  const url = git(billing, 'remote', 'get-url', 'origin').trim();
  git(billing, 'remote', 'set-url', 'origin', join(remotes, 'billing-api.git'));
  return { restore: () => git(billing, 'remote', 'set-url', 'origin', url) };
}

/** Replaces `repository.fetch` of every repository with one that takes `ms` and counts how many run at once. */
function slowFetches(api: TestApi, ms: number) {
  const counts = { calls: 0, running: 0, max: 0, fetched: new Set<string>() };
  const repositories = api.registry.ids().map((id) => api.registry.repository(id) as Repository);
  for (const repository of repositories) {
    (repository as unknown as Record<string, unknown>).fetch = async () => {
      counts.calls++;
      counts.fetched.add(repository.rootUri.toString());
      counts.running++;
      counts.max = Math.max(counts.max, counts.running);
      await sleep(ms);
      counts.running--;
    };
  }
  return { counts, restore: () => repositories.forEach((r) => delete (r as unknown as Record<string, unknown>).fetch) };
}

/** The listed repositories that have a remote. */
function withRemote(api: TestApi): string[] {
  return api.store.all().filter((r) => r.remote).map((r) => r.id);
}

describe('batch operations', () => {
  let api: TestApi;

  before(async () => {
    api = await ready(14);
    api.dashboard.selection = [];
  });
  afterEach(async () => {
    api.actions.recordNotifications = false;
    api.actions.notifications.length = 0;
    await setConfig('repohangar.concurrency', undefined);
    await setConfig('repohangar.fetchTimeoutSeconds', undefined);
  });

  it('runs Pull all (ff) on the fixture and leaves every skipped repository unchanged', async () => {
    const ledger = repoPath('backend/ledger');
    const newService = repoPath('tools/new-service');
    const skippedPaths: Record<string, string> = {
      'billing-api': repoPath('backend/billing-api'),
      notifications: repoPath('backend/notifications'),
      detached: repoPath('infra/detached'),
      rebasing: repoPath('infra/rebasing'),
    };
    const billing = reachableBillingApi();
    // new-service's GitHub remote would need the network; a missing local remote fails at once.
    git(newService, 'remote', 'set-url', 'origin', join(remotes, 'missing.git'));
    const ledgerHead = git(ledger, 'rev-parse', 'HEAD').trim();
    const before = Object.fromEntries(Object.entries(skippedPaths).map(([name, path]) => [name, state(path)]));
    api.actions.recordNotifications = true;
    try {
      const ids = api.registry.ids();
      const run = await api.actions.runBatch('pullFf', ids);
      assert.equal(run?.kind, 'done');
      const results: Record<string, JobResult> = {};
      ids.forEach((id, i) => (results[api.store.get(id)?.name ?? id] = (run as { results: JobResult[] }).results[i] as JobResult));

      assert.deepEqual(results['billing-api'], { state: 'skipped', detail: 'dirty (3 files)' });
      assert.deepEqual(results.notifications, { state: 'skipped', detail: 'diverged (↑1 ↓1)' });
      assert.deepEqual(results.ledger, { state: 'ok', detail: 'fast-forwarded 2 commits' });
      assert.deepEqual(results.detached, { state: 'skipped', detail: 'detached HEAD' });
      assert.deepEqual(results.rebasing, { state: 'skipped', detail: 'rebase in progress' });
      for (const [name, path] of Object.entries(skippedPaths)) assert.equal(state(path), before[name], `${name} changed`);
      assert.equal(git(ledger, 'rev-parse', 'HEAD'), git(ledger, 'rev-parse', 'origin/main'));
      const merges = api.gitProcessLog.filter((c) => c.args.includes('--ff-only'));
      assert.deepEqual(merges.map((c) => vscode.Uri.file(c.cwd).fsPath), [vscode.Uri.file(ledger).fsPath]);

      const summary = api.actions.notifications.at(-1);
      assert.match(summary?.text ?? '', /^Pull all \(ff\) — finished in \d+\.\d s: ✓ 1 updated · = \d+ up to date · ↷ \d+ skipped · ✗ 1 failed$/);
      // Started from a command: the result panel is offered with Show Details (batch-operations: Batch results).
      assert.deepEqual(summary?.buttons, ['Show Git Output', 'Show Details']);
      await waitFor(() => rowNamed(api, 'notifications')?.job?.detail === 'diverged (↑1 ↓1)' || undefined, 'the skip reason in the row');
    } finally {
      billing.restore();
      git(newService, 'remote', 'set-url', 'origin', 'git@github.com:acme/new-service.git');
      // The next suites expect ledger 2 commits behind.
      git(ledger, 'reset', '--hard', ledgerHead);
      await api.registry.refreshAll();
    }
  });

  it('never runs more fetches at once than repohangar.concurrency', async () => {
    await setConfig('repohangar.concurrency', 2);
    const ids = withRemote(api).slice(1);
    const fetches = slowFetches(api, 150);
    try {
      const run = await api.actions.runBatch('fetch', ids);
      assert.equal(fetches.counts.max, 2);
      assert.equal(fetches.counts.calls, ids.length);
      assert.equal(run?.kind === 'done' && run.results.length, ids.length);
    } finally {
      fetches.restore();
    }
  });

  it('records a fetch whose remote does not answer as timed out', async () => {
    const sockets: Socket[] = [];
    const server = createServer((socket) => sockets.push(socket));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const scratch = repoPath('tools/scratch');
    git(scratch, 'remote', 'add', 'origin', `http://127.0.0.1:${port}/hang.git`);
    await setConfig('repohangar.fetchTimeoutSeconds', 5);
    try {
      await repositoryOf(api, 'scratch').status();
      await waitFor(async () => (await api.registry.compute(idOf(api, 'scratch')))?.remote !== null || undefined, 'the scratch remote');
      const start = Date.now();
      const run = await api.actions.runBatch('fetch', [idOf(api, 'scratch'), idOf(api, 'ledger')]);
      const elapsed = Date.now() - start;
      assert.deepEqual(run?.kind === 'done' && run.results, [{ state: 'failed', detail: 'timed out after 5 s' }, { state: 'ok' }]);
      assert.ok(elapsed >= 5000 && elapsed < 8000, `batch took ${elapsed} ms`);
    } finally {
      for (const socket of sockets) socket.destroy();
      server.close();
      git(scratch, 'remote', 'remove', 'origin');
      await repositoryOf(api, 'scratch').status();
    }
  });

  it('lets running fetches finish and skips the repositories not started when canceled', async () => {
    await setConfig('repohangar.concurrency', 2);
    const ids = withRemote(api).slice(0, 6);
    const fetches = slowFetches(api, 300);
    const source = new vscode.CancellationTokenSource();
    try {
      const run = await api.runner.runBatch('fetch', ids, (id) => api.operations.batchJob('fetch', id), {
        token: source.token,
        onProgress: (done) => done === 2 && source.cancel(),
      });
      const results = run.kind === 'done' ? run.results : [];
      // 2 finished, 2 were running when canceled and finish, 2 had not started.
      assert.equal(fetches.counts.calls, 4);
      assert.equal(results.filter((r) => r.state === 'ok').length, 4);
      const canceled = ids.filter((_, i) => results[i]?.state === 'skipped');
      assert.deepEqual(canceled.map((id) => results[ids.indexOf(id)]), [
        { state: 'skipped', detail: 'canceled' },
        { state: 'skipped', detail: 'canceled' },
      ]);
      for (const id of canceled) assert.ok(!fetches.counts.fetched.has(id), `${id} was fetched`);
    } finally {
      fetches.restore();
      source.dispose();
    }
  });

  it('starts no fetch for a second Fetch all on the same repositories', async () => {
    const recorder = recordGitCalls(api);
    api.actions.recordNotifications = true;
    try {
      const first = await vscode.commands.executeCommand<{ kind: string }>('repohangar.fetchAll');
      assert.equal(first?.kind, 'done');
      const fetches = recorder.calls.length;
      await sleep(1100);
      const second = await vscode.commands.executeCommand<{ kind: string }>('repohangar.fetchAll');
      assert.deepEqual(second, { kind: 'recent', seconds: 1 });
      assert.equal(recorder.calls.length, fetches);
      assert.equal(api.actions.notifications.at(-1)?.text, 'These repositories were fetched 1 s ago.');
    } finally {
      recorder.restore();
    }
  });

  it('fetches a dirty repository with repohangar.pullFf and does not merge', async () => {
    const billing = reachableBillingApi();
    const recorder = recordGitCalls(api, ['fetch']);
    const processes = api.gitProcessLog.length;
    api.actions.recordNotifications = true;
    try {
      await vscode.window.showTextDocument(vscode.Uri.file(join(repoPath('backend/billing-api'), 'README.md')));
      await vscode.commands.executeCommand('repohangar.pullFf');
      assert.deepEqual(recorder.calls.map((c) => [c.name, c.method, c.args]), [['billing-api', 'fetch', [{ prune: true }]]]);
      assert.ok(!api.gitProcessLog.slice(processes).some((c) => c.args.includes('merge')));
      assert.deepEqual(api.actions.notifications.map((n) => n.text), ['Pull (ff) skipped in billing-api: dirty (3 files).']);
    } finally {
      recorder.restore();
      billing.restore();
      await closeAllEditors();
    }
  });
});
