// The Explorer integration: the repository roots context key of the Explorer menus (explorer-open-in-git-graph:
// Repository roots; design D-3) and Reveal in Explorer (explorer-reveal) through the port of reveal.ts.

import { relative } from 'node:path';
import * as vscode from 'vscode';
import type { GitApiAccess } from '../git/api';
import { nodeFileSystem } from '../git/fsPort';
import { mergeRoots, scanRepositories } from '../git/repoRoots';
import { ALWAYS_DO_THIS, revealRepository, type OutsideChoice, type RevealOutcome } from './reveal';
import type { CommandRunner } from './workbench';

export const REPOSITORY_ROOTS_CONTEXT = 'repohangar.repositoryRoots';
const DEFAULT_SCAN_DEPTH = 3;
const RESCAN_DELAY_MS = 100;

/** The context key `repohangar.repositoryRoots`: the Git API's roots and the scan of every workspace folder. */
export class RepositoryRoots implements vscode.Disposable {
  /** The roots last set on the context key, as `Uri.fsPath` */
  current: string[] = [];
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly disposables: vscode.Disposable[];

  constructor(
    private readonly git: GitApiAccess,
    onDidChangeRepositories: vscode.Event<void>,
  ) {
    this.disposables = [
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.schedule()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('repohangar.repositoryScanDepth')) this.schedule();
      }),
      onDidChangeRepositories(() => this.schedule()),
    ];
  }

  /** Rescans soon; repeated triggers run one scan. */
  schedule(delayMs = RESCAN_DELAY_MS): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.rescan();
    }, delayMs);
  }

  /** Scans the workspace folders and sets the context key, unless a newer scan replaced this one. */
  async rescan(): Promise<void> {
    const generation = ++this.generation;
    const scanned: string[] = [];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      if (folder.uri.scheme !== 'file') continue;
      const depth = vscode.workspace.getConfiguration('repohangar', folder.uri).get<number>('repositoryScanDepth', DEFAULT_SCAN_DEPTH);
      const valid = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : DEFAULT_SCAN_DEPTH;
      scanned.push(...(await scanRepositories([folder.uri.fsPath], valid, nodeFileSystem)));
    }
    if (generation !== this.generation) return;
    const gitRoots = (this.git.current?.repositories ?? []).map((r) => r.rootUri.fsPath);
    const roots = mergeRoots([gitRoots, scanned.map((root) => vscode.Uri.file(root).fsPath)], process.platform);
    this.current = roots;
    await vscode.commands.executeCommand('setContext', REPOSITORY_ROOTS_CONTEXT, roots);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    for (const d of this.disposables) d.dispose();
  }
}

/** Reveal in Explorer on a repository root (explorer-reveal). */
export class ExplorerReveal {
  constructor(private readonly commands: CommandRunner) {}

  reveal(root: string, name: string): Promise<RevealOutcome> {
    const uri = vscode.Uri.file(root);
    const settings = () => vscode.workspace.getConfiguration('repohangar.explorer', uri);
    return revealRepository(
      root,
      name,
      {
        insideWorkspace: () =>
          (vscode.workspace.workspaceFolders ?? []).some((f) => f.uri.scheme === 'file' && isInside(f.uri.fsPath, root)),
        collapseBeforeReveal: () => settings().get<boolean>('collapseBeforeReveal', false),
        outsideWorkspace: () => settings().get<string>('outsideWorkspace', 'ask'),
        collapseExplorerFolders: async () => {
          await this.commands.execute('workbench.files.action.collapseExplorerFolders');
        },
        revealInExplorer: async () => {
          await this.commands.execute('revealInExplorer', uri);
        },
        addToWorkspace: (path) => addWorkspaceFolder(path),
        openInNewWindow: async () => {
          await this.commands.execute('vscode.openFolder', uri, { forceNewWindow: true });
        },
        revealInOS: async () => {
          await this.commands.execute('revealFileInOS', uri);
        },
        pick: (items, placeholder) => pickWithAlways(items, placeholder),
        writeOutsideWorkspace: async (value) => {
          await vscode.workspace.getConfiguration('repohangar').update('explorer.outsideWorkspace', value, vscode.ConfigurationTarget.Global);
        },
      },
      process.platform,
    );
  }
}

function isInside(folder: string, path: string): boolean {
  const rel = relative(folder, path);
  return rel === '' || (!rel.startsWith('..') && !/^[a-zA-Z]:/.test(rel) && !rel.startsWith('/') && !rel.startsWith('\\'));
}

/** Adds the folder as the last workspace folder and resolves once VS Code reports it (or after 5 s). */
function addWorkspaceFolder(path: string): Promise<void> {
  return new Promise((done) => {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const timer = setTimeout(finish, 5_000);
    const subscription = vscode.workspace.onDidChangeWorkspaceFolders(finish);
    function finish() {
      clearTimeout(timer);
      subscription.dispose();
      done();
    }
    if (!vscode.workspace.updateWorkspaceFolders(folders.length, 0, { uri: vscode.Uri.file(path) })) finish();
  });
}

/** The quick pick of Repositories outside the workspace folders, with the item button Always do this. */
function pickWithAlways(
  items: { choice: OutsideChoice; label: string }[],
  placeholder: string,
): Promise<{ choice: OutsideChoice; always: boolean } | undefined> {
  return new Promise((done) => {
    type Item = vscode.QuickPickItem & { choice: OutsideChoice };
    const quickPick = vscode.window.createQuickPick<Item>();
    quickPick.placeholder = placeholder;
    quickPick.items = items.map((item) => ({
      label: item.label,
      choice: item.choice,
      buttons: [{ iconPath: new vscode.ThemeIcon('pin'), tooltip: ALWAYS_DO_THIS }],
    }));
    let result: { choice: OutsideChoice; always: boolean } | undefined;
    quickPick.onDidAccept(() => {
      const item = quickPick.selectedItems[0];
      if (item) result = { choice: item.choice, always: false };
      quickPick.hide();
    });
    quickPick.onDidTriggerItemButton((e) => {
      result = { choice: e.item.choice, always: true };
      quickPick.hide();
    });
    quickPick.onDidHide(() => {
      quickPick.dispose();
      done(result);
    });
    quickPick.show();
  });
}
