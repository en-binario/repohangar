import { join } from 'node:path';
import * as vscode from 'vscode';
import type { TestApi } from '../../../src/extension';
import type { Repository } from '../../../src/git/git';
import type { RowData } from '../../../src/shared/model';

export const workspace = process.env.REPOHANGAR_WORKSPACE as string;
export const remotes = process.env.REPOHANGAR_REMOTES as string;
export const repoPath = (relative: string) => join(workspace, relative);

export async function waitFor<T>(
  probe: () => T | undefined | false | Promise<T | undefined | false>,
  what: string,
  timeoutMs = 20_000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await probe();
    if (value !== undefined && value !== false) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

export async function extensionApi(): Promise<TestApi> {
  const ext = vscode.extensions.getExtension<TestApi>('enbinario.repohangar');
  if (!ext) throw new Error('RepoHangar is not loaded');
  return ext.isActive ? ext.exports : await ext.activate();
}

/** The extension API once the Git API is initialized, at least `minRepos` repositories are open and every row is computed. */
export async function ready(minRepos: number): Promise<TestApi> {
  const api = await extensionApi();
  await api.git.whenInitialized();
  await waitFor(() => api.registry.size >= minRepos, `${minRepos} repositories`, 60_000);
  await waitFor(() => api.store.all().length === api.registry.size, 'all rows computed', 30_000);
  return api;
}

export function rowNamed(api: TestApi, name: string): RowData | undefined {
  return api.store.all().find((r) => r.name === name);
}

/** Closes every editor, including the pinned dashboard tab, which Close All Editors keeps. */
export async function closeAllEditors(): Promise<void> {
  await vscode.window.tabGroups.close(dashboardTabs());
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await waitFor(() => dashboardTabs().length === 0, 'the dashboard tab to close');
}

/** Replaces the operations of every repository with counters; returns the counts and a restore function. */
export function spyOnRepositories(repositories: Repository[]) {
  const calls: Record<string, number> = {};
  const restores: (() => void)[] = [];
  for (const repository of repositories) {
    for (const method of ['status', 'fetch', 'pull', 'push', 'checkout'] as const) {
      const original = repository[method] as (...args: unknown[]) => Promise<unknown>;
      (repository as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
        calls[method] = (calls[method] ?? 0) + 1;
        return original.apply(repository, args);
      };
      restores.push(() => ((repository as unknown as Record<string, unknown>)[method] = original));
    }
  }
  return { calls, restore: () => restores.forEach((r) => r()) };
}

export function dashboardTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all.flatMap((g) =>
    g.tabs.filter((t) => t.input instanceof vscode.TabInputWebview && t.input.viewType.endsWith('repohangar.dashboard')),
  );
}

export async function setConfig(key: string, value: unknown): Promise<void> {
  await vscode.workspace.getConfiguration().update(key, value, vscode.ConfigurationTarget.Global);
}
