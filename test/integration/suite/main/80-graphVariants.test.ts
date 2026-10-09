// explorer-open-in-git-graph :: Graph item matrix R2–R4 (Git Graph is not installed in this session; R1 runs in the
// gitGraph session). Each case sets repohangar.gitGraph.whenMissing and checks the label the dashboard gets, what `g`
// and Ctrl+Alt+J (Ctrl+Cmd+J) run, and the notification.

import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { TestApi } from '../../../../src/extension';
import { graphLabel } from '../../../../src/shared/graph';
import {
  commandIds,
  idOf,
  lastSnapshotGraph,
  openDashboardAndWait,
  ready,
  recordIntegrations,
  setConfig,
  waitFor,
} from '../helpers';

const manifest = vscode.extensions.getExtension('enbinario.repohangar')?.packageJSON as {
  contributes: {
    keybindings: { command: string; key: string; mac: string; when?: string }[];
    menus: Record<string, { command?: string; submenu?: string; when?: string; group?: string }[]>;
  };
};

describe('graph variants without Git Graph', () => {
  let api: TestApi;
  let stop: () => void;

  before(async () => {
    api = await ready(14);
    assert.equal(api.gitGraph.installed, false, 'Git Graph is not installed in the main session');
    await openDashboardAndWait(api);
  });
  beforeEach(() => {
    stop = recordIntegrations(api);
    // Notifications are answered by the test instead of waiting for a click.
    api.notifier.answer = () => undefined;
  });
  afterEach(async () => {
    stop();
    await setConfig('repohangar.gitGraph.whenMissing', undefined);
  });

  /** Sets whenMissing and waits for the dashboard to get the matching variant. */
  async function variant(whenMissing: string, expected: string): Promise<void> {
    await setConfig('repohangar.gitGraph.whenMissing', whenMissing);
    await waitFor(() => lastSnapshotGraph(api) === expected, `the dashboard to get the ${expected} variant`);
    assert.equal(api.graph.variant, expected);
  }

  const g = (name: string) => api.dashboard.receiveForTest({ type: 'runAction', id: idOf(api, name), action: 'graph' });

  it('R2 sourceControlGraph: Open in Source Control Graph opens the Source Control Graph', async () => {
    await variant('sourceControlGraph', 'sourceControlGraph');
    assert.equal(graphLabel('sourceControlGraph'), 'Open in Source Control Graph');
    await g('ledger');
    const ids = commandIds(api);
    assert.equal(ids[0], 'workbench.view.scm');
    assert.equal(ids[ids.length - 1], 'workbench.scm.history.focus');
    assert.ok(!ids.includes('git-graph.view'));
    assert.deepEqual(api.notifier.shown, []);

    // Ctrl+Alt+J runs the command whose when clause holds without Git Graph.
    api.commands.executed.length = 0;
    await vscode.commands.executeCommand('repohangar.openInSourceControlGraph', vscode.Uri.file(api.registry.repository(idOf(api, 'ledger'))!.rootUri.fsPath));
    assert.equal(commandIds(api).at(-1), 'workbench.scm.history.focus');
    assert.deepEqual(api.notifier.shown, []);
  });

  it('R3 offerInstall: Open in Git Graph offers to install Git Graph', async () => {
    await variant('offerInstall', 'offerInstall');
    assert.equal(graphLabel('offerInstall'), 'Open in Git Graph');
    await g('ledger');
    await vscode.commands.executeCommand('repohangar.openInGitGraph');
    assert.deepEqual(api.notifier.shown, [
      { severity: 'information', text: 'Git Graph is not installed.', buttons: ['Install Git Graph'] },
      { severity: 'information', text: 'Git Graph is not installed.', buttons: ['Install Git Graph'] },
    ]);
    assert.deepEqual(commandIds(api), [], 'nothing opens and nothing is installed without a click');
  });

  it('R3 installs Git Graph only from the Install Git Graph button', async () => {
    await variant('offerInstall', 'offerInstall');
    api.notifier.answer = () => 'Install Git Graph';
    api.commands.overrides.set('workbench.extensions.installExtension', async () => undefined);
    await g('ledger');
    assert.deepEqual(api.commands.executed, [{ command: 'workbench.extensions.installExtension', args: ['mhutchie.git-graph'] }]);
  });

  it('R4 hide: no graph items, and g or Ctrl+Alt+J offer to install Git Graph', async () => {
    await variant('hide', 'hidden');
    assert.equal(graphLabel('hidden'), undefined);
    await g('ledger');
    await vscode.commands.executeCommand('repohangar.openInGitGraph');
    assert.equal(api.notifier.shown.length, 2);
    for (const n of api.notifier.shown) assert.deepEqual(n, { severity: 'information', text: 'Git Graph is not installed.', buttons: ['Install Git Graph'] });
    assert.deepEqual(commandIds(api), []);
  });

  it('binds Ctrl+Alt+J (Ctrl+Cmd+J) to the two variants with opposite when clauses', () => {
    const bindings = manifest.contributes.keybindings.filter((k) => k.key === 'ctrl+alt+j');
    assert.deepEqual(
      bindings.map((k) => [k.command, k.mac, k.when]),
      [
        ['repohangar.openInGitGraph', 'ctrl+cmd+j', "repohangar.gitGraph.installed || config.repohangar.gitGraph.whenMissing != 'sourceControlGraph'"],
        ['repohangar.openInSourceControlGraph', 'ctrl+cmd+j', "!repohangar.gitGraph.installed && config.repohangar.gitGraph.whenMissing == 'sourceControlGraph'"],
      ],
    );
  });

  it('shows the menu items of each variant through their when clauses', () => {
    const explorer = manifest.contributes.menus['explorer/context'] ?? [];
    const gitGraphItem = explorer.find((m) => m.command === 'repohangar.openInGitGraph');
    const scGraphItem = explorer.find((m) => m.command === 'repohangar.openInSourceControlGraph');
    assert.equal(gitGraphItem?.group, 'navigation@100');
    assert.equal(scGraphItem?.group, 'navigation@100');
    assert.match(gitGraphItem?.when ?? '', /\(repohangar\.gitGraph\.installed \|\| config\.repohangar\.gitGraph\.whenMissing == 'offerInstall'\)/);
    assert.match(scGraphItem?.when ?? '', /!repohangar\.gitGraph\.installed && config\.repohangar\.gitGraph\.whenMissing == 'sourceControlGraph'/);
    const scm = manifest.contributes.menus['scm/sourceControl'] ?? [];
    assert.ok(scm.some((m) => m.command === 'repohangar.openInGitGraph' && m.when?.includes("whenMissing == 'offerInstall'")));
    assert.ok(scm.some((m) => m.command === 'repohangar.openInSourceControlGraph' && m.when?.includes("whenMissing == 'sourceControlGraph'")));
  });
});
