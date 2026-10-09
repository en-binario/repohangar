// dashboard :: Open on startup matrix, one case per row. The check runs through the extension's own
// openOnStartup with the real dashboard and a Git API whose repository list the case controls.

import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { closeAllEditors, dashboardTabs, ready, setConfig, waitFor } from '../helpers';

function gitWith(count: number) {
  const repositories = Array.from({ length: count }, (_, i) => ({ id: i }));
  return {
    repositories,
    access: { whenInitialized: async () => ({ repositories }) as never },
  };
}

async function editorFocused(): Promise<vscode.TextEditor> {
  const doc = await vscode.workspace.openTextDocument({ content: 'focus stays here' });
  return vscode.window.showTextDocument(doc, { preview: false });
}

describe('open on startup', () => {
  beforeEach(closeAllEditors);
  afterEach(() => setConfig('repohangar.openOnStartup', undefined));

  it('does not open with never', async () => {
    const api = await ready(14);
    await setConfig('repohangar.openOnStartup', 'never');
    assert.equal(await api.openOnStartup(gitWith(14).access, api.dashboard), 'notOpened');
    assert.equal(dashboardTabs().length, 0);
  });

  it('opens no second panel when the dashboard was restored', async () => {
    const api = await ready(14);
    await setConfig('repohangar.openOnStartup', 'multiRepo');
    await vscode.commands.executeCommand('repohangar.open');
    await waitFor(() => dashboardTabs().length === 1, 'the dashboard tab');
    assert.equal(await api.openOnStartup(gitWith(5).access, api.dashboard), 'notOpened');
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(dashboardTabs().length, 1);
  });

  it('does not open with 2 repositories', async () => {
    const api = await ready(14);
    await setConfig('repohangar.openOnStartup', 'multiRepo');
    assert.equal(await api.openOnStartup(gitWith(2).access, api.dashboard), 'notOpened');
    assert.equal(dashboardTabs().length, 0);
  });

  it('does not open when a third repository opens after initialization', async () => {
    const api = await ready(14);
    await setConfig('repohangar.openOnStartup', 'multiRepo');
    const git = gitWith(2);
    assert.equal(await api.openOnStartup(git.access, api.dashboard), 'notOpened');
    git.repositories.push({ id: 2 });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(dashboardTabs().length, 0);
  });

  it('opens with 3 repositories and keeps keyboard focus', async () => {
    const api = await ready(14);
    await setConfig('repohangar.openOnStartup', 'multiRepo');
    await editorFocused();
    assert.equal(await api.openOnStartup(gitWith(3).access, api.dashboard), 'opened');
    await waitFor(() => dashboardTabs().length === 1, 'the dashboard tab');
    await new Promise((r) => setTimeout(r, 300));
    // The panel opened without taking keyboard focus.
    assert.equal(api.dashboard.current?.active, false);
  });
});
