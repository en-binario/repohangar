// Row actions and batches as the user starts them: the commands, the notifications, the batch progress with Cancel,
// the branch quick picks, the batch result panel with its fix buttons and Retry failed, the terminal, the clipboard
// and the repository a command acts on (git-operations, batch-operations).

import * as vscode from 'vscode';
import { notListedText, resolveActiveRepository, type CommandArgument } from '../git/activeRepository';
import type { GitApiAccess } from '../git/api';
import { invalidNameMessage, suggestBranches, type BranchSnapshot } from '../git/branchBatch';
import type { GuardNotice } from '../git/guards';
import type { GitOperations } from '../git/operations';
import type { Registry } from '../git/registry';
import { BatchResults, type LineUpdate, type PanelView } from '../jobs/results';
import { batchSummary, progressText, recentlyFetchedText } from '../jobs/summary';
import type { BatchRun, Job, JobRunner } from '../jobs/runner';
import { batchTargets, branchTargets } from '../shared/batch';
import { needsPanel, type BatchPanel, type FixId } from '../shared/batchResult';
import { plural } from '../shared/format';
import type { BatchAction, BatchParams, DirtyChoice, JobAction, JobResult, RowAction } from '../shared/model';
import type { Notification } from '../integrations/workbench';
import { vscodeBranchUi, type BranchUi } from './quickInputs';

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
  /** `m`, the hover button and [Create MR]: as `repohangar.mr.quickCreate` says (mr-creation: Create entry points) */
  createMr(id: string): Promise<void>;
  /** `M`: the drawer */
  createMrEdit(id: string): Promise<void>;
}

/** Where the result panel is shown: the dashboard (batch-operations: Batch result panel). */
export interface ResultView {
  /** Shows the panel, or closes it with null; `open` opens the dashboard first (Show Details) */
  showBatchResult(panel: BatchPanel | null, open?: boolean): void;
  updateBatchResultLine(update: LineUpdate): void;
}

/** Merge requests for a selection (mr-creation: Create merge requests on a selection); set by `MrService`. */
export interface MrBatch {
  /** The confirmation of `repohangar.mr.quickCreate` `"confirm"`; true in `"direct"` mode, false when dismissed */
  confirm(ids: readonly string[]): Promise<boolean>;
  /** The single-repository flow with the batch flag, as the repository's job (design D-1) */
  job(id: string): Job;
  /** After the jobs: the related links of every review of the batch (D-3), and what the panel shows */
  finish(ids: readonly string[]): Promise<PanelView>;
  openReview(id: string): Promise<void>;
  copyAllLinks(ids: readonly string[]): Promise<void>;
  /** Sign In… of a line; true when the user signed in */
  signIn(id: string): Promise<boolean>;
}

export interface BatchOptions {
  /** The branch and dirty choice of a Switch or Create */
  params?: BatchParams;
  /** Started from the dashboard, which then shows the result panel at once */
  fromDashboard?: boolean;
  /** Retry failed: replaces the failed lines of the panel */
  retry?: boolean;
}

const SHOW_OUTPUT = 'Show Git Output';
const SHOW_DETAILS = 'Show Details';

