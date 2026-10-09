// explorer-open-in-git-graph :: RepoHangar submenu (Fetch from a subfolder) and Show in RepoHangar (Show a
// filtered-out repository: the host part; the filter and the focus are checked in test/ui/explorer.spec.ts).

import * as assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import * as vscode from 'vscode';
import type { TestApi } from '../../../../src/extension';
import {
  dashboardTabs,
  idOf,
  openDashboardAndWait,
  ready,
  recordGitCalls,
  recordIntegrations,
  repoPath,
  waitFor,
} from '../helpers';

const manifest = vscode.extensions.getExtension('enbinario.repohangar')?.packageJSON as {
  contributes: {
    submenus: { id: string; label: string }[];
    menus: Record<string, { command?: string; submenu?: string; when?: string; group?: string }[]>;
    commands: { command: string; title: string }[];
  };
};

describe('Explorer RepoHangar submenu', () => {
  let api: TestApi;

  before(async () => {
    api = await ready(14);
  });

  it('lists Show in RepoHangar, Fetch and Pull (ff), then the merge request items of hosted roots, in the RepoHangar submenu', () => {
    assert.deepEqual(manifest.contributes.submenus, [{ id: 'repohangar.explorer', label: 'RepoHangar' }]);
    const titles = Object.fromEntries(manifest.contributes.commands.map((c) => [c.command, c.title]));
    assert.deepEqual(
      (manifest.contributes.menus['repohangar.explorer'] ?? []).map((m) => titles[m.command as string]),
      ['Show in RepoHangar', 'Fetch', 'Pull (ff)', 'Create MR', 'Create MR…', 'Open MR'],
    );
    // mr-creation: Merge request menu items, only on the roots of GitLab and GitHub repositories.
    assert.deepEqual(
      (manifest.contributes.menus['repohangar.explorer'] ?? []).slice(3).map((m) => m.when),
      Array(3).fill('resourcePath in repohangar.hostedRoots'),
    );
    const item = manifest.contributes.menus['explorer/context']?.find((m) => m.submenu === 'repohangar.explorer');
    assert.equal(item?.group, 'navigation@101');
    assert.match(item?.when ?? '', /config\.repohangar\.explorer\.submenu/);
  });

  it('fetches the repository of a subfolder', async () => {
    const src = repoPath('backend/ledger/src');
    mkdirSync(src, { recursive: true });
    const recorder = recordGitCalls(api);
    try {
      await vscode.commands.executeCommand('repohangar.explorer.fetch', vscode.Uri.file(src));
    } finally {
      recorder.restore();
    }
    assert.deepEqual(recorder.calls.map((c) => [c.name, c.method, c.args]), [['ledger', 'fetch', [{ prune: true }]]]);
  });

  it('pulls (ff) the repository of a subfolder', async () => {
    mkdirSync(repoPath('backend/billing-api/src'), { recursive: true });
    // billing-api is dirty, so Pull (ff) skips it and says why; the fixture keeps its state.
    const recorder = recordGitCalls(api);
    api.actions.notifications.length = 0;
    api.actions.recordNotifications = true;
    try {
      await vscode.commands.executeCommand('repohangar.explorer.pullFf', vscode.Uri.file(repoPath('backend/billing-api/src')));
    } finally {
      api.actions.recordNotifications = false;
      recorder.restore();
    }
    assert.match(api.actions.notifications[0]?.text ?? '', /^Pull \(ff\) skipped in billing-api: dirty/);
  });

  it('shows a filtered-out repository: expands its group and moves the focus to its row', async () => {
    await openDashboardAndWait(api);
    if (!api.viewState.collapsed.includes('backend')) await api.viewState.toggleGroup('backend');
    const stop = recordIntegrations(api);
    try {
      await vscode.commands.executeCommand('repohangar.showInDashboard', vscode.Uri.file(repoPath('backend/ledger')));
      await waitFor(() => api.dashboard.postedMessages.some((m) => m.type === 'reveal'), 'the reveal message');
    } finally {
      stop();
    }
    assert.ok(!api.viewState.collapsed.includes('backend'), 'backend is expanded');
    const snapshot = api.dashboard.postedMessages.find((m) => m.type === 'snapshot');
    assert.ok(snapshot?.type === 'snapshot' && !snapshot.collapsed.includes('backend'), 'the webview gets the expanded group');
    assert.deepEqual(api.dashboard.postedMessages.filter((m) => m.type === 'reveal'), [{ type: 'reveal', id: idOf(api, 'ledger') }]);
    assert.ok(dashboardTabs()[0]?.isActive, 'the dashboard is the active tab');
  });

  it('names a folder in no listed repository', async () => {
    mkdirSync(repoPath('docs'), { recursive: true });
    api.actions.notifications.length = 0;
    api.actions.recordNotifications = true;
    try {
      await vscode.commands.executeCommand('repohangar.showInDashboard', vscode.Uri.file(repoPath('docs')));
    } finally {
      api.actions.recordNotifications = false;
    }
    assert.deepEqual(api.actions.notifications.map((n) => n.text), ['"acme/docs" is not in a repository RepoHangar lists.']);
  });
});
