// git-graph-opener-migration :: Settings migration matrix (R1–R7) and Old keys kept. The session starts with
// gitGraphOpener.repositoryScanDepth = 5 and sourceControl.syncSelection = false in the user settings.json,
// contextMenu.showOn = "allFolders" and sourceControl.syncSelection = false in the workspace file, and
// sourceControl.reveal = false in the folder settings of `acme`. R3, R5, R6 and R7 check the first activation; R1, R2
// and R4 run the migration again, as a second activation does.

import * as assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as vscode from 'vscode';
import type { TestApi } from '../../../../src/extension';
import { MIGRATION_STATE_KEY } from '../../../../src/integrations/migration';
import { ready, waitFor } from '../helpers';

const { Global, Workspace } = vscode.ConfigurationTarget;
const inspect = (key: string) => vscode.workspace.getConfiguration().inspect(key);

/**
 * Sets a key in the workspace file on disk. VS Code writes only registered settings, and the gitGraphOpener.* keys are
 * not registered without Git Graph Opener.
 */
async function writeWorkspaceFile(key: string, value: unknown): Promise<void> {
  const file = vscode.workspace.workspaceFile?.fsPath as string;
  const json = JSON.parse(readFileSync(file, 'utf8')) as { settings: Record<string, unknown> };
  if (value === undefined) delete json.settings[key];
  else json.settings[key] = value;
  writeFileSync(file, JSON.stringify(json, null, 2));
  await waitFor(() => inspect(key)?.workspaceValue === value, `${key} to be ${String(value)} in the workspace file`);
}

function acme(): vscode.WorkspaceFolder {
  const folder = vscode.workspace.workspaceFolders?.find((f) => f.name === 'acme');
  assert.ok(folder, 'the workspace folder acme');
  return folder;
}

describe('settings migration', () => {
  let api: TestApi;

  before(async () => {
    api = await ready(2);
  });

  it('copies at the first activation exactly where an old key is set', () => {
    assert.deepEqual(
      api.migration.writes.map((w) => `${w.key} ${w.scope} ${JSON.stringify(w.value)}`).sort(),
      [
        'repohangar.explorer.contextMenu.showOn workspace "allFolders"',
        'repohangar.gitGraph.revealSourceControl acme false',
        'repohangar.gitGraph.syncSourceControlSelection user false',
        'repohangar.gitGraph.syncSourceControlSelection workspace false',
        'repohangar.repositoryScanDepth user 5',
      ],
    );
    assert.equal(api.migration.state.get(MIGRATION_STATE_KEY), true);
  });

  it('R1 migration already recorded: nothing written', async () => {
    await vscode.workspace.getConfiguration().update('repohangar.repositoryScanDepth', undefined, Global);
    try {
      assert.deepEqual(await api.migration.run(), []);
      assert.equal(inspect('repohangar.repositoryScanDepth')?.globalValue, undefined);
    } finally {
      await vscode.workspace.getConfiguration().update('repohangar.repositoryScanDepth', 5, Global);
    }
  });

  it('R2 old key not set at any scope: nothing written', async () => {
    const config = vscode.workspace.getConfiguration();
    await writeWorkspaceFile('gitGraphOpener.contextMenu.showOn', undefined);
    await config.update('repohangar.explorer.contextMenu.showOn', undefined, Workspace);
    await api.migration.state.update(MIGRATION_STATE_KEY, undefined);
    try {
      const writes = await api.migration.run();
      assert.deepEqual(writes.filter((w) => w.key === 'repohangar.explorer.contextMenu.showOn'), []);
      const value = inspect('repohangar.explorer.contextMenu.showOn');
      assert.deepEqual([value?.globalValue, value?.workspaceValue, value?.workspaceFolderValue], [undefined, undefined, undefined]);
    } finally {
      await writeWorkspaceFile('gitGraphOpener.contextMenu.showOn', 'allFolders');
      await config.update('repohangar.explorer.contextMenu.showOn', 'allFolders', Workspace);
      await api.migration.state.update(MIGRATION_STATE_KEY, true);
    }
  });

  it('R3 user scope: repohangar.repositoryScanDepth = 5 at user scope', () => {
    assert.equal(inspect('repohangar.repositoryScanDepth')?.globalValue, 5);
    assert.equal(vscode.workspace.getConfiguration('repohangar').get('repositoryScanDepth'), 5);
  });

  it('R4 new key already set at that scope: unchanged', async () => {
    const config = vscode.workspace.getConfiguration();
    await config.update('repohangar.repositoryScanDepth', 2, Global);
    await api.migration.state.update(MIGRATION_STATE_KEY, undefined);
    try {
      assert.deepEqual(await api.migration.run(), []);
      assert.equal(inspect('repohangar.repositoryScanDepth')?.globalValue, 2);
    } finally {
      await config.update('repohangar.repositoryScanDepth', 5, Global);
      await api.migration.state.update(MIGRATION_STATE_KEY, true);
    }
  });

  it('R5 workspace scope: repohangar.explorer.contextMenu.showOn = "allFolders" at workspace scope', () => {
    const value = inspect('repohangar.explorer.contextMenu.showOn');
    assert.equal(value?.workspaceValue, 'allFolders');
    assert.equal(value?.globalValue, undefined);
  });

  it('R6 workspace folder scope: repohangar.gitGraph.revealSourceControl = false for the folder acme', () => {
    const value = vscode.workspace.getConfiguration(undefined, acme().uri).inspect('repohangar.gitGraph.revealSourceControl');
    assert.equal(value?.workspaceFolderValue, false);
    assert.equal(value?.workspaceValue, undefined);
    assert.equal(value?.globalValue, undefined);
    assert.equal(vscode.workspace.getConfiguration('repohangar', acme().uri).get('gitGraph.revealSourceControl'), false);
  });

  it('R7 user and workspace scope: repohangar.gitGraph.syncSourceControlSelection = false at both', () => {
    const value = inspect('repohangar.gitGraph.syncSourceControlSelection');
    assert.equal(value?.globalValue, false);
    assert.equal(value?.workspaceValue, false);
  });

  it('keeps the old keys', () => {
    assert.equal(inspect('gitGraphOpener.repositoryScanDepth')?.globalValue, 5);
    assert.equal(inspect('gitGraphOpener.contextMenu.showOn')?.workspaceValue, 'allFolders');
    assert.equal(inspect('gitGraphOpener.sourceControl.syncSelection')?.globalValue, false);
    assert.equal(inspect('gitGraphOpener.sourceControl.syncSelection')?.workspaceValue, false);
    assert.equal(vscode.workspace.getConfiguration(undefined, acme().uri).inspect('gitGraphOpener.sourceControl.reveal')?.workspaceFolderValue, false);
  });
});
