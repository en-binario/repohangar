// explorer-open-in-git-graph :: Repository roots: Repository the Git extension does not open and Newly cloned
// repository; dashboard :: Refresh rescans the repository roots.

import * as assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { TestApi } from '../../../../src/extension';
import { git } from '../../fixtures/repos';
import { ready, remotes, repoPath, waitFor } from '../helpers';

const samePath = (a: string, b: string) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
const contains = (roots: readonly string[], path: string) => roots.some((r) => samePath(r, path));

describe('repository roots', () => {
  let api: TestApi;

  before(async () => {
    api = await ready(14);
    await waitFor(() => api.repositoryRoots.current.length >= 14 || undefined, 'the first scan');
  });

  it('contains every repository of the Git API', () => {
    for (const repository of api.git.current?.repositories ?? []) {
      assert.ok(contains(api.repositoryRoots.current, repository.rootUri.fsPath), repository.rootUri.fsPath);
    }
  });

  it('contains a repository the Git extension does not open', () => {
    // tools/ignored is in git.ignoredRepositories, so the Git extension never opens it.
    const ignored = vscode.Uri.file(repoPath('tools/ignored')).fsPath;
    assert.ok(!(api.git.current?.repositories ?? []).some((r) => samePath(r.rootUri.fsPath, ignored)));
    assert.ok(contains(api.repositoryRoots.current, ignored), `${ignored} in ${api.repositoryRoots.current.join(', ')}`);
  });

  it('contains a newly cloned repository after RepoHangar: Refresh', async () => {
    const payments = vscode.Uri.file(repoPath('backend/payments')).fsPath;
    const git_ = vscode.workspace.getConfiguration('git');
    // Keep the Git extension from opening the clone, so the other suites keep their 14 repositories.
    await git_.update('autoRepositoryDetection', false, vscode.ConfigurationTarget.Workspace);
    let found: boolean;
    let openedByGit: boolean;
    try {
      assert.ok(!contains(api.repositoryRoots.current, payments));
      git(repoPath('backend'), 'clone', '--quiet', join(remotes, 'ledger.git'), 'payments');
      await vscode.commands.executeCommand('repohangar.refresh');
      found = contains(api.repositoryRoots.current, payments);
      openedByGit = (api.git.current?.repositories ?? []).some((r) => samePath(r.rootUri.fsPath, payments));
    } finally {
      await rm(payments, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
      await git_.update('autoRepositoryDetection', undefined, vscode.ConfigurationTarget.Workspace);
      await vscode.commands.executeCommand('repohangar.refresh');
    }
    assert.ok(found, `${payments} in the repository roots`);
    assert.ok(!openedByGit, 'the Git extension did not open the clone');
    assert.ok(!contains(api.repositoryRoots.current, payments));
  });

  it('drops the results of a scan that a newer one replaced', async () => {
    const first = api.repositoryRoots.rescan();
    const second = api.repositoryRoots.rescan();
    await Promise.all([first, second]);
    assert.ok(api.repositoryRoots.current.length >= 15);
  });

  it('scans only the workspace folder with repohangar.repositoryScanDepth 0', async () => {
    await vscode.workspace.getConfiguration('repohangar').update('repositoryScanDepth', 0, vscode.ConfigurationTarget.Workspace);
    try {
      const ignored = vscode.Uri.file(repoPath('tools/ignored')).fsPath;
      await waitFor(() => !contains(api.repositoryRoots.current, ignored), 'the rescan at depth 0');
    } finally {
      await vscode.workspace.getConfiguration('repohangar').update('repositoryScanDepth', undefined, vscode.ConfigurationTarget.Workspace);
    }
    await waitFor(() => contains(api.repositoryRoots.current, vscode.Uri.file(repoPath('tools/ignored')).fsPath), 'the rescan at depth 3');
  });
});
