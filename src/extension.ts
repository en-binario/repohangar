// Activation: wires the Git API, the registry and store, the dashboard, the status bar and the commands.

import * as vscode from 'vscode';
import { GitApiAccess } from './git/api';
import { gitProcessLog } from './git/process';
import { Registry } from './git/registry';
import { RowStore } from './state/store';
import { DASHBOARD_VIEW_TYPE, DashboardController } from './ui/dashboard';
import { StatusBar } from './ui/statusBar';
import { ViewState } from './ui/viewState';

export const OPEN_ON_STARTUP_THRESHOLD = 3;

export interface TestApi {
  git: GitApiAccess;
  registry: Registry;
  store: RowStore;
  dashboard: DashboardController;
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
  const dashboard = new DashboardController(context.extensionUri, store, registry, git, viewState);
  const statusBar = new StatusBar(store);
  const reg = registry;

  context.subscriptions.push(
    git,
    viewState,
    { dispose: () => store.dispose() },
    registry,
    dashboard,
    statusBar,
    git.onDidChange(() => reg.attach(git.current)),
    vscode.window.registerWebviewPanelSerializer(DASHBOARD_VIEW_TYPE, dashboard),
    vscode.commands.registerCommand('repohangar.open', () => dashboard.open()),
    vscode.commands.registerCommand('repohangar.scm.openDashboard', () => vscode.commands.executeCommand('repohangar.open')),
    vscode.commands.registerCommand('repohangar.refresh', () => reg.refreshAll()),
  );

  const startupCheck = openOnStartup(git, dashboard);

  if (context.extensionMode !== vscode.ExtensionMode.Test) return undefined;
  return { git, registry, store, dashboard, statusBar, viewState, gitProcessLog, startupCheck, openOnStartup };
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
