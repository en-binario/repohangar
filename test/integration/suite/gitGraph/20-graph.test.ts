// explorer-open-in-git-graph :: Graph item matrix R1 (Git Graph installed) and the contract of `git-graph.view` with
// `{ rootUri }` in the installed Git Graph release; source-control-reveal :: Source Control shown before the selection
// sync.

import * as assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as vscode from 'vscode';
import type { TestApi } from '../../../../src/extension';
import { TOGGLE_COMMAND_PREFIX } from '../../../../src/integrations/scmSelection';
import { graphLabel, nameClickAction } from '../../../../src/shared/graph';
import {
  commandIds,
  idOf,
  lastSnapshotGraph,
  openDashboardAndWait,
  ready,
  recordIntegrations,
  repoPath,
  rootOf,
  scmSelected,
  setConfig,
  waitFor,
} from '../helpers';

/** Files below `dir` whose name ends with `suffix`. */
function findFiles(dir: string, suffix: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...findFiles(path, suffix));
    else if (entry.endsWith(suffix)) found.push(path);
  }
  return found;
}

const normalize = (path: string) => path.replace(/\\/g, '/').toLowerCase();

function gitGraphTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all.flatMap((g) => g.tabs.filter((t) => t.input instanceof vscode.TabInputWebview && t.input.viewType.endsWith('git-graph')));
}

describe('Open in Git Graph', () => {
  let api: TestApi;
  let stop: () => void;

  before(async function () {
    this.timeout(120_000);
    api = await ready(14);
    await waitFor(() => api.gitGraph.installed, 'Git Graph to be installed by the detection suite');
    await openDashboardAndWait(api);
  });
  beforeEach(() => {
    stop = recordIntegrations(api);
  });
  afterEach(async () => {
    stop();
    await setConfig('scm.repositories.selectionMode', undefined);
  });

  // explorer-reveal :: Name click matrix R4: the default nameClick runs Open in Git Graph while Git Graph is installed.
  it('a click on the repository name opens Git Graph by default when Git Graph is installed', async () => {
    api.dashboard.recordMessages = true;
    try {
      api.dashboard.postSnapshot();
      const snapshot = api.dashboard.postedMessages.filter((m) => m.type === 'snapshot').pop();
      assert.equal(snapshot?.type === 'snapshot' && snapshot.nameClick, 'auto');
      assert.equal(snapshot?.type === 'snapshot' && snapshot.graph, 'gitGraph');
      assert.equal(snapshot?.type === 'snapshot' && nameClickAction(snapshot.nameClick, snapshot.graph), 'graph');
    } finally {
      api.dashboard.recordMessages = false;
    }
  });

  it('R1 g and Ctrl+Alt+J open Git Graph on the repository and the items read Open in Git Graph', async () => {
    await setConfig('repohangar.gitGraph.whenMissing', 'hide');
    try {
      // Any whenMissing value: Git Graph is installed.
      assert.equal(api.graph.variant, 'gitGraph');
      await waitFor(() => lastSnapshotGraph(api) === 'gitGraph', 'the gitGraph variant');
      assert.equal(graphLabel('gitGraph'), 'Open in Git Graph');
    } finally {
      await setConfig('repohangar.gitGraph.whenMissing', undefined);
    }

    await api.dashboard.receiveForTest({ type: 'runAction', id: idOf(api, 'ledger'), action: 'graph' });
    const viewRoot = (command: { args: unknown[] } | undefined) => (command?.args[0] as { rootUri?: vscode.Uri } | undefined)?.rootUri?.fsPath;
    assert.equal(viewRoot(api.commands.executed.find((c) => c.command === 'git-graph.view')), rootOf(api, 'ledger').fsPath);
    assert.deepEqual(api.notifier.shown, []);

    // Ctrl+Alt+J runs repohangar.openInGitGraph on the repository of the active editor.
    api.commands.executed.length = 0;
    const doc = await vscode.workspace.openTextDocument(repoPath('backend/billing-api/README.md'));
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('repohangar.openInGitGraph');
    assert.equal(viewRoot(api.commands.executed.find((c) => c.command === 'git-graph.view')), rootOf(api, 'billing-api').fsPath);
    assert.deepEqual(api.notifier.shown, []);
  });

  it('opens Git Graph switched to the repository with git-graph.view and { rootUri } (contract)', async () => {
    await vscode.window.tabGroups.close(gitGraphTabs());
    await waitFor(() => gitGraphTabs().length === 0, 'Git Graph to close');
    const ledger = rootOf(api, 'ledger');
    await vscode.commands.executeCommand('git-graph.view', { rootUri: ledger });
    await waitFor(() => gitGraphTabs().length === 1, 'the Git Graph tab');
    // Git Graph writes the repository it opens on to its output channel.
    const exthost = dirname(api.logUri.fsPath);
    const expected = `Created Git Graph View (active repo: ${normalize(ledger.fsPath)})`;
    await waitFor(
      () => findFiles(exthost, 'Git Graph.log').some((file) => normalize(readFileSync(file, 'utf8')).includes(normalize(expected))),
      `"${expected}" in the Git Graph log`,
    );
  });

  it('shows Source Control before the selection sync, with both settings on', async () => {
    await setConfig('scm.repositories.selectionMode', 'single');
    await api.sourceControl.sync(rootOf(api, 'billing-api').fsPath, { force: true, briefReveal: ['workbench.view.scm'] });
    await waitFor(() => scmSelected(api).join() === 'billing-api', 'billing-api to be selected');
    api.commands.executed.length = 0;

    await api.dashboard.receiveForTest({ type: 'runAction', id: idOf(api, 'ledger'), action: 'graph' });

    const ids = commandIds(api);
    const view = ids.indexOf('git-graph.view');
    const scm = ids.indexOf('workbench.view.scm');
    const focus = ids.indexOf('workbench.action.focusActiveEditorGroup');
    const toggle = ids.findIndex((id) => id.startsWith(TOGGLE_COMMAND_PREFIX));
    assert.ok(view >= 0 && view < scm, `git-graph.view before workbench.view.scm: ${ids.join(', ')}`);
    assert.ok(scm < focus, 'focus returns to Git Graph after showing Source Control');
    assert.ok(toggle > scm, `workbench.view.scm before the first selection command: ${ids.join(', ')}`);
    assert.deepEqual(scmSelected(api), ['ledger']);
  });
});
