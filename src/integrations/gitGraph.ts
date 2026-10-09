// Git Graph detection and the graph actions (explorer-open-in-git-graph: Git Graph detection, Graph command variants,
// Open Git Graph, Open the Source Control Graph; design D-2). Git Graph is optional; RepoHangar never installs it
// unless the user clicks Install Git Graph.

import * as vscode from 'vscode';
import { nodeFileSystem } from '../git/fsPort';
import { findRepoRoot } from '../git/repoRoots';
import type { RepoHangarLog } from '../log';
import { graphVariant, type GraphVariant } from '../shared/graph';
import { GIT_GRAPH_EXTENSION, GIT_GRAPH_VIEW_COMMAND, openGitGraph } from './openGitGraph';
import type { SourceControl } from './sourceControl';
import type { CommandRunner, Notifier } from './workbench';

export const GIT_GRAPH_INSTALLED_CONTEXT = 'repohangar.gitGraph.installed';
export const NOT_INSTALLED_TEXT = 'Git Graph is not installed.';
export const INSTALL_BUTTON = 'Install Git Graph';

/** Follows whether Git Graph is installed and enabled, without a window reload. */
export class GitGraphDetector implements vscode.Disposable {
  private value: boolean | undefined;
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  /** Fires when Git Graph is installed, uninstalled, enabled or disabled. */
  readonly onDidChange = this.changeEmitter.event;
  private readonly disposables: vscode.Disposable[];

  constructor() {
    this.disposables = [this.changeEmitter, vscode.extensions.onDidChange(() => this.update())];
    this.update();
  }

  get installed(): boolean {
    return this.value ?? false;
  }

  private update(): void {
    const installed = vscode.extensions.getExtension(GIT_GRAPH_EXTENSION) !== undefined;
    if (installed === this.value) return;
    this.value = installed;
    void vscode.commands.executeCommand('setContext', GIT_GRAPH_INSTALLED_CONTEXT, installed);
    this.changeEmitter.fire();
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

export class Graph {
  constructor(
    private readonly detector: GitGraphDetector,
    private readonly sourceControl: SourceControl,
    private readonly commands: CommandRunner,
    private readonly notifier: Notifier,
    private readonly log: RepoHangarLog,
  ) {}

  /** The variant of the graph items for the current Git Graph state and `repohangar.gitGraph.whenMissing`. */
  get variant(): GraphVariant {
    const whenMissing = vscode.workspace.getConfiguration('repohangar').get<string>('gitGraph.whenMissing', 'sourceControlGraph');
    return graphVariant(this.detector.installed, whenMissing);
  }

  /** The graph action of `g`, `◈`, the menus and `repohangar.openInGitGraph`, on the repository of `target`. */
  async open(target: () => Promise<string | undefined>): Promise<void> {
    switch (this.variant) {
      case 'gitGraph': {
        const path = await target();
        if (path !== undefined) await this.openGitGraph(path);
        return;
      }
      case 'sourceControlGraph': {
        const path = await target();
        if (path !== undefined) await this.openSourceControlGraph(path);
        return;
      }
      case 'offerInstall':
      case 'hidden':
        return this.offerInstall();
    }
  }

  async openGitGraph(path: string): Promise<void> {
    const result = await openGitGraph(path, {
      findRepoRoot: (folder) => findRepoRoot(folder, nodeFileSystem),
      activateGitGraph: async () => {
        await vscode.extensions.getExtension(GIT_GRAPH_EXTENSION)?.activate();
      },
      registeredCommands: () => this.commands.getCommands(),
      view: async (root) => {
        await (root === undefined
          ? this.commands.execute(GIT_GRAPH_VIEW_COMMAND)
          : this.commands.execute(GIT_GRAPH_VIEW_COMMAND, { rootUri: vscode.Uri.file(root) }));
      },
      display: (folder) => vscode.workspace.asRelativePath(folder, true),
      warn: (text) => void this.notifier.show('warning', text),
      error: (text) => void this.notifier.show('error', text),
      log: (message) => this.log.warn(message),
    });
    if (result.opened) await this.sourceControl.afterGitGraph(result.root);
  }

  async openSourceControlGraph(path: string): Promise<void> {
    const root = await findRepoRoot(path, nodeFileSystem);
    if (root === null) {
      void this.notifier.show('warning', `Cannot open the Source Control Graph: "${vscode.workspace.asRelativePath(path, true)}" is not in a Git repository.`);
      return;
    }
    await this.sourceControl.openGraph(root);
  }

  async offerInstall(): Promise<void> {
    const choice = await this.notifier.show('information', NOT_INSTALLED_TEXT, INSTALL_BUTTON);
    if (choice === INSTALL_BUTTON) await this.commands.execute('workbench.extensions.installExtension', GIT_GRAPH_EXTENSION);
  }
}
