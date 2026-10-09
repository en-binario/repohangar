import * as assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { git } from '../../fixtures/repos';
import { isDirty } from '../../../../src/shared/format';
import type { RowData } from '../../../../src/shared/model';
import { closeAllEditors, dashboardTabs, ready, repoPath, rowNamed, setConfig, waitFor } from '../helpers';

describe('status bar', () => {
  it('follows a repository that becomes clean within 250 ms of its row update', async () => {
    const api = await ready(14);
    api.registry.focusOverride = true;
    const live = repoPath('tools/live');
    const liveId = rowNamed(api, 'live')?.id as string;
    writeFileSync(join(live, 'README.md'), 'dirty again\n');
    await api.registry.repository(liveId)?.status();
    await waitFor(() => isDirty(rowNamed(api, 'live') as RowData) || undefined, 'live to be dirty');
    const dirty = api.store.all().filter(isDirty).length;
    await waitFor(() => api.statusBar.item.text.endsWith(`$(circle-filled)${dirty}`) || undefined, `the item to show ${dirty} dirty`);

    let rowUpdatedAt = 0;
    let textUpdatedAt = 0;
    const expected = dirty - 1 > 0 ? `$(circle-filled)${dirty - 1}` : 'repos';
    const sub = api.store.onBatch((batch) => {
      const row = batch.upserts.find((r) => r.id === liveId);
      if (row && !isDirty(row) && !rowUpdatedAt) rowUpdatedAt = Date.now();
      // The status bar listener was registered first, so it has already run for this batch.
      if (api.statusBar.item.text.endsWith(expected) && !textUpdatedAt) textUpdatedAt = Date.now();
    });
    try {
      git(live, 'commit', '-am', 'Commit everything');
      await waitFor(() => (rowUpdatedAt > 0 && textUpdatedAt > 0) || undefined, 'the clean row and the new text', 5_000);
    } finally {
      sub.dispose();
      api.registry.focusOverride = undefined;
    }
    assert.ok(textUpdatedAt - rowUpdatedAt < 250, `status bar updated ${textUpdatedAt - rowUpdatedAt} ms after the row`);
    assert.ok(api.statusBar.item.text.endsWith(expected), `status bar reads ${api.statusBar.item.text}`);
  });

  it('reads the accessible label and the tooltip', async () => {
    const api = await ready(14);
    const label = api.statusBar.item.accessibilityInformation?.label ?? '';
    assert.match(label, /^RepoHangar: \d+ repositories, \d+ behind, \d+ with changes$/);
    assert.match(String(api.statusBar.item.tooltip), /^RepoHangar: \d+ repositories\nBehind: .*ledger ↓2/);
  });

  it('hides the item when repohangar.statusBar.enabled is turned off', async () => {
    const api = await ready(14);
    assert.equal(api.statusBar.shown, true);
    await setConfig('repohangar.statusBar.enabled', false);
    try {
      await waitFor(() => api.statusBar.shown === false, 'the item to hide');
    } finally {
      await setConfig('repohangar.statusBar.enabled', undefined);
    }
    await waitFor(() => api.statusBar.shown === true, 'the item to show again');
  });

  it('opens the dashboard on click', async () => {
    const api = await ready(14);
    await closeAllEditors();
    assert.equal(api.statusBar.item.command, 'repohangar.open');
    await vscode.commands.executeCommand(api.statusBar.item.command as string);
    await waitFor(() => dashboardTabs()[0]?.isActive, 'the dashboard to be active');
  });
});
