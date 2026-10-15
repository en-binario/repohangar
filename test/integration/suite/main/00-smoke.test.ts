import * as assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
    // explorer-open-in-git-graph, explorer-reveal, source-control-reveal, source-control-selection-sync
    assert.equal(config.get('dashboard.nameClick'), 'auto');
    assert.equal(config.get('gitGraph.whenMissing'), 'sourceControlGraph');
    assert.equal(config.get('gitGraph.revealSourceControl'), true);
    assert.equal(config.get('gitGraph.syncSourceControlSelection'), true);
    assert.equal(config.get('explorer.contextMenu.showOn'), 'repositoryRoots');
    assert.equal(config.get('explorer.submenu'), true);
    assert.equal(config.get('explorer.collapseBeforeReveal'), false);
    assert.equal(config.get('explorer.outsideWorkspace'), 'ask');
    assert.equal(config.get('repositoryScanDepth'), 3);
    const manifest = vscode.extensions.getExtension('enbinario.repohangar')?.packageJSON as {
      contributes: { configuration: { properties: Record<string, { minimum?: number }> } };
    };
    assert.equal(manifest.contributes.configuration.properties['repohangar.repositoryScanDepth']?.minimum, 0);
  });

  it('creates the RepoHangar log output channel', async () => {
    const api = await ready(14);
    assert.equal(api.log.channel.name, 'RepoHangar');
    api.log.info('smoke test');
    // A log output channel writes to <name>.log in the extension's log folder, which the Output view lists.
    await waitFor(() => existsSync(join(api.logUri.fsPath, 'RepoHangar.log')), 'the RepoHangar log file');
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

  it('declares the provider setting and commands', async () => {
    assert.equal(vscode.workspace.getConfiguration('repohangar').get('providers.refreshMinutes'), 3);
    const manifest = vscode.extensions.getExtension('enbinario.repohangar')?.packageJSON as {
      contributes: {
        commands: { command: string; title: string; category?: string }[];
        configuration: { properties: Record<string, { minimum?: number; maximum?: number }> };
      };
    };
    const range = manifest.contributes.configuration.properties['repohangar.providers.refreshMinutes'];
    assert.deepEqual([range?.minimum, range?.maximum], [1, 60]);
    const titles = Object.fromEntries(manifest.contributes.commands.map((c) => [c.command, `${c.category}: ${c.title}`]));
    assert.equal(titles['repohangar.mr.open'], 'RepoHangar: Open Merge Request of Current Branch');
    assert.equal(titles['repohangar.mr.copyLink'], 'RepoHangar: Copy Merge Request Link');
    assert.equal(titles['repohangar.signIn'], 'RepoHangar: Sign In to Host…');
    assert.equal(titles['repohangar.signOut'], 'RepoHangar: Sign Out of Host…');
    const registered = await vscode.commands.getCommands(true);
    for (const id of ['repohangar.mr.open', 'repohangar.mr.copyLink', 'repohangar.signIn', 'repohangar.signOut']) {
      assert.ok(registered.includes(id), `${id} is registered`);
    }
  });

  it('declares the merge request settings and commands', async () => {
    // mr-profiles, mr-creation
    const config = vscode.workspace.getConfiguration('repohangar');
    assert.deepEqual(config.get('mr.profiles'), { default: {} });
    assert.deepEqual(config.get('mr.rules'), []);
    assert.equal(config.get('mr.quickCreate'), 'direct');
    assert.equal(config.get('mr.ticketPattern'), '[A-Z][A-Z0-9]+-\\d+');
    assert.deepEqual(config.get('mr.typeMap'), { feature: 'feat', bugfix: 'fix', hotfix: 'fix', chore: 'chore' });
    assert.equal(config.get('gitlab.usePushOptions'), 'whenNoToken');
    const manifest = vscode.extensions.getExtension('enbinario.repohangar')?.packageJSON as {
      contributes: { commands: { command: string; title: string; category?: string }[] };
    };
    const titles = Object.fromEntries(manifest.contributes.commands.map((c) => [c.command, `${c.category}: ${c.title}`]));
    assert.equal(titles['repohangar.mr.create'], 'RepoHangar: Create Merge Request (Defaults)');
    assert.equal(titles['repohangar.mr.createEdit'], 'RepoHangar: Create Merge Request…');
    const registered = await vscode.commands.getCommands(true);
    for (const id of ['repohangar.mr.create', 'repohangar.mr.createEdit', 'repohangar.scm.mr.create', 'repohangar.explorer.mr.createEdit']) {
      assert.ok(registered.includes(id), `${id} is registered`);
    }
  });

  it('does not open the dashboard at startup with openOnStartup never', async () => {
    const api = await ready(14);
    assert.equal(await api.startupCheck, 'notOpened');
  });
});