const FAILURE_NAMES: Record<JobAction, string> = {
  fetch: 'Fetch',
  pull: 'Pull',
  pullFf: 'Pull (ff)',
  push: 'Push',
  publish: 'Publish',
  sync: 'Sync',
  createMr: 'Create MR',
  switch: 'Switch',
  createBranch: 'Create branch',
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
  /** Set after construction: the dashboard. */
  resultView: ResultView | undefined;
  /** The branch quick picks and input box; the integration tests replace them. */
  branchUi: BranchUi = vscodeBranchUi;
  /** The results of the last batch, which the result panel shows. */
  readonly results = new BatchResults();
  /** Set after construction by merge request creation. */
  mrBatch: MrBatch | undefined;

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
      vscode.commands.registerCommand('repohangar.switchBranch', () => this.runBranchCommand('switchBranch')),
      vscode.commands.registerCommand('repohangar.createBranch', () => this.runBranchCommand('createBranch')),
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
      case 'createMr':
        return this.review?.createMr(id);
      case 'createMrEdit':
        return this.review?.createMrEdit(id);
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

  /**
   * Runs a batch on the listed repositories among `ids`, with a progress notification and a summary; a batch with a
   * skipped or failed result gets the result panel, shown at once when it was started from the dashboard.
   */
  async runBatch(action: BatchAction, ids: readonly string[], options: BatchOptions = {}): Promise<BatchRun | undefined> {
    const listed = ids.filter((id) => this.registry.repository(id));
    if (listed.length === 0) return undefined;
    const params = options.params ?? {};
    const mrBatch = this.mrBatch;
    if (action === 'createMr' && !mrBatch) return undefined;
    const jobFor = (id: string): Job => (action === 'createMr' ? (mrBatch as MrBatch).job(id) : this.operations.batchJob(action, id, params));
    const run = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, cancellable: true },
      (progress, token) =>
        this.runner.runBatch(action, listed, jobFor, {
          token,
          onProgress: (done, total) => progress.report({ message: progressText(action, done, total, params.branch) }),
          retry: options.retry,
        }),
    );
    if (run.kind === 'recent') {
      this.notify('information', recentlyFetchedText(run.seconds), []);
      return run;
    }
    if (action === 'createMr') {
      await this.showMrResults(listed, run.results, run.elapsedMs, options.retry ?? false);
    } else if (options.retry) {
      listed.forEach((id, i) => this.postLine(this.results.replace(id, run.results[i] as JobResult)));
    } else {
      this.showResults(action, params, run.elapsedMs, listed, run.results, options.fromDashboard ?? false);
    }
    const summary = batchSummary(action, run.elapsedMs, run.results, {
      branch: params.branch,
      fromDashboard: options.fromDashboard || options.retry,
    });
    const buttons = [...(summary.showOutput ? [SHOW_OUTPUT] : []), ...(summary.showDetails ? [SHOW_DETAILS] : [])];
    this.notify(summary.severity, summary.text, buttons, (choice) => {
      if (choice === SHOW_DETAILS) this.resultView?.showBatchResult(this.results.panel() ?? null, true);
    });
    return run;
  }

  /**
   * The merge request panel (mr-creation: Merge request result panel), always shown: the related links are written
   * first, so every line says what they did; after Retry failed, every line of the batch is shown again.
   */
  private async showMrResults(ids: readonly string[], results: readonly JobResult[], elapsedMs: number, retry: boolean): Promise<void> {
    const mrBatch = this.mrBatch as MrBatch;
    if (retry) {
      ids.forEach((id, i) => this.results.replace(id, results[i] as JobResult));
      this.results.apply(await mrBatch.finish(this.results.ids()));
    } else {
      const view = await mrBatch.finish(ids);
      const entries = ids.map((id, i) => ({ id, name: this.name(id), result: results[i] as JobResult }));
      this.results.start('createMr', {}, elapsedMs, entries, view);
    }
    this.resultView?.showBatchResult(this.results.panel() ?? null);
  }

  /** `m` with rows selected, the toolbar button and `repohangar.mr.create` with a selection (design D-4). */
  async createMrsIn(ids: readonly string[]): Promise<BatchRun | undefined> {
    const listed = ids.filter((id) => this.registry.repository(id));
    if (listed.length === 0 || !this.mrBatch || !(await this.mrBatch.confirm(listed))) return undefined;
    for (const id of listed) this.touch(id);
    return this.runBatch('createMr', listed, { fromDashboard: true });
  }

  /** Copy all links of the merge request panel. */
  async copyAllLinks(): Promise<void> {
    if (this.results.action === 'createMr') await this.mrBatch?.copyAllLinks(this.results.ids());
  }

  /** A new batch replaces the result panel; it closes when every result is ok. */
  private showResults(
    action: BatchAction,
    params: BatchParams,
    elapsedMs: number,
    ids: readonly string[],
    results: readonly JobResult[],
    fromDashboard: boolean,
  ): void {
    if (!needsPanel(results)) {
      this.results.clear();
      this.resultView?.showBatchResult(null);
      return;
    }
    const entries = ids.map((id, i) => ({ id, name: this.name(id), result: results[i] as JobResult }));
    const panel = this.results.start(action, params, elapsedMs, entries);
    this.resultView?.showBatchResult(fromDashboard ? panel : null);
  }

  private runBatchCommand(trigger: 'fetchAll' | 'pullAllFf'): Promise<BatchRun | undefined> {
    const { action, ids } = batchTargets(trigger, this.selection(), this.registry.ids());
    return this.runBatch(action, ids);
  }

  private runBranchCommand(trigger: 'switchBranch' | 'createBranch'): Promise<BatchRun | undefined> {
    const targets = branchTargets(trigger, this.selection(), this.registry.ids());
    if (!targets) return Promise.resolve(undefined);
    return targets.action === 'switch' ? this.switchBranchIn(targets.ids) : this.createBranchIn(targets.ids);
  }

  /**
   * Switch branch in repositories (W7): the branch quick pick, the uncommitted changes choice when a target is dirty,
   * then the batch. Esc in either quick pick cancels with no Git operation.
   */
  async switchBranchIn(ids: readonly string[], options: { fromDashboard?: boolean } = {}): Promise<BatchRun | undefined> {
    const listed = ids.filter((id) => this.registry.repository(id));
    if (listed.length === 0) return undefined;
    const snapshots = (await Promise.all(listed.map((id) => this.operations.branchSnapshot(id)))).filter(
      (s): s is BranchSnapshot => s !== undefined,
    );
    const pick = await this.branchUi.pickBranch({
      title: `Switch branch in ${plural(listed.length, 'repository', 'repositories')}`,
      targets: listed.length,
      suggestions: suggestBranches(snapshots),
    });
    if (!pick) return undefined;
    if (pick.kind === 'create') {
      if (!(await this.operations.validBranchName(listed[0] as string, pick.branch))) {
        this.notify('warning', invalidNameMessage(pick.branch), []);
        return undefined;
      }
      return this.runBatch('createBranch', listed, { params: { branch: pick.branch }, fromDashboard: options.fromDashboard });
    }
    const dirty = snapshots.filter((s) => s.dirtyFiles > 0).length;
    let dirtyChoice: DirtyChoice = 'skip';
    if (dirty > 0) {
      const choice = await this.branchUi.pickDirtyChoice({ title: `${dirty} of ${listed.length} repositories have uncommitted changes` });
      if (!choice) return undefined;
      dirtyChoice = choice;
    }
    return this.runBatch('switch', listed, { params: { branch: pick.branch, dirtyChoice }, fromDashboard: options.fromDashboard });
  }

  /**
   * Create branch in repositories: one name, checked with `git check-ref-format --branch` in the first target before
   * any repository is touched, then the batch.
   */
  async createBranchIn(ids: readonly string[], options: { fromDashboard?: boolean } = {}): Promise<BatchRun | undefined> {
    const listed = ids.filter((id) => this.registry.repository(id));
    const first = listed[0];
    if (first === undefined) return undefined;
    const name = await this.branchUi.inputBranchName({
      title: `Create branch in ${plural(listed.length, 'repository', 'repositories')}`,
      validate: async (text) => ((await this.operations.validBranchName(first, text)) ? undefined : invalidNameMessage(text)),
    });
    if (name === undefined) return undefined;
    return this.runBatch('createBranch', listed, { params: { branch: name }, fromDashboard: options.fromDashboard });
  }

  /** The result panel shown now, for a dashboard that opens again. */
  batchPanel(): BatchPanel | undefined {
    return this.results.panel();
  }

  /** A fix button of the result panel, on its repository only (batch-operations: Fix button matrix). */
  async fix(id: string, fix: FixId): Promise<void> {
    const repository = this.registry.repository(id);
    const line = this.results.lineOf(id);
    if (!repository || !line || line.running || !line.fixes.includes(fix)) return;
    if (fix === 'openScm' || fix === 'showGitOutput') {
      const command = fix === 'openScm' ? 'repohangar.showInSourceControl' : 'git.showOutput';
      await this.operations.commands.executeCommand(command, ...(fix === 'openScm' ? [repository.rootUri] : []));
      return;
    }
    if (fix === 'openReview') return this.mrBatch?.openReview(id);
    if (fix === 'signIn') {
      // A sign-in creates that repository's review again, then links the batch (Retry failed merge requests).
      if (await this.mrBatch?.signIn(id)) await this.rerun([id]);
      return;
    }
    const branch = this.results.params.branch ?? '';
    const [action, job]: [JobAction, Job] =
      fix === 'stashAndPull'
        ? ['pullFf', this.operations.stashAndPullFf(id)]
        : fix === 'pullRebase'
          ? ['pull', this.operations.pullRebase(id)]
          : fix === 'publish'
            ? ['push', this.operations.push(id)]
            : fix === 'stashAndSwitch'
              ? ['switch', this.operations.switchBranch(id, branch, 'stash')]
              : ['createBranch', this.operations.createBranch(id, branch)];
    this.touch(id);
    this.postLine(this.results.setRunning(id, true));
    const finished = await this.runner.run(id, action, job);
    if (!finished) {
      this.postLine(this.results.setRunning(id, false));
      return;
    }
    const published = finished.action === 'publish' && finished.result.state === 'ok';
    this.postLine(this.results.replace(id, published ? { state: 'ok', detail: 'published' } : finished.result));
    if (published) this.review?.afterPush(id);
  }

  /** Retry failed: the same batch with the same parameters on the failed repositories only. */
  retryFailed(): Promise<BatchRun | undefined> {
    return this.rerun(this.results.failedIds());
  }

  private async rerun(ids: readonly string[]): Promise<BatchRun | undefined> {
    const action = this.results.action;
    if (action === undefined || ids.length === 0) return undefined;
    for (const id of ids) this.postLine(this.results.setRunning(id, true));
    const run = await this.runBatch(action, ids, { params: this.results.params, retry: true });
    if (!run || run.kind === 'recent') for (const id of ids) this.postLine(this.results.setRunning(id, false));
    return run;
  }

  closeBatchResult(): void {
    this.results.clear();
  }

  private postLine(update: LineUpdate | undefined): void {
    if (update) this.resultView?.updateBatchResultLine(update);
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
