// hosting-providers :: Copy the link of an open merge request, Copy the link without a credential, Provider chosen
// for an unknown host (repohangar.hostedRoots within 1 s), Hosts setting written by the host choice.

import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { TestApi } from '../../../../src/extension';
import { reviewCell } from '../../../../src/shared/review';
import { ready, recordIntegrations, repoPath, rowNamed, waitFor } from '../helpers';
import { MR_142, answerHttp, graphql, stubAuthUi, users } from './support';

describe('Review commands', () => {
  let api: TestApi;

  before(async () => {
    api = await ready(6);
    api.providers.focusOverride = true;
  });

  async function openFileOf(relative: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(repoPath(relative));
    await vscode.window.showTextDocument(doc);
  }

  it('copies the link of an open merge request', async () => {
    const stop = recordIntegrations(api);
    const ui = stubAuthUi(api, { pasted: ['glpat-x1y2'] });
    const http = answerHttp(api, [users({ 'glpat-x1y2': 'ana.perez' }), graphql('git.acme.com', () => [MR_142])]);
    try {
      await api.providers.auth.signIn('git.acme.com');
      await waitFor(() => reviewCell(rowNamed(api, 'billing-api')?.review, Date.now()).text.startsWith('!142'), 'the merge request');
      await openFileOf('backend/billing-api/README.md');
      await vscode.commands.executeCommand('repohangar.mr.copyLink');
      assert.equal(await vscode.env.clipboard.readText(), 'https://git.acme.com/payments/billing-api/-/merge_requests/142');
    } finally {
      await api.providers.signOut('git.acme.com');
      http.restore();
      ui.restore();
      stop();
    }
  });

  it('copies nothing without a credential and names the branch', async () => {
    const stop = recordIntegrations(api);
    try {
      await api.providers.signOut('git.acme.com');
      await waitFor(() => rowNamed(api, 'billing-api')?.review?.kind === 'signIn', 'Sign in');
      await vscode.env.clipboard.writeText('unchanged');
      await openFileOf('backend/billing-api/README.md');
      await vscode.commands.executeCommand('repohangar.mr.copyLink');
      assert.equal(await vscode.env.clipboard.readText(), 'unchanged');
      assert.ok(
        api.notifier.shown.some((n) => n.text === 'No merge request loaded for feature/ABC-12-notes in billing-api.'),
        JSON.stringify(api.notifier.shown),
      );
    } finally {
      stop();
    }
  });

  it('adds a repository to repohangar.hostedRoots within 1 s of choosing its provider', async () => {
    // Uri.fsPath, as the context key holds it (a lower-case drive letter on Windows).
    const charts = rowNamed(api, 'charts')?.path as string;
    const before = vscode.workspace.getConfiguration('repohangar').inspect<Record<string, string>>('hosts')?.globalValue;
    assert.equal(rowNamed(api, 'charts')?.provider, 'unknown');
    assert.ok(!api.providers.hostedRootPaths.includes(charts));
    api.providers.pickProvider = async () => 'gitlab';
    try {
      await api.dashboard.receiveForTest({ type: 'chooseProvider', host: 'git.unknown.test' });
      const started = Date.now();
      await waitFor(() => api.providers.hostedRootPaths.includes(charts), 'charts in repohangar.hostedRoots', 1000);
      assert.ok(Date.now() - started <= 1000);
      assert.deepEqual(vscode.workspace.getConfiguration('repohangar').inspect('hosts')?.globalValue, { ...(before ?? {}), 'git.unknown.test': 'gitlab' });
      assert.equal(rowNamed(api, 'charts')?.provider, 'gitlab');
      // Host chosen in a workspace with its own hosts: the workspace value stays and still applies.
      assert.deepEqual(vscode.workspace.getConfiguration('repohangar').inspect('hosts')?.workspaceValue, { 'git.acme.com': 'gitlab', 'github.acme.com': 'github' });
      assert.equal(rowNamed(api, 'billing-api')?.provider, 'gitlab');
    } finally {
      await vscode.workspace.getConfiguration('repohangar').update('hosts', before, vscode.ConfigurationTarget.Global);
    }
  });

  it('writes nothing when the host choice is dismissed', async () => {
    const before = vscode.workspace.getConfiguration('repohangar').inspect('hosts');
    api.providers.pickProvider = async () => undefined;
    await api.dashboard.receiveForTest({ type: 'chooseProvider', host: 'git.unknown.test' });
    const after = vscode.workspace.getConfiguration('repohangar').inspect('hosts');
    assert.deepEqual([after?.globalValue, after?.workspaceValue], [before?.globalValue, before?.workspaceValue]);
  });
});
