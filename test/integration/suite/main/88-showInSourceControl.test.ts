// source-control-reveal :: Show in Source Control matrix (R1–R3), asserting repository.ui.selected.

import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { TestApi } from '../../../../src/extension';
import { commandIds, idOf, ready, recordIntegrations, repoPath, rootOf, scmSelected, setConfig, waitFor } from '../helpers';

describe('Show in Source Control', () => {
  let api: TestApi;
  let stop: () => void;

  before(async () => {
    api = await ready(14);
  });
  beforeEach(() => {
    stop = recordIntegrations(api);
  });
  afterEach(async () => {
    stop();
    await setConfig('scm.repositories.selectionMode', undefined);
    await setConfig('repohangar.gitGraph.syncSourceControlSelection', undefined);
  });

  async function selectFirst(name: string): Promise<void> {
    await api.sourceControl.sync(rootOf(api, name).fsPath, { force: true, briefReveal: ['workbench.view.scm'] });
    await waitFor(() => scmSelected(api).join() === name, `${name} to be selected`);
    api.commands.executed.length = 0;
  }

  const show = (name: string) => api.dashboard.receiveForTest({ type: 'runAction', id: idOf(api, name), action: 'showInSourceControl' });

  it('R1 s on ledger in single mode with the sync setting off selects ledger', async () => {
    await setConfig('scm.repositories.selectionMode', 'single');
    await setConfig('repohangar.gitGraph.syncSourceControlSelection', false);
    await selectFirst('billing-api');
    await show('ledger');
    assert.equal(commandIds(api)[0], 'workbench.view.scm');
    assert.deepEqual(scmSelected(api), ['ledger']);
  });

  it('R2 a click on the Changes cell of ledger in single mode selects ledger', async () => {
    await setConfig('scm.repositories.selectionMode', 'single');
    await selectFirst('web-shop');
    // The Changes cell sends the same message as s.
    await show('ledger');
    assert.equal(commandIds(api)[0], 'workbench.view.scm');
    assert.deepEqual(scmSelected(api), ['ledger']);
  });

  it('R3 repohangar.showInSourceControl with a file of ledger in multiple mode leaves the selection unchanged', async () => {
    await setConfig('scm.repositories.selectionMode', 'multiple');
    const doc = await vscode.workspace.openTextDocument(repoPath('backend/ledger/README.md'));
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('repohangar.showInSourceControl');
    // In multiple mode every repository stays visible; showing the view focuses one of them, which the Git API
    // reports as `ui.selected`. RepoHangar itself runs no selection command.
    assert.deepEqual(commandIds(api), ['workbench.view.scm']);
    assert.ok(api.log.lines.some((l) => l.level === 'debug' && l.message.endsWith(': notSingleMode')), JSON.stringify(api.log.lines));
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });
});
