// Row actions and batches as the user starts them: the commands, the notifications, the batch progress with Cancel,
// the terminal, the clipboard and the repository a command acts on (git-operations, batch-operations).

import * as vscode from 'vscode';
import { notListedText, resolveActiveRepository, type CommandArgument } from '../git/activeRepository';
import type { GitApiAccess } from '../git/api';
import type { GuardNotice } from '../git/guards';
import type { GitOperations } from '../git/operations';
import type { Registry } from '../git/registry';
import { batchSummary, progressText, recentlyFetchedText } from '../jobs/summary';
import type { BatchRun, Job, JobRunner } from '../jobs/runner';
import { batchTargets } from '../shared/batch';
import type { BatchAction, JobAction, RowAction } from '../shared/model';
import type { Notification } from '../integrations/workbench';

export type { Notification } from '../integrations/workbench';

/** The row actions of the graph, Explorer and Source Control integrations, on a repository root. */
export interface RowIntegrations {
  graph(root: string): Promise<void>;
  revealInExplorer(root: string, name: string): Promise<void>;
  showInSourceControl(root: string): Promise<void>;
}

/** The merge request actions of a row (hosting-providers). */
export interface ReviewIntegrations {
  openReview(id: string): Promise<void>;
  copyLink(id: string): Promise<void>;
  openCompare(id: string): Promise<void>;
  openPipeline(id: string): Promise<void>;
  /** RepoHangar pushed, published or synced the repository */
  afterPush(id: string): void;
}

const SHOW_OUTPUT = 'Show Git Output';

const FAILURE_NAMES: Record<JobAction, string> = {
  fetch: 'Fetch',
  pull: 'Pull',
  pullFf: 'Pull (ff)',
  push: 'Push',
  publish: 'Publish',
  sync: 'Sync',
};

export class Actions implements vscode.Disposable {
  /** Every notification shown while `recordNotifications` is true (integration tests). */
  readonly notifications: Notification[] = [];
  recordNotifications = false;
  /** Repositories RepoHangar acted on in this window, most recent first (design D-7). */
  private readonly recent: string[] = [];
  private readonly disposables: vscode.Disposable[];
  /** Set after construction: the integrations resolve their targets through `resolveActive`. */
  integrations: RowIntegrations | undefined;
  /** Set after construction by the provider layer. */
  review: ReviewIntegrations | undefined;

  constructor(
    private readonly registry: Registry,
    private readonly runner: JobRunner,
    private readonly operations: GitOperations,
    private readonly git: GitApiAccess,
    /** The rows selected in the dashboard; empty when it is closed. */
    private readonly selection: () => readonly string[],
  ) {
    this.disposables = [
      vscode.commands.registerCommand('repohangar.fetch', (arg?: unknown) => this.onActive(arg, (id) => this.runRowAction(id, 'fetch'))),
      vscode.commands.registerCommand('repohangar.pullFf', (arg?: unknown) => this.onActive(arg, (id) => this.pullFf(id))),
      vscode.commands.registerCommand('repohangar.fetchAll', () => this.runBatchCommand('fetchAll')),
      vscode.commands.registerCommand('repohangar.pullAllFf', () => this.runBatchCommand('pullAllFf')),
    ];
  }

  /** Runs a row action on a listed repository; ids that are not listed are ignored. */
  async runRowAction(id: string, action: RowAction): Promise<void> {
    const repository = this.registry.repository(id);
    if (!repository) return;
    this.touch(id);
    const notice = (n: GuardNotice) => this.showNotice(id, n);
    switch (action) {
      case 'fetch':
        return this.single(id, 'fetch', this.operations.fetch(id));
      case 'pull':
        return this.single(id, 'pull', this.operations.pull(id, notice));
      case 'push':
        return this.single(id, 'push', this.operations.push(id, notice));
      case 'sync':
        return this.single(id, 'sync', this.operations.sync(id));
      case 'switchBranch':
        return this.operations.runCommand(id, 'git.checkout');
      case 'stash':
        return this.operations.runCommand(id, 'git.stash');
      case 'stashPop':
        return this.operations.runCommand(id, 'git.stashPopLatest');
      case 'discardAll':
        return this.operations.runCommand(id, 'git.cleanAll');
      case 'terminal': {
        const terminal = vscode.window.createTerminal({ cwd: repository.rootUri, name: this.name(id) });
        terminal.show();
        return;
      }
      case 'revealInOS':
        await this.operations.commands.executeCommand('revealFileInOS', repository.rootUri);
        return;
      case 'copyPath':
        await vscode.env.clipboard.writeText(repository.rootUri.fsPath);
        return;
      case 'copyBranch': {
        const branch = repository.state.HEAD?.name;
        if (branch) await vscode.env.clipboard.writeText(branch);
        return;
      }
      case 'graph':
        return this.integrations?.graph(repository.rootUri.fsPath);
      case 'revealInExplorer':
        return this.integrations?.revealInExplorer(repository.rootUri.fsPath, this.name(id));
      case 'showInSourceControl':
        return this.integrations?.showInSourceControl(repository.rootUri.fsPath);
      case 'openReview':
        return this.review?.openReview(id);
      case 'copyReviewLink':
        return this.review?.copyLink(id);
      case 'openCompare':
        return this.review?.openCompare(id);
      case 'openPipeline':
        return this.review?.openPipeline(id);
    }
  }

