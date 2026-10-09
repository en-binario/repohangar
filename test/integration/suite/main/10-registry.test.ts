import * as assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import * as vscode from 'vscode';
import { git } from '../../fixtures/repos';
import { ready, repoPath, rowNamed, setConfig, waitFor } from '../helpers';

describe('repo-registry', () => {
  it('adds a row when the Git extension opens a repository', async () => {
    const api = await ready(14);
    const before = api.registry.size;
    const path = repoPath('frontend/admin-portal');
    mkdirSync(path, { recursive: true });
    git(path, 'init');
    await api.git.current?.openRepository(vscode.Uri.file(path));
    const row = await waitFor(() => rowNamed(api, 'admin-portal'), 'the admin-portal row');
    assert.equal(api.registry.size, before + 1);
    assert.equal(row.id, vscode.Uri.file(path).toString());
  });

  it('removes the row when the Git extension closes the repository', async () => {
    const api = await ready(14);
    const before = api.registry.size;
    await vscode.commands.executeCommand('git.close', vscode.Uri.file(repoPath('frontend/admin-portal')));
    await waitFor(() => !rowNamed(api, 'admin-portal'), 'the admin-portal row to go');
    assert.equal(api.registry.size, before - 1);
  });

  it('lists a submodule as its own row', async () => {
    const api = await ready(14);
    assert.ok(rowNamed(api, 'core'));
    const proto = await waitFor(() => rowNamed(api, 'shared-proto'), 'the submodule row', 30_000);
    assert.ok(proto);
    assert.equal(proto.path, vscode.Uri.file(repoPath('platform/core/vendor/shared-proto')).fsPath);
  });

  it('does not list a folder the Git extension ignores', async () => {
    const api = await ready(14);
    assert.equal(rowNamed(api, 'ignored'), undefined);
  });

  it('applies a change of repohangar.hosts without a reload', async () => {
    const api = await ready(14);
    assert.equal(rowNamed(api, 'billing-api')?.provider, 'unknown');
    await setConfig('repohangar.hosts', { 'git.acme.test': 'gitlab' });
    try {
      await waitFor(() => rowNamed(api, 'billing-api')?.provider === 'gitlab', 'billing-api on gitlab');
    } finally {
      await setConfig('repohangar.hosts', undefined);
    }
    await waitFor(() => rowNamed(api, 'billing-api')?.provider === 'unknown', 'billing-api back to unknown');
  });
});
