import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { Repository } from '../../../../src/git/git';
import { DASHBOARD_VIEW_TYPE } from '../../../../src/ui/dashboard';
import { closeAllEditors, dashboardTabs, ready, repoPath, spyOnRepositories, waitFor } from '../helpers';

const manifest = vscode.extensions.getExtension('enbinario.repohangar')?.packageJSON as {
  contributes: {
    keybindings: { command: string; key: string; mac: string }[];
    menus: Record<string, { command: string; when?: string; group?: string }[]>;
    commands: { command: string; title: string; category?: string }[];
  };
};

describe('dashboard panel', () => {
  beforeEach(closeAllEditors);

  it('opens a pinned panel titled RepoHangar when none is open', async () => {
    await ready(14);
    await vscode.commands.executeCommand('repohangar.open');
    const tab = await waitFor(() => dashboardTabs()[0], 'the dashboard tab');
    assert.equal(tab.label, 'RepoHangar');
    await waitFor(() => dashboardTabs()[0]?.isPinned, 'the dashboard tab to be pinned');
    assert.equal(tab.isActive, true);
  });

  it('reveals the existing panel instead of opening a second one', async () => {
    await ready(14);
    await vscode.commands.executeCommand('repohangar.open');
    await waitFor(() => dashboardTabs()[0], 'the dashboard tab');
    const doc = await vscode.workspace.openTextDocument({ content: 'other editor' });
    await vscode.window.showTextDocument(doc, { preview: false });
    await waitFor(() => !dashboardTabs()[0]?.isActive, 'the dashboard in the background');
    await vscode.commands.executeCommand('repohangar.open');
    await waitFor(() => dashboardTabs()[0]?.isActive, 'the dashboard to become active');
    assert.equal(dashboardTabs().length, 1);
  });

  // Dashboard tab matrix R3 and R4: a dashboard tab whose webview VS Code has not restored has no panel set up yet;
  // a panel of the dashboard view type that the test creates stands in for it.
  it('shows a dashboard tab RepoHangar has not set up instead of opening a second one', async () => {
    const api = await ready(14);
    const stand = vscode.window.createWebviewPanel(DASHBOARD_VIEW_TYPE, 'RepoHangar', { viewColumn: vscode.ViewColumn.Active, preserveFocus: false });
    try {
      await waitFor(() => dashboardTabs()[0]?.isActive, 'the dashboard tab');
      const doc = await vscode.workspace.openTextDocument({ content: 'other editor' });
      await vscode.window.showTextDocument(doc, { preview: false });
      await waitFor(() => !dashboardTabs()[0]?.isActive, 'the dashboard in the background');
      assert.equal(api.dashboard.current, undefined);
      await vscode.commands.executeCommand('repohangar.open');
      await waitFor(() => dashboardTabs()[0]?.isActive, 'the dashboard tab to become active');
      await new Promise((r) => setTimeout(r, 500));
      assert.equal(dashboardTabs().length, 1);
    } finally {
      stand.dispose();
    }
  });

  it('shows a dashboard tab RepoHangar has not set up in another editor group', async () => {
    const api = await ready(14);
    const first = await vscode.workspace.openTextDocument({ content: 'first group' });
    await vscode.window.showTextDocument(first, { viewColumn: vscode.ViewColumn.One, preview: false });
    await vscode.commands.executeCommand('workbench.action.newGroupRight');
    await waitFor(() => vscode.window.tabGroups.all.length === 2, 'a second editor group');
    const stand = vscode.window.createWebviewPanel(DASHBOARD_VIEW_TYPE, 'RepoHangar', { viewColumn: vscode.ViewColumn.Active, preserveFocus: false });
    try {
      await waitFor(() => dashboardTabs()[0]?.isActive, 'the dashboard tab');
      const column = dashboardTabs()[0]?.group.viewColumn;
      assert.notEqual(column, vscode.ViewColumn.One);
      const doc = await vscode.workspace.openTextDocument({ content: 'other editor' });
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Active, preview: false });
      await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
      await waitFor(() => !dashboardTabs()[0]?.isActive, 'the dashboard in the background');
      assert.equal(api.dashboard.current, undefined);
      await vscode.commands.executeCommand('repohangar.open');
      await waitFor(() => dashboardTabs()[0]?.isActive, 'the dashboard tab to become active');
      await new Promise((r) => setTimeout(r, 500));
      assert.equal(dashboardTabs().length, 1);
      assert.equal(dashboardTabs()[0]?.group.viewColumn, column);
    } finally {
      stand.dispose();
      await vscode.commands.executeCommand('workbench.action.joinAllGroups');
    }
  });

  // Dashboard tab matrix R5.
  it('closes a second dashboard panel that VS Code restores while one is open', async () => {
    const api = await ready(14);
    await vscode.commands.executeCommand('repohangar.open');
    await waitFor(() => dashboardTabs()[0]?.isActive, 'the dashboard tab');
    const first = api.dashboard.current;
    const second = vscode.window.createWebviewPanel(DASHBOARD_VIEW_TYPE, 'RepoHangar', { viewColumn: vscode.ViewColumn.Active, preserveFocus: true });
    await api.dashboard.deserializeWebviewPanel(second);
    await waitFor(() => dashboardTabs().length === 1, 'one dashboard tab');
    assert.equal(api.dashboard.current, first);
    await waitFor(() => dashboardTabs()[0]?.isActive, 'the first dashboard tab to be active');
  });

  it('declares Ctrl+Alt+H and Ctrl+Cmd+H for repohangar.open', () => {
    const binding = manifest.contributes.keybindings.find((k) => k.command === 'repohangar.open');
    assert.equal(binding?.key, 'ctrl+alt+h');
    assert.equal(binding?.mac, 'ctrl+cmd+h');
  });

  it('opens from the Open RepoHangar button in the Source Control title bar', async () => {
    await ready(14);
    const item = manifest.contributes.menus['scm/title']?.find((m) => m.command === 'repohangar.scm.openDashboard');
    assert.equal(item?.when, 'scmProvider == git');
    assert.equal(item?.group, 'navigation');
    assert.equal(manifest.contributes.commands.find((c) => c.command === 'repohangar.scm.openDashboard')?.title, 'Open RepoHangar');
    await vscode.commands.executeCommand('workbench.view.scm');
    await vscode.commands.executeCommand('repohangar.scm.openDashboard');
    await waitFor(() => dashboardTabs()[0]?.isActive, 'the dashboard to become active');
  });

  it('drops a malformed message from the webview', async () => {
    const api = await ready(14);
    const repositories = api.registry.ids().map((id) => api.registry.repository(id) as Repository);
    const rowsBefore = JSON.stringify(api.store.all());
    const processesBefore = api.gitProcessLog.length;
    const spy = spyOnRepositories(repositories);
    try {
      await api.dashboard.receiveForTest({ type: 'refresh', repo: 42, extra: true });
      await new Promise((r) => setTimeout(r, 500));
    } finally {
      spy.restore();
    }
    assert.deepEqual(spy.calls, {});
    assert.equal(api.gitProcessLog.length, processesBefore);
    assert.equal(JSON.stringify(api.store.all()), rowsBefore);
  });

  it('never posts remote credentials to the webview', async () => {
    const api = await ready(14);
    api.dashboard.postedMessages.length = 0;
    api.dashboard.recordMessages = true;
    try {
      await vscode.commands.executeCommand('repohangar.open');
      await waitFor(() => api.dashboard.postedMessages.some((m) => m.type === 'snapshot'), 'the snapshot');
      // A patch for billing-api, too.
      await api.store.recompute(vscode.Uri.file(repoPath('backend/billing-api')).toString());
      await waitFor(() => api.dashboard.postedMessages.some((m) => m.type === 'patch'), 'a patch');
    } finally {
      api.dashboard.recordMessages = false;
    }
    const all = JSON.stringify(api.dashboard.postedMessages);
    assert.ok(all.includes('billing-api'));
    assert.ok(!all.includes('glpat-x1y2z3'));
    assert.ok(!all.includes('ci-bot'));
  });
});