  /** Pull (ff) on one repository, with a notification for a skip or a failure. */
  async pullFf(id: string): Promise<void> {
    if (!this.registry.repository(id)) return;
    this.touch(id);
    const finished = await this.runner.run(id, 'pullFf', this.operations.pullFf(id));
    if (finished?.result.state === 'skipped') {
      this.notify('warning', `Pull (ff) skipped in ${this.name(id)}: ${finished.result.detail}.`, []);
    } else if (finished?.result.state === 'failed') {
      this.notifyFailure(id, 'pullFf', finished.result.detail);
    }
  }

  /** Runs a batch on the listed repositories among `ids`, with a progress notification and a summary. */
  async runBatch(action: BatchAction, ids: readonly string[]): Promise<BatchRun | undefined> {
    const listed = ids.filter((id) => this.registry.repository(id));
    if (listed.length === 0) return undefined;
    const run = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, cancellable: true },
      (progress, token) =>
        this.runner.runBatch(action, listed, (id) => this.operations.batchJob(action, id), {
          token,
          onProgress: (done, total) => progress.report({ message: progressText(action, done, total) }),
        }),
    );
    if (run.kind === 'recent') {
      this.notify('information', recentlyFetchedText(run.seconds), []);
    } else {
      const summary = batchSummary(action, run.elapsedMs, run.results);
      this.notify(summary.severity, summary.text, summary.showOutput ? [SHOW_OUTPUT] : []);
    }
    return run;
  }

  private runBatchCommand(trigger: 'fetchAll' | 'pullAllFf'): Promise<BatchRun | undefined> {
    const { action, ids } = batchTargets(trigger, this.selection(), this.registry.ids());
    return this.runBatch(action, ids);
  }

  private async single(id: string, action: JobAction, job: Job): Promise<void> {
    const finished = await this.runner.run(id, action, job);
    if (finished?.result.state === 'failed') this.notifyFailure(id, finished.action, finished.result.detail);
    const pushed = finished?.action === 'push' || finished?.action === 'publish' || finished?.action === 'sync';
    if (pushed && finished?.result.state === 'ok' && finished.result.detail !== 'nothing to push') this.review?.afterPush(id);
  }

  private notifyFailure(id: string, action: JobAction, message: string | undefined): void {
    this.notify('error', `${FAILURE_NAMES[action]} failed in ${this.name(id)}: ${message ?? 'unknown error'}`, [SHOW_OUTPUT]);
  }

  private showNotice(id: string, notice: GuardNotice): void {
    this.notify('warning', notice.text, notice.pull ? ['Pull'] : [], (choice) => {
      if (choice === 'Pull') void this.runRowAction(id, 'pull');
    });
  }

  /** Shows a notification without waiting for it; `Show Git Output` runs `git.showOutput`. */
  private notify(
    severity: Notification['severity'],
    text: string,
    buttons: string[],
    onChoice?: (choice: string | undefined) => void,
  ): void {
    if (this.recordNotifications) this.notifications.push({ severity, text, buttons });
    const show =
      severity === 'error'
        ? vscode.window.showErrorMessage
        : severity === 'warning'
          ? vscode.window.showWarningMessage
          : vscode.window.showInformationMessage;
    void show(text, ...buttons).then((choice) => {
      if (choice === SHOW_OUTPUT) void vscode.commands.executeCommand('git.showOutput');
      onChoice?.(choice);
    });
  }

  private name(id: string): string {
    const repository = this.registry.repository(id);
    return repository ? (repository.rootUri.path.split('/').pop() ?? id) : id;
  }

  private touch(id: string): void {
    const i = this.recent.indexOf(id);
    if (i >= 0) this.recent.splice(i, 1);
    this.recent.unshift(id);
  }

  /** Resolves the active repository of a command (design D-7) and runs `run` on it. */
  private async onActive(arg: unknown, run: (id: string) => Promise<void>): Promise<void> {
    const id = await this.resolveActive(arg);
    if (id !== undefined) await run(id);
  }

  /**
   * The listed repository a command acts on (git-operations: Active repository for commands), or undefined after a
   * notification or a dismissed quick pick.
   */
  async resolveActive(arg: unknown): Promise<string | undefined> {
    const roots = this.registry.ids().flatMap((id) => {
      const repository = this.registry.repository(id);
      return repository ? [{ id, name: this.name(id), path: repository.rootUri.fsPath }] : [];
    });
    const editor = vscode.window.activeTextEditor?.document.uri;
    const scmSelected = this.git.current?.repositories.find((r) => r.ui.selected);
    const resolution = await resolveActiveRepository(
      {
        roots,
        argument: commandArgument(arg),
        editorPath: editor?.scheme === 'file' ? editor.fsPath : undefined,
        scmSelection: scmSelected?.rootUri.fsPath,
        recent: this.recent,
        pick: async (ordered) => {
          const chosen = await vscode.window.showQuickPick(
            ordered.map((r) => ({ label: r.name, description: r.path, id: r.id })),
            { placeHolder: 'Select a repository' },
          );
          return chosen?.id;
        },
      },
      process.platform,
    );
    if (resolution.kind === 'notListed') {
      this.notify('warning', notListedText(vscode.workspace.asRelativePath(resolution.path, true)), []);
      return undefined;
    }
    if (resolution.kind === 'repository') this.touch(resolution.id);
    return resolution.kind === 'repository' ? resolution.id : undefined;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

/** An Explorer resource (`Uri`), or a Source Control repository or Git API repository (an object with `rootUri`). */
export function commandArgument(arg: unknown): CommandArgument | undefined {
  if (arg instanceof vscode.Uri) return arg.scheme === 'file' ? { kind: 'folder', path: arg.fsPath } : undefined;
  const rootUri = (arg as { rootUri?: unknown } | undefined)?.rootUri;
  if (rootUri instanceof vscode.Uri) return { kind: 'repository', path: rootUri.fsPath };
  return undefined;
}
