// Repositories created for one suite in the workspace folder `branches/`, each a clone of its own bare remote, opened
// in the Git extension and closed and deleted afterwards, so the other suites keep the fixture's 14 repositories.

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { TestApi } from '../../../src/extension';
import type { Repository } from '../../../src/git/git';
import { cloned, git } from '../fixtures/repos';
import { remotes, repoPath, rowNamed, waitFor } from './helpers';

export interface TempRepo {
  name: string;
  path: string;
  /** The clone that pushes to the bare remote, for commits the repository does not have yet */
  seed: string;
  /** The bare remote */
  bare: string;
  id: string;
  repository: Repository;
}

/** Clones a new bare remote at `branches/<name>`, runs `setup` and opens the clone in the Git extension. */
export async function openTempRepo(api: TestApi, name: string, setup: (path: string, seed: string) => void = () => undefined): Promise<TempRepo> {
  const path = repoPath(`branches/${name}`);
  const seed = cloned(remotes, path, name);
  // The Git extension reads the system config, which Git for Windows ships with core.autocrlf true; the fixture's git
  // does not. One setting for both keeps files checked out by the extension equal to what the tests compare.
  git(path, 'config', 'core.autocrlf', 'false');
  setup(path, seed);
  const uri = vscode.Uri.file(path);
  await api.git.current?.openRepository(uri);
  const row = await waitFor(() => rowNamed(api, name), `the ${name} row`);
  const repository = api.registry.repository(row.id) as Repository;
  await refresh(api, { id: row.id, repository });
  return { name, path, seed, bare: join(remotes, `${name}.git`), id: row.id, repository };
}

/** The Git extension's status and the row, after the test changed the repository behind its back. */
export async function refresh(api: TestApi, repo: Pick<TempRepo, 'id' | 'repository'>): Promise<void> {
  await repo.repository.status();
  await api.store.recompute(repo.id);
}

export async function closeTempRepos(api: TestApi, repos: readonly TempRepo[]): Promise<void> {
  for (const repo of repos) {
    await vscode.commands.executeCommand('git.close', vscode.Uri.file(repo.path));
    await waitFor(() => !rowNamed(api, repo.name), `the ${repo.name} row to go`);
    await rm(repo.path, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
}

/** HEAD's branch, or `HEAD` when detached. */
export function branchOf(path: string): string {
  return git(path, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
}

/** The upstream of HEAD's branch, or undefined. */
export function upstreamOf(path: string): string | undefined {
  try {
    return git(path, 'rev-parse', '--abbrev-ref', '@{u}').trim();
  } catch {
    return undefined;
  }
}

export function stashList(path: string): string[] {
  return git(path, 'stash', 'list', '--format=%gs').split('\n').filter((l) => l.length > 0);
}

export function porcelain(path: string): string {
  return git(path, 'status', '--porcelain');
}
