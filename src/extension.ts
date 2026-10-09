// Activation: wires the Git API, the registry and store, the dashboard, the status bar and the commands.

import * as vscode from 'vscode';
import { GitApiAccess } from './git/api';
import { GitOperations } from './git/operations';
import { gitProcessLog } from './git/process';
import { Registry } from './git/registry';
import { JobRunner } from './jobs/runner';
import { RowStore } from './state/store';
import { Actions } from './ui/actions';
import { DASHBOARD_VIEW_TYPE, DashboardController } from './ui/dashboard';
import { StatusBar } from './ui/statusBar';
import { ViewState } from './ui/viewState';

export const OPEN_ON_STARTUP_THRESHOLD = 3;

export interface TestApi {
  git: GitApiAccess;
  registry: Registry;
  store: RowStore;
  dashboard: DashboardController;
  runner: JobRunner;
  operations: GitOperations;
  actions: Actions;
  statusBar: StatusBar;
  viewState: ViewState;
  gitProcessLog: typeof gitProcessLog;
  startupCheck: Promise<'opened' | 'notOpened'>;
  openOnStartup: typeof openOnStartup;
}

export async function activate(context: vscode.ExtensionContext): Promise<TestApi | undefined> {
  const git = await GitApiAccess.create();
  const viewState = new ViewState(context.workspaceState);
  // The store computes rows through the registry, which is created right after it.
  let registry: Registry | undefined;
  const store = new RowStore(async (id) => registry?.compute(id));
  registry = new Registry(store, viewState);
  registry.attach(git.current);
  const reg = registry;
  const runner = new JobRunner({
    concurrency: () => setting('concurrency', 6, 1, 32),
    timeoutSeconds: () => setting('fetchTimeoutSeconds', 60, 5, 600),
    setJob: (id, job) => store.setJob(id, job),
  });
  const operations = new GitOperations(reg, () => git.current?.git.path ?? 'git');
  // The batch commands act on the dashboard's selection; the dashboard runs the actions.
  let dashboard: DashboardController | undefined;
  const actions = new Actions(reg, runner, operations, git, () => dashboard?.selection ?? []);
  dashboard = new DashboardController(context.extensionUri, store, registry, git, viewState, actions);
  const panel = dashboard;
  const statusBar = new StatusBar(store);

  context.subscriptions.push(
    git,
    viewState,
    { dispose: () => store.dispose() },
    registry,
    actions,
    dashboard,
    statusBar,
    git.onDidChange(() => reg.attach(git.current)),
    vscode.window.registerWebviewPanelSerializer(DASHBOARD_VIEW_TYPE, panel),
    vscode.commands.registerCommand('repohangar.open', () => panel.open()),
    vscode.commands.registerCommand('repohangar.scm.openDashboard', () => vscode.commands.executeCommand('repohangar.open')),
    vscode.commands.registerCommand('repohangar.scm.fetch', (arg?: unknown) => vscode.commands.executeCommand('repohangar.fetch', arg)),
    vscode.commands.registerCommand('repohangar.refresh', () => reg.refreshAll()),
  );

  const startupCheck = openOnStartup(git, panel);

  if (context.extensionMode !== vscode.ExtensionMode.Test) return undefined;
  return {
    git,
    registry,
    store,
    dashboard: panel,
    runner,
    operations,
    actions,
    statusBar,
    viewState,
    gitProcessLog,
    startupCheck,
    openOnStartup,
  };
}

/** An integer setting, clamped to its declared range. */
function setting(key: string, fallback: number, min: number, max: number): number {
  const value = vscode.workspace.getConfiguration('repohangar').get<number>(key, fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
}

/** Opens the dashboard once, when the Git API first becomes initialized (dashboard: Open on startup). */
export async function openOnStartup(
  git: Pick<GitApiAccess, 'whenInitialized'>,
  dashboard: Pick<DashboardController, 'exists' | 'open'>,
): Promise<'opened' | 'notOpened'> {
  const api = await git.whenInitialized();
  const setting = vscode.workspace.getConfiguration('repohangar').get<string>('openOnStartup', 'never');
  if (setting !== 'multiRepo' || dashboard.exists || api.repositories.length < OPEN_ON_STARTUP_THRESHOLD) {
    return 'notOpened';
  }
  dashboard.open({ preserveFocus: true });
  return 'opened';
}

export function deactivate(): void {
  // Everything is disposed through context.subscriptions.
}
