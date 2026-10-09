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

export type GitMethod = 'fetch' | 'pull' | 'push';

export interface GitCallRecorder {
  calls: { name: string; method: GitMethod; args: unknown[] }[];
  commands: { command: string; args: unknown[] }[];
  restore(): void;
}

/**
 * Records the Git API calls of every repository and the commands RepoHangar runs; `passThrough` methods still run,
 * after `delayMs`.
 */
export function recordGitCalls(api: TestApi, passThrough: GitMethod[] = [], delayMs = 0): GitCallRecorder {
  const recorder: GitCallRecorder = { calls: [], commands: [], restore: () => undefined };
  const restores: (() => void)[] = [];
  for (const id of api.registry.ids()) {
    const repository = api.registry.repository(id) as Repository;
    const name = api.store.get(id)?.name ?? id;
    for (const method of ['fetch', 'pull', 'push'] as const) {
      const original = repository[method] as (...args: unknown[]) => Promise<void>;
      (repository as unknown as Record<string, unknown>)[method] = async (...args: unknown[]) => {
        recorder.calls.push({ name, method, args });
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        if (passThrough.includes(method)) await original.apply(repository, args);
      };
      restores.push(() => delete (repository as unknown as Record<string, unknown>)[method]);
    }
  }
  const commands = api.operations.commands;
  api.operations.commands = {
    executeCommand: async (command: string, ...args: unknown[]) => {
      recorder.commands.push({ command, args });
    },
  };
  restores.push(() => (api.operations.commands = commands));
  recorder.restore = () => restores.forEach((r) => r());
  return recorder;
}

export function idOf(api: TestApi, name: string): string {
  const row = rowNamed(api, name);
  if (!row) throw new Error(`no row ${name}`);
  return row.id;
}

export function rootOf(api: TestApi, name: string): vscode.Uri {
  return (api.registry.repository(idOf(api, name)) as Repository).rootUri;
}

/** The names of the repositories selected in the Source Control Repositories view. */
export function scmSelected(api: TestApi): string[] {
  return (api.git.current?.repositories ?? []).filter((r) => r.ui.selected).map((r) => r.rootUri.path.split('/').pop() as string);
}

/** Records the commands, notifications and log lines of the integrations until the returned function is called. */
export function recordIntegrations(api: TestApi): () => void {
  api.commands.executed.length = 0;
  api.notifier.shown.length = 0;
  api.log.lines.length = 0;
  api.dashboard.postedMessages.length = 0;
  api.commands.record = true;
  api.notifier.record = true;
  api.log.record = true;
  api.dashboard.recordMessages = true;
  return () => {
    api.commands.record = false;
    api.notifier.record = false;
    api.log.record = false;
    api.dashboard.recordMessages = false;
    api.notifier.answer = undefined;
    api.commands.overrides.clear();
  };
}

/** The commands the integrations ran, without their arguments. */
export function commandIds(api: TestApi): string[] {
  return api.commands.executed.map((c) => c.command);
}

/** The graph variant of the last snapshot posted to the dashboard. */
export function lastSnapshotGraph(api: TestApi): string | undefined {
  const snapshots = api.dashboard.postedMessages.filter((m) => m.type === 'snapshot');
  const last = snapshots[snapshots.length - 1];
  return last?.type === 'snapshot' ? last.graph : undefined;
}

export async function setScopedConfig(key: string, value: unknown, target: vscode.ConfigurationTarget): Promise<void> {
  await vscode.workspace.getConfiguration().update(key, value, target);
}

/** Opens the dashboard and waits for its first snapshot. */
export async function openDashboardAndWait(api: TestApi): Promise<void> {
  const wasRecording = api.dashboard.recordMessages;
  api.dashboard.recordMessages = true;
  const before = api.dashboard.postedMessages.length;
  if (!api.dashboard.current) {
    await vscode.commands.executeCommand('repohangar.open');
    await waitFor(() => api.dashboard.postedMessages.slice(before).some((m) => m.type === 'snapshot'), 'the dashboard snapshot');
  }
  api.dashboard.recordMessages = wasRecording;
}
