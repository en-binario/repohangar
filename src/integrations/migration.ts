// Moving users of Git Graph Opener to RepoHangar (git-graph-opener-migration; design D-6): the settings are copied
// once per installation at every scope where they are set, and while Git Graph Opener is installed RepoHangar hides
// its own Explorer graph item and offers once to uninstall it.

import * as vscode from 'vscode';
import type { RepoHangarLog } from '../log';
import type { CommandRunner, Notifier } from './workbench';

export const MIGRATED_SETTINGS: readonly [oldKey: string, newKey: string][] = [
  ['gitGraphOpener.contextMenu.showOn', 'repohangar.explorer.contextMenu.showOn'],
  ['gitGraphOpener.repositoryScanDepth', 'repohangar.repositoryScanDepth'],
  ['gitGraphOpener.sourceControl.reveal', 'repohangar.gitGraph.revealSourceControl'],
  ['gitGraphOpener.sourceControl.syncSelection', 'repohangar.gitGraph.syncSourceControlSelection'],
];

export const MIGRATION_STATE_KEY = 'repohangar.migration.gitGraphOpener';
export const LEGACY_NOTICE_STATE_KEY = 'repohangar.migration.gitGraphOpenerNotice';
export const LEGACY_OPENER_EXTENSION = 'enbinario.git-graph-opener';
export const LEGACY_OPENER_CONTEXT = 'repohangar.legacyOpenerInstalled';
export const LEGACY_NOTICE_TEXT = 'RepoHangar now includes Git Graph Opener.';
export const UNINSTALL_BUTTON = 'Uninstall Git Graph Opener';
export const LATER_BUTTON = 'Later';

export interface MigrationWrite {
  key: string;
  /** `user`, `workspace`, or the name of a workspace folder */
  scope: string;
  value: unknown;
}

/**
 * Copies each `gitGraphOpener.*` value to its `repohangar.*` key at the same scope, where the new key has no value
 * there, once per installation. The old keys are never changed.
 */
export async function migrateSettings(state: vscode.Memento, log?: RepoHangarLog): Promise<MigrationWrite[]> {
  if (state.get<boolean>(MIGRATION_STATE_KEY)) return [];
  const writes: MigrationWrite[] = [];
  const copy = async (
    config: vscode.WorkspaceConfiguration,
    oldKey: string,
    newKey: string,
    pick: (i: ReturnType<vscode.WorkspaceConfiguration['inspect']>) => unknown,
    target: vscode.ConfigurationTarget,
    scope: string,
  ) => {
    const value = pick(config.inspect(oldKey));
    if (value === undefined || pick(config.inspect(newKey)) !== undefined) return;
    try {
      await config.update(newKey, value, target);
      writes.push({ key: newKey, scope, value });
    } catch (error) {
      log?.warn(`Copying ${oldKey} to ${newKey} (${scope}) failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  for (const [oldKey, newKey] of MIGRATED_SETTINGS) {
    const config = vscode.workspace.getConfiguration();
    await copy(config, oldKey, newKey, (i) => i?.globalValue, vscode.ConfigurationTarget.Global, 'user');
    if (vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders) {
      await copy(config, oldKey, newKey, (i) => i?.workspaceValue, vscode.ConfigurationTarget.Workspace, 'workspace');
    }
    // A single-folder window has no separate folder scope: its folder settings are the workspace settings.
    if (vscode.workspace.workspaceFile) {
      for (const folder of vscode.workspace.workspaceFolders ?? []) {
        const scoped = vscode.workspace.getConfiguration(undefined, folder.uri);
        await copy(scoped, oldKey, newKey, (i) => i?.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder, folder.name);
      }
    }
  }
  await state.update(MIGRATION_STATE_KEY, true);
  for (const w of writes) log?.info(`Copied the Git Graph Opener setting to ${w.key} (${w.scope}).`);
  return writes;
}

/** Follows whether Git Graph Opener is installed and offers once to uninstall it. */
export class LegacyOpenerGuard implements vscode.Disposable {
  private value: boolean | undefined;
  /** Set once RepoHangar's uninstall finished, until the extension shows up as newly installed. */
  private uninstalled = false;
  private readonly disposables: vscode.Disposable[];

  constructor(
    private readonly state: vscode.Memento,
    private readonly notifier: Notifier,
    private readonly commands: CommandRunner,
  ) {
    this.disposables = [vscode.extensions.onDidChange(() => this.update())];
    this.update();
  }

  get installed(): boolean {
    return this.value ?? false;
  }

  /** The notice, once settled (integration tests). */
  notice: Promise<void> = Promise.resolve();

  private update(): void {
    const present = vscode.extensions.getExtension(LEGACY_OPENER_EXTENSION) !== undefined;
    if (!present) this.uninstalled = false;
    this.set(present && !this.uninstalled);
  }

  private set(installed: boolean): void {
    if (installed === this.value) return;
    this.value = installed;
    void vscode.commands.executeCommand('setContext', LEGACY_OPENER_CONTEXT, installed);
    if (installed && !this.state.get<boolean>(LEGACY_NOTICE_STATE_KEY)) this.notice = this.showNotice();
  }

  private async showNotice(): Promise<void> {
    await this.state.update(LEGACY_NOTICE_STATE_KEY, true);
    const choice = await this.notifier.show('information', LEGACY_NOTICE_TEXT, UNINSTALL_BUTTON, LATER_BUTTON);
    if (choice !== UNINSTALL_BUTTON) return;
    await this.commands.execute('workbench.extensions.uninstallExtension', LEGACY_OPENER_EXTENSION);
    // VS Code may keep listing a running extension until the extension host restarts; the uninstall has finished.
    this.uninstalled = true;
    this.set(false);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
