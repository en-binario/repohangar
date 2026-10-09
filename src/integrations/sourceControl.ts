// Source Control for a repository (source-control-reveal, source-control-selection-sync; design D-1): showing it after
// Open in Git Graph, Show in Source Control, and the selection sync behind the ports of scmReveal and scmSelection.

import { resolve } from 'node:path';
import * as vscode from 'vscode';
import type { GitApiAccess } from '../git/api';
import type { API } from '../git/git';
import type { RepoHangarLog } from '../log';
import { briefRevealCommands, FOCUS_ACTIVE_EDITOR_GROUP_COMMAND, revealSourceControl, SHOW_SOURCE_CONTROL_COMMAND } from './scmReveal';
import {
  parseInputBoxUri,
  parseToggleHandles,
  SourceControlSelection,
  syncSourceControlSelection,
  TOGGLE_COMMAND_PREFIX,
  type SourceControlPort,
  type SyncResult,
} from './scmSelection';
import type { CommandRunner } from './workbench';

export const SOURCE_CONTROL_GRAPH_FOCUS_COMMAND = 'workbench.scm.history.focus';

/** The RepoHangar settings that apply to a repository (resource scope). */
export function repoSettings(root: string): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('repohangar', vscode.Uri.file(root));
}

export function samePath(a: string, b: string): boolean {
  const normalize = (value: string) => {
    const resolved = resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(a) === normalize(b);
}

export class SourceControl {
  private readonly selection: SourceControlSelection;

  constructor(
    private readonly git: GitApiAccess,
    private readonly commands: CommandRunner,
    private readonly log: RepoHangarLog,
  ) {
    this.selection = new SourceControlSelection((message) => log.warn(message));
  }

  /** After Open in Git Graph: shows Source Control with focus back on Git Graph, then syncs the selection. */
  async afterGitGraph(root: string): Promise<void> {
    const revealEnabled = repoSettings(root).get<boolean>('gitGraph.revealSourceControl', true);
    await revealSourceControl(
      true,
      revealEnabled,
      {
        showSourceControl: async () => {
          await this.commands.execute(SHOW_SOURCE_CONTROL_COMMAND);
        },
        focusGitGraph: async () => {
          await this.commands.execute(FOCUS_ACTIVE_EDITOR_GROUP_COMMAND);
        },
      },
      (message) => this.log.warn(message),
    );
    await this.sync(root, { force: false, briefReveal: briefRevealCommands(revealEnabled) });
  }

  /** Show in Source Control: the view with keyboard focus, then the selection sync whatever its setting is. */
  async show(root: string): Promise<void> {
    await this.commands.execute(SHOW_SOURCE_CONTROL_COMMAND);
    await this.sync(root, { force: true, briefReveal: [SHOW_SOURCE_CONTROL_COMMAND] });
  }

  /** The Source Control Graph: Source Control, the forced selection sync, then the focus on the graph view. */
  async openGraph(root: string): Promise<void> {
    await this.commands.execute(SHOW_SOURCE_CONTROL_COMMAND);
    await this.sync(root, { force: true, briefReveal: [SHOW_SOURCE_CONTROL_COMMAND] });
    try {
      await this.commands.execute(SOURCE_CONTROL_GRAPH_FOCUS_COMMAND);
    } catch (error) {
      this.log.warn(`Focusing the Source Control Graph failed: ${describe(error)}`);
    }
    // In VS Code 1.141 the graph's Auto repository does not follow the Repositories selection (design.md).
    this.log.info(`The Source Control Graph shows the repository of its Repo picker; pick "${root}" there if it shows another.`);
  }

  /** Selects the repository in the Repositories view; never throws (source-control-selection-sync: Failure isolation). */
  async sync(root: string, options: { force: boolean; briefReveal: string[] }): Promise<SyncResult | undefined> {
    try {
      const api = this.git.current;
      // The API's `enabled` flag doesn't follow `git.enabled` changes made while the window is open, so check both.
      const gitEnabled = api !== undefined && vscode.workspace.getConfiguration('git').get<boolean>('enabled', true);
      const result = await syncSourceControlSelection(
        true,
        root,
        {
          syncEnabled: repoSettings(root).get<boolean>('gitGraph.syncSourceControlSelection', true),
          selectionMode: vscode.workspace.getConfiguration('scm').get<string>('repositories.selectionMode', 'multiple'),
          gitAvailable: gitEnabled,
          openRepository: (repositoryRoot) => openGitRepository(api as API, repositoryRoot),
          port: gitEnabled ? this.port(api as API, options.briefReveal) : unavailablePort,
          log: (message) => this.log.warn(message),
        },
        this.selection,
        options.force,
      );
      this.log.debug(`Source Control selection sync for "${root}": ${result}`);
      return result;
    } catch (error) {
      this.log.error(`Syncing the Source Control selection failed: ${describe(error)}`);
      return undefined;
    }
  }

  private port(api: API, briefReveal: string[]): SourceControlPort {
    return {
      listToggleHandles: async () => parseToggleHandles(await this.commands.getCommands()),
      revealSourceControlBriefly: async () => {
        for (const command of briefReveal) await this.commands.execute(command);
      },
      inputBoxHandles: () => {
        const known = new Map<number, string>();
        for (const document of vscode.workspace.textDocuments) {
          const parsed = parseInputBoxUri(document.uri.scheme, document.uri.path, document.uri.query);
          if (parsed === undefined) continue;
          const rootPath = vscode.Uri.parse(parsed.rootUri).fsPath;
          const repository = api.repositories.find((candidate) => samePath(candidate.rootUri.fsPath, rootPath));
          if (repository !== undefined) known.set(parsed.handle, repository.rootUri.fsPath);
        }
        return known;
      },
      toggle: (handle, timeoutMs) =>
        new Promise<boolean>((done, fail) => {
          const subscriptions: vscode.Disposable[] = [];
          const finish = (changed: boolean) => {
            clearTimeout(timer);
            subscriptions.forEach((s) => s.dispose());
            done(changed);
          };
          for (const repository of api.repositories) subscriptions.push(repository.ui.onDidChange(() => finish(true)));
          const timer = setTimeout(() => finish(false), timeoutMs);
          this.commands.execute(TOGGLE_COMMAND_PREFIX + handle).then(undefined, (error: unknown) => {
            clearTimeout(timer);
            subscriptions.forEach((s) => s.dispose());
            fail(error);
          });
        }),
      selectedRoot: () => api.repositories.find((repository) => repository.ui.selected)?.rootUri.fsPath,
      repositoryRoots: () => api.repositories.map((repository) => repository.rootUri.fsPath),
    };
  }
}

async function openGitRepository(api: API, root: string): Promise<string | undefined> {
  const matches = (repositoryRoot: string) => samePath(repositoryRoot, root);
  let repository = api.repositories.find((candidate) => matches(candidate.rootUri.fsPath));
  if (repository === undefined) {
    const opened = await api.openRepository(vscode.Uri.file(root));
    repository = opened !== null && matches(opened.rootUri.fsPath) ? opened : undefined;
  }
  return repository?.rootUri.fsPath;
}

const unavailablePort: SourceControlPort = {
  listToggleHandles: async () => [],
  revealSourceControlBriefly: async () => undefined,
  inputBoxHandles: () => new Map(),
  toggle: async () => false,
  selectedRoot: () => undefined,
  repositoryRoots: () => [],
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
