// explorer-open-in-git-graph :: Git Graph installed while the window is open. The session starts without Git Graph;
// this suite installs its VSIX (downloaded by runTest), and the next suites use it.

import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { TestApi } from '../../../../src/extension';
import { graphLabel } from '../../../../src/shared/graph';
import { lastSnapshotGraph, openDashboardAndWait, ready, recordIntegrations, waitFor } from '../helpers';

describe('Git Graph detection', () => {
  let api: TestApi;

  before(async () => {
    api = await ready(14);
  });

  it('turns repohangar.gitGraph.installed on when Git Graph is installed, without a reload', async function () {
    this.timeout(240_000);
    assert.equal(vscode.extensions.getExtension('mhutchie.git-graph'), undefined, 'the session starts without Git Graph');
    assert.equal(api.gitGraph.installed, false);
    await openDashboardAndWait(api);
    const stop = recordIntegrations(api);
    try {
      assert.equal(api.graph.variant, 'sourceControlGraph');
      await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(process.env.REPOHANGAR_GIT_GRAPH_VSIX as string));
      await waitFor(() => api.gitGraph.installed, 'Git Graph to be detected', 180_000);
      // The dashboard's graph items now read Open in Git Graph.
      await waitFor(() => lastSnapshotGraph(api) === 'gitGraph', 'the dashboard to get the gitGraph variant');
      assert.equal(graphLabel('gitGraph'), 'Open in Git Graph');
    } finally {
      stop();
    }
  });
});
