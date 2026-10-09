// Activation: wires the Git API, the registry and store, the dashboard, the status bar, the graph, Explorer and Source
// Control integrations, and the commands.

import { basename } from 'node:path';
import * as vscode from 'vscode';
import { GitApiAccess } from './git/api';
import { nodeFileSystem } from './git/fsPort';
import { GitOperations } from './git/operations';
import { gitProcessLog } from './git/process';
import { Registry } from './git/registry';
import { findRepoRoot } from './git/repoRoots';
import { ExplorerReveal, RepositoryRoots } from './integrations/explorer';
import { GitGraphDetector, Graph } from './integrations/gitGraph';
import { LegacyOpenerGuard, migrateSettings, type MigrationWrite } from './integrations/migration';
import { SourceControl } from './integrations/sourceControl';
import { CommandRunner, Notifier } from './integrations/workbench';
import { JobRunner } from './jobs/runner';
import { RepoHangarLog } from './log';
import { MrService } from './mr/service';
import { ProviderService } from './providers/service';
import { RowStore } from './state/store';
import { Actions, commandArgument } from './ui/actions';
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
  log: RepoHangarLog;
  logUri: vscode.Uri;
  commands: CommandRunner;
  notifier: Notifier;
  gitGraph: GitGraphDetector;
  graph: Graph;
  sourceControl: SourceControl;
  repositoryRoots: RepositoryRoots;
  legacyOpener: LegacyOpenerGuard;
  migration: { writes: MigrationWrite[]; run(): Promise<MigrationWrite[]>; state: vscode.Memento };
  providers: ProviderService;
  mr: MrService;
}

