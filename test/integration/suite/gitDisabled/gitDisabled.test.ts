import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { Snapshot } from '../../../../src/shared/protocol';
import { extensionApi, waitFor } from '../helpers';

describe('Git disabled by git.enabled', () => {
  it('shows the Git disabled empty state', async () => {
    const api = await extensionApi();
    assert.equal(api.git.enabled, false);
    api.dashboard.recordMessages = true;
    await vscode.commands.executeCommand('repohangar.open');
    const snapshot = await waitFor(
      () => api.dashboard.postedMessages.find((m): m is Snapshot => m.type === 'snapshot'),
      'the snapshot',
    );
    assert.deepEqual(snapshot.state, { kind: 'gitDisabled' });
    assert.equal(api.statusBar.shown, false);
  });

  it('opens the Settings editor filtered to git.enabled from Open Settings', async () => {
    const api = await extensionApi();
    await api.dashboard.receiveForTest({ type: 'openSettings' });
    await waitFor(() => vscode.window.tabGroups.activeTabGroup.activeTab?.label === 'Settings', 'the Settings editor');
  });
});
