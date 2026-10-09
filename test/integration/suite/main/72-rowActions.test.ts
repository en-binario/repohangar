// git-operations :: Row action matrix (R1–R13), and the scenarios Fetch a repository without a remote, Fetch pressed
// twice and Fetch from the Source Control Repositories menu, run through the dashboard's messages.
// Network calls other than R1's fetch are replaced, so the fixture keeps its state for the next suites.

import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { TestApi } from '../../../../src/extension';
import type { Repository } from '../../../../src/git/git';
import type { RowAction } from '../../../../src/shared/model';
import { ready, recordGitCalls as record, rowNamed, waitFor, type GitCallRecorder as Recorder, type GitMethod as Method } from '../helpers';

function idOf(api: TestApi, name: string): string {
  const row = rowNamed(api, name);
  assert.ok(row, `row ${name}`);
  return row.id;
}

function rootOf(api: TestApi, name: string): vscode.Uri {
  return (api.registry.repository(idOf(api, name)) as Repository).rootUri;
}

function run(api: TestApi, name: string, action: RowAction): Promise<void> {
  return api.dashboard.receiveForTest({ type: 'runAction', id: idOf(api, name), action });
}

describe('row actions', () => {
  let api: TestApi;
  let recorder: Recorder;

  before(async () => {
    api = await ready(14);
  });
  beforeEach(() => {
    recorder = record(api, ['fetch']);
  });
  afterEach(() => recorder.restore());

  const calls = (method: Method) => recorder.calls.filter((c) => c.method === method);

  it('R1 fetches with prune through the Git API', async () => {
    await run(api, 'ledger', 'fetch');
    assert.deepEqual(calls('fetch').map((c) => [c.name, c.args]), [['ledger', [{ prune: true }]]]);
    assert.equal(rowNamed(api, 'ledger')?.job?.state, 'ok');
  });

  it('R2 pulls through the Git API', async () => {
    await run(api, 'ledger', 'pull');
    assert.deepEqual(calls('pull').map((c) => [c.name, c.args]), [['ledger', []]]);
  });

  it('R3 pushes to the upstream through the Git API', async () => {
    await run(api, 'web-shop', 'push');
    assert.deepEqual(calls('push').map((c) => [c.name, c.args]), [['web-shop', []]]);
  });

  it('R4 publishes a branch without upstream to the chosen remote', async () => {
    await run(api, 'auth-service', 'push');
    assert.deepEqual(calls('push').map((c) => [c.name, c.args]), [['auth-service', ['origin', 'fix/login-timeout', true]]]);
    assert.equal(rowNamed(api, 'auth-service')?.job?.action, 'publish');
  });

  it('R5 syncs with git.sync and the repository', async () => {
    await run(api, 'notifications', 'sync');
    assert.deepEqual(recorder.commands, [{ command: 'git.sync', args: [rootOf(api, 'notifications')] }]);
  });

  it('R6 switches branch with git.checkout and the repository', async () => {
    await run(api, 'billing-api', 'switchBranch');
    assert.deepEqual(recorder.commands, [{ command: 'git.checkout', args: [rootOf(api, 'billing-api')] }]);
  });

  it('R7 opens a terminal named after the repository in its root', async () => {
    await run(api, 'ledger', 'terminal');
    const terminal = await waitFor(() => vscode.window.terminals.find((t) => t.name === 'ledger'), 'the ledger terminal');
    try {
      const cwd = (terminal.creationOptions as vscode.TerminalOptions).cwd;
      assert.equal((cwd as vscode.Uri).fsPath, rootOf(api, 'ledger').fsPath);
      await waitFor(() => vscode.window.activeTerminal === terminal, 'the terminal to be shown');
    } finally {
      terminal.dispose();
    }
  });

  it('R8 stashes with git.stash and the repository', async () => {
    await run(api, 'billing-api', 'stash');
    assert.deepEqual(recorder.commands, [{ command: 'git.stash', args: [rootOf(api, 'billing-api')] }]);
  });

  it('R9 pops the latest stash with git.stashPopLatest and the repository', async () => {
    await run(api, 'stashed', 'stashPop');
    assert.deepEqual(recorder.commands, [{ command: 'git.stashPopLatest', args: [rootOf(api, 'stashed')] }]);
  });

  it('R10 discards all changes with git.cleanAll and the repository', async () => {
    await run(api, 'billing-api', 'discardAll');
    assert.deepEqual(recorder.commands, [{ command: 'git.cleanAll', args: [rootOf(api, 'billing-api')] }]);
  });

  it('R11 reveals the repository root in the OS file manager', async () => {
    await run(api, 'ledger', 'revealInOS');
    assert.deepEqual(recorder.commands, [{ command: 'revealFileInOS', args: [rootOf(api, 'ledger')] }]);
  });

  it('R12 copies the repository root path', async () => {
    await run(api, 'ledger', 'copyPath');
    assert.equal(await vscode.env.clipboard.readText(), rootOf(api, 'ledger').fsPath);
  });

  it('R13 copies the branch name', async () => {
    await run(api, 'billing-api', 'copyBranch');
    assert.equal(await vscode.env.clipboard.readText(), 'feature/ABC-12-notes');
  });

  it('does not fetch a repository without a remote', async () => {
    await run(api, 'scratch', 'fetch');
    assert.deepEqual(calls('fetch'), []);
    await waitFor(() => rowNamed(api, 'scratch')?.job?.detail === 'no remote', 'scratch to show no remote');
    assert.deepEqual(rowNamed(api, 'scratch')?.job, { action: 'fetch', state: 'skipped', detail: 'no remote' });
  });

  it('fetches once when f is pressed twice', async () => {
    recorder.restore();
    recorder = record(api, [], 500);
    const first = run(api, 'ledger', 'fetch');
    await waitFor(() => rowNamed(api, 'ledger')?.job?.state === 'running' || undefined, 'ledger to show fetching');
    await run(api, 'ledger', 'fetch');
    await first;
    assert.equal(calls('fetch').length, 1);
  });

  it('fetches from the Source Control Repositories menu', async () => {
    const manifest = vscode.extensions.getExtension('enbinario.repohangar')?.packageJSON as {
      contributes: { menus: Record<string, { command: string; when?: string }[]>; commands: { command: string; title: string }[] };
    };
    const item = manifest.contributes.menus['scm/sourceControl']?.find((m) => m.command === 'repohangar.scm.fetch');
    assert.equal(item?.when, 'scmProvider == git');
    assert.equal(manifest.contributes.commands.find((c) => c.command === 'repohangar.scm.fetch')?.title, 'Fetch');
    // The menu passes the Source Control repository, an object with the repository root.
    const sourceControl = { id: 'git', label: 'Git', rootUri: rootOf(api, 'ledger') };
    await vscode.commands.executeCommand('repohangar.scm.fetch', sourceControl);
    await vscode.commands.executeCommand('repohangar.fetch', sourceControl);
    assert.deepEqual(calls('fetch').map((c) => [c.name, c.args]), [
      ['ledger', [{ prune: true }]],
      ['ledger', [{ prune: true }]],
    ]);
  });

  it('ignores actions and batches on ids that are not listed repositories', async () => {
    await api.dashboard.receiveForTest({ type: 'runAction', id: 'file:///nowhere/repo', action: 'fetch' });
    await api.dashboard.receiveForTest({ type: 'runBatch', action: 'fetch', ids: ['file:///nowhere/a', 'file:///nowhere/b'] });
    assert.deepEqual(recorder.calls, []);
  });

  it('shows a failed fetch with Show Git Output and without credentials', async () => {
    api.actions.notifications.length = 0;
    api.actions.recordNotifications = true;
    try {
      // billing-api's origin is on a host that does not exist.
      await run(api, 'billing-api', 'fetch');
    } finally {
      api.actions.recordNotifications = false;
    }
    const [notification] = api.actions.notifications;
    assert.ok(notification, 'a notification');
    assert.match(notification.text, /^Fetch failed in billing-api: .+/);
    assert.deepEqual(notification.buttons, ['Show Git Output']);
    assert.ok(!notification.text.includes('glpat-x1y2z3'));
    assert.equal(rowNamed(api, 'billing-api')?.job?.state, 'failed');
  });
});