export async function activate(context: vscode.ExtensionContext): Promise<TestApi | undefined> {
  const log = new RepoHangarLog();
  context.subscriptions.push(log);
  // Before anything reads the settings the migration copies (git-graph-opener-migration).
  const migrated = await migrateSettings(context.globalState, log).catch((error: unknown) => {
    log.error(`The migration of the Git Graph Opener settings failed: ${String(error)}`);
    return [];
  });
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
  const commands = new CommandRunner();
  const notifier = new Notifier();
  const gitGraph = new GitGraphDetector();
  const sourceControl = new SourceControl(git, commands, log);
  const graph = new Graph(gitGraph, sourceControl, commands, notifier, log);
  const explorerReveal = new ExplorerReveal(commands);
  const repositoryRoots = new RepositoryRoots(git, registry.onDidChangeRepositories);
  const legacyOpener = new LegacyOpenerGuard(context.globalState, notifier, commands);
  const providers = new ProviderService(context, store, registry, notifier, log);
  const mr = new MrService(context, store, registry, runner, providers, notifier, log, () => git.current?.git.path ?? 'git', (id, action) =>
    actions.runRowAction(id, action),
  commands,
  );
  actions.review = {
    openReview: (id) => providers.openReview(id),
    copyLink: (id) => providers.copyLink(id),
    openCompare: (id) => providers.openCompare(id),
    openPipeline: (id) => providers.openPipeline(id),
    afterPush: (id) => providers.afterPush(id),
    createMr: (id) => mr.createWithDefaults(id),
    createMrDirect: async (id) => void (await mr.runCreate(id, {})),
    createMrEdit: (id) => mr.openDrawer(id),
  };
  dashboard = new DashboardController(context.extensionUri, store, registry, git, viewState, actions, {
    get variant() {
      return graph.variant;
    },
    onDidChange: gitGraph.onDidChange,
  }, {
    firstRun: () => providers.firstRun(),
    firstRunDismissed: () => providers.firstRunDismissed(),
    onDidChangeFirstRun: providers.onDidChangeFirstRun,
    compareTarget: (id) => providers.compareTarget(id),
    signIn: (host) => providers.auth.signIn(host),
    chooseProvider: (host) => providers.chooseProvider(host),
    skipHost: (host) => providers.skipHost(host),
    firstRunDone: () => providers.firstRunDone(),
  });
  const panel = dashboard;
  panel.drawer = mr;
  actions.resultView = panel;
  mr.dashboard = { open: () => panel.open(), postDrawer: (data) => panel.showDrawer(data), postDrawerUsers: (id, users) => panel.postDrawerUsers(id, users) };
  /** Runs a merge request command on its repository: the argument, else the active repository. */
  const onRepository = (run: (id: string) => Promise<void>) => async (arg?: unknown) => {
    const id = await actions.resolveActive(arg);
    if (id !== undefined) await run(id);
  };
  const statusBar = new StatusBar(store);

  /** The folder or repository root a command acts on: its argument, else the active repository (design D-4). */
  const target = async (arg: unknown): Promise<string | undefined> => {
    const argument = commandArgument(arg);
    if (argument) return argument.path;
    const id = await actions.resolveActive(undefined);
    return id === undefined ? undefined : reg.repository(id)?.rootUri.fsPath;
  };
  /** The repository root of a command's target, or undefined after a warning. */
  const targetRoot = async (arg: unknown): Promise<string | undefined> => {
    const path = await target(arg);
    if (path === undefined) return undefined;
    const root = await findRepoRoot(path, nodeFileSystem);
    if (root === null) void notifier.show('warning', `"${vscode.workspace.asRelativePath(path, true)}" is not in a Git repository.`);
    return root ?? undefined;
  };
  const revealInExplorer = async (root: string, name = basename(root)) => {
    await explorerReveal.reveal(root, name);
  };
  actions.integrations = {
    graph: (root) => graph.open(async () => root),
    revealInExplorer,
    showInSourceControl: (root) => sourceControl.show(root),
  };

  context.subscriptions.push(
    git,
    viewState,
    { dispose: () => store.dispose() },
    registry,
    actions,
    dashboard,
    statusBar,
    gitGraph,
    repositoryRoots,
    legacyOpener,
    providers,
    mr,
    git.onDidChange(() => reg.attach(git.current)),
    vscode.window.registerWebviewPanelSerializer(DASHBOARD_VIEW_TYPE, panel),
    vscode.commands.registerCommand('repohangar.open', () => panel.open()),
    vscode.commands.registerCommand('repohangar.scm.openDashboard', () => vscode.commands.executeCommand('repohangar.open')),
    vscode.commands.registerCommand('repohangar.scm.fetch', (arg?: unknown) => vscode.commands.executeCommand('repohangar.fetch', arg)),
    vscode.commands.registerCommand('repohangar.refresh', async () => {
      await Promise.all([reg.refreshAll(), repositoryRoots.rescan(), providers.refresh()]);
    }),
    vscode.commands.registerCommand('repohangar.openInGitGraph', (arg?: unknown) => graph.open(() => target(arg))),
    vscode.commands.registerCommand('repohangar.openInSourceControlGraph', async (arg?: unknown) => {
      const path = await target(arg);
      if (path !== undefined) await graph.openSourceControlGraph(path);
    }),
    vscode.commands.registerCommand('repohangar.revealInExplorer', async (arg?: unknown) => {
      const root = await targetRoot(arg);
      if (root !== undefined) await revealInExplorer(root);
    }),
    vscode.commands.registerCommand('repohangar.scm.revealInExplorer', (arg?: unknown) =>
      vscode.commands.executeCommand('repohangar.revealInExplorer', arg),
    ),
    vscode.commands.registerCommand('repohangar.showInSourceControl', async (arg?: unknown) => {
      const root = await targetRoot(arg);
      if (root !== undefined) await sourceControl.show(root);
    }),
    vscode.commands.registerCommand('repohangar.showInDashboard', async (arg?: unknown) => {
      const id = await actions.resolveActive(arg);
      if (id !== undefined) await panel.reveal(id);
    }),
    vscode.commands.registerCommand('repohangar.mr.open', async (arg?: unknown) => {
      const id = await actions.resolveActive(arg);
      if (id !== undefined) await providers.openReview(id);
    }),
    vscode.commands.registerCommand('repohangar.mr.copyLink', async (arg?: unknown) => {
      const id = await actions.resolveActive(arg);
      if (id !== undefined) await providers.copyLink(id);
    }),
    vscode.commands.registerCommand('repohangar.signIn', () => providers.signInCommand()),
    vscode.commands.registerCommand('repohangar.signOut', () => providers.signOutCommand()),
    vscode.commands.registerCommand('repohangar.mr.create', onRepository((id) => mr.createWithDefaults(id))),
    vscode.commands.registerCommand('repohangar.mr.createEdit', onRepository((id) => mr.openDrawer(id))),
    // The Source Control and Explorer items: the same commands with the menu titles (mr-creation: Merge request menu items).
    ...(['scm', 'explorer'] as const).flatMap((menu) => [
      vscode.commands.registerCommand(`repohangar.${menu}.mr.create`, (arg?: unknown) => vscode.commands.executeCommand('repohangar.mr.create', arg)),
      vscode.commands.registerCommand(`repohangar.${menu}.mr.createEdit`, (arg?: unknown) => vscode.commands.executeCommand('repohangar.mr.createEdit', arg)),
      vscode.commands.registerCommand(`repohangar.${menu}.mr.open`, (arg?: unknown) => vscode.commands.executeCommand('repohangar.mr.open', arg)),
    ]),
    vscode.commands.registerCommand('repohangar.explorer.fetch', (arg?: unknown) => vscode.commands.executeCommand('repohangar.fetch', arg)),
    vscode.commands.registerCommand('repohangar.explorer.pullFf', (arg?: unknown) => vscode.commands.executeCommand('repohangar.pullFf', arg)),
  );

  // Off the startup path (design D-3).
  repositoryRoots.schedule(0);

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
    log,
    logUri: context.logUri,
    commands,
    notifier,
    gitGraph,
    graph,
    sourceControl,
    repositoryRoots,
    legacyOpener,
    migration: { writes: migrated, run: () => migrateSettings(context.globalState, log), state: context.globalState },
    providers,
    mr,
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
