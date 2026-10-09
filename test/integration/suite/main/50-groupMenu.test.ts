// dashboard :: Group menu matrix, one case per row.

import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { ready, rowNamed, setConfig, waitFor } from '../helpers';

function groupBySettingWritten(): boolean {
  const inspect = vscode.workspace.getConfiguration('repohangar').inspect('groupBy');
  return [inspect?.globalValue, inspect?.workspaceValue, inspect?.workspaceFolderValue].some((v) => v !== undefined);
}

describe('group menu', () => {
  after(() => setConfig('repohangar.groupBy', undefined));

  it('uses repohangar.groupBy when no choice is remembered', async () => {
    const api = await ready(14);
    assert.equal(api.viewState.groupingChoice, undefined);
    assert.equal(api.viewState.grouping, 'parentFolder');
    assert.equal(rowNamed(api, 'billing-api')?.group, 'backend');
    assert.equal(groupBySettingWritten(), false);
  });

  it('applies a Group menu choice without writing settings', async () => {
    const api = await ready(14);
    await api.dashboard.receiveForTest({ type: 'setGrouping', mode: 'workspaceFolder' });
    assert.equal(api.viewState.grouping, 'workspaceFolder');
    await waitFor(() => rowNamed(api, 'billing-api')?.group === 'acme', 'billing-api in the group acme');
    assert.equal(groupBySettingWritten(), false);
  });

  it('remembers the choice in workspace state across a reload', async () => {
    const api = await ready(14);
    // The value a reloaded window reads back from workspace state.
    assert.equal(api.viewState.groupingChoice, 'workspaceFolder');
    assert.equal(api.viewState.grouping, 'workspaceFolder');
    assert.equal(groupBySettingWritten(), false);
  });

  it('clears the remembered choice when repohangar.groupBy changes', async () => {
    const api = await ready(14);
    await setConfig('repohangar.groupBy', 'none');
    await waitFor(() => api.viewState.groupingChoice === undefined, 'the choice to be cleared');
    assert.equal(api.viewState.grouping, 'none');
    await waitFor(() => rowNamed(api, 'billing-api')?.group === null, 'billing-api without a group');
  });
});
