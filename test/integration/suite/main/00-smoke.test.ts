import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { ready, rowNamed, waitFor } from '../helpers';

describe('smoke', () => {
  it('lists every fixture repository through getAPI(1)', async () => {
    const api = await ready(14);
    assert.equal(api.git.state, 'initialized');
    // The Git extension opens submodules after their parent repository.
    await waitFor(() => rowNamed(api, 'shared-proto'), 'the submodule row', 30_000);
    const names = api.store.all().map((r) => r.name).sort();
    for (const name of ['auth-service', 'billing-api', 'core', 'detached', 'ledger', 'merging', 'new-service', 'notifications', 'rebasing', 'scratch', 'shared-proto', 'stashed', 'web-shop']) {
      assert.ok(names.includes(name), `${name} missing from ${names.join(', ')}`);
    }
  });

  it('declares every setting with its default', () => {
    const config = vscode.workspace.getConfiguration('repohangar');
    assert.equal(config.get('openOnStartup'), 'never');
    assert.equal(config.get('groupBy'), 'parentFolder');
    assert.deepEqual(config.get('groups'), {});
    assert.equal(config.get('staleFetchHours'), 1);
    assert.equal(config.get('statusBar.enabled'), true);
    assert.deepEqual(config.get('hosts'), {});
    assert.equal(config.get('concurrency'), 6);
    assert.equal(config.get('fetchTimeoutSeconds'), 60);
  });

  it('declares the Git operation commands and the Source Control Fetch item', async () => {
    const manifest = vscode.extensions.getExtension('enbinario.repohangar')?.packageJSON as {
      contributes: {
        commands: { command: string; title: string; category?: string }[];
        menus: Record<string, { command: string; when?: string }[]>;
        configuration: { properties: Record<string, { minimum?: number; maximum?: number }> };
      };
    };
    const titles = Object.fromEntries(manifest.contributes.commands.map((c) => [c.command, `${c.category ? `${c.category}: ` : ''}${c.title}`]));
    assert.equal(titles['repohangar.fetch'], 'RepoHangar: Fetch Repository');
    assert.equal(titles['repohangar.fetchAll'], 'RepoHangar: Fetch All');
    assert.equal(titles['repohangar.pullFf'], 'RepoHangar: Pull (Fast-Forward Only)');
    assert.equal(titles['repohangar.pullAllFf'], 'RepoHangar: Pull All (Fast-Forward Only)');
    const registered = await vscode.commands.getCommands(true);
    for (const id of ['repohangar.fetch', 'repohangar.fetchAll', 'repohangar.pullFf', 'repohangar.pullAllFf', 'repohangar.scm.fetch']) {
      assert.ok(registered.includes(id), `${id} is registered`);
    }
    const item = manifest.contributes.menus['scm/sourceControl']?.find((m) => m.command === 'repohangar.scm.fetch');
    assert.equal(item?.when, 'scmProvider == git');
    assert.equal(titles['repohangar.scm.fetch'], 'Fetch');
    const { properties } = manifest.contributes.configuration;
    assert.deepEqual([properties['repohangar.concurrency']?.minimum, properties['repohangar.concurrency']?.maximum], [1, 32]);
    assert.deepEqual([properties['repohangar.fetchTimeoutSeconds']?.minimum, properties['repohangar.fetchTimeoutSeconds']?.maximum], [5, 600]);
  });

  it('does not open the dashboard at startup with openOnStartup never', async () => {
    const api = await ready(14);
    assert.equal(await api.startupCheck, 'notOpened');
  });
});
