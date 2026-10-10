// The dashboard webview panel: one per window, pinned, restored after a reload, with a strict CSP and validated
// messages (dashboard capability, design D-4 and D-10).

import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { GitApiAccess } from '../git/api';
import type { Registry } from '../git/registry';
import { dashboardState } from '../shared/format';
import type { GraphVariant, NameClick } from '../shared/graph';
import type { BatchPanel } from '../shared/batchResult';
import type { SaveTarget } from '../mr/saveDefaults';
import type { DrawerData, DrawerEdits } from '../shared/drawer';
import type { FirstRunPanel } from '../shared/model';
import { parseViewMessage, type HostMessage, type Snapshot, type ViewMessage } from '../shared/protocol';
import type { LineUpdate } from '../jobs/results';
import type { RowStore } from '../state/store';
import type { Actions, ResultView } from './actions';
import type { ViewState } from './viewState';

export const DASHBOARD_VIEW_TYPE = 'repohangar.dashboard';

/** The longest the first-run decision waits for every listed repository's row. */
export const FIRST_RUN_WAIT_MS = 2_000;

/** What the dashboard asks of the provider layer (hosting-providers, provider-auth). */
export interface DashboardProviders {
  firstRun(): FirstRunPanel | undefined;
  /** The first-run panel was dismissed once, in any window */
  firstRunDismissed(): boolean;
  readonly onDidChangeFirstRun: vscode.Event<void>;
  compareTarget(id: string): Promise<string | null>;
  signIn(host: string): Promise<unknown>;
  chooseProvider(host: string): Promise<void>;
  skipHost(host: string): Promise<void>;
  firstRunDone(): Promise<void>;
}

/** What the dashboard asks of merge request creation (mr-creation: Create MR drawer). */
export interface DashboardDrawer {
  drawerChange(id: string, profile: string, edits: DrawerEdits): Promise<void>;
  drawerCreate(id: string, profile: string, edits: DrawerEdits): Promise<void>;
  drawerClose(): void;
  drawerSearchUsers(id: string, text: string): void;
  drawerSaveDefaults(id: string, profile: string, edits: DrawerEdits, target: SaveTarget): Promise<void>;
}

export interface FirstPaint {
  ms: number;
  rows: number;
}

function nameClickSetting(): NameClick {
  const value = vscode.workspace.getConfiguration('repohangar').get<string>('dashboard.nameClick', 'explorer');
  return value === 'gitGraph' || value === 'sourceControl' ? value : 'explorer';
}

export class DashboardController implements vscode.Disposable, vscode.WebviewPanelSerializer, ResultView {
  private panel: vscode.WebviewPanel | undefined;
  private panelDisposables: vscode.Disposable[] = [];
  private readonly disposables: vscode.Disposable[] = [];
  private ready = false;
  private openedAt = 0;
  private restored = false;
  private readonly firstPaintEmitter = new vscode.EventEmitter<FirstPaint>();
  /** Fires when the webview reports its first rendered frame with rows, timed from the open request. */
  readonly onDidFirstPaint = this.firstPaintEmitter.event;
  /** Every message posted to the webview while `recordMessages` is true (integration tests). */
  readonly postedMessages: HostMessage[] = [];
  recordMessages = false;
  /** The rows selected in the dashboard, as the webview last reported them; empty while it is closed. */
  selection: readonly string[] = [];
  /** The focused row, as the webview last reported it; undefined while it is closed. */
  focused: string | undefined;
  /** The row Show in RepoHangar moves the focus to once the webview is ready */
  private pendingReveal: string | undefined;
  /** The drawer posted once the webview is ready */
  private pendingDrawer: DrawerData | null | undefined;
  /** Set after construction by merge request creation. */
  drawer: DashboardDrawer | undefined;
  /** The result panel is shown, so a webview that loads again shows it too */
  private batchResultShown = false;
  /** A change of the result panel waits for the webview to be ready */
  private pendingBatchResult = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: RowStore,
    private readonly registry: Registry,
    private readonly git: GitApiAccess,
    private readonly viewState: ViewState,
    private readonly actions: Pick<
      Actions,
      | 'runRowAction'
      | 'runBatch'
      | 'switchBranchIn'
      | 'createBranchIn'
      | 'createMrsIn'
      | 'fix'
      | 'retryFailed'
      | 'copyAllLinks'
      | 'closeBatchResult'
      | 'batchPanel'
    >,
    private readonly graph: { readonly variant: GraphVariant; readonly onDidChange: vscode.Event<void> },
    private readonly providers?: DashboardProviders,
  ) {
    this.disposables.push(
      this.firstPaintEmitter,
      store.onBatch((batch) => this.post({ type: 'patch', upserts: batch.upserts, removals: batch.removals })),
      git.onDidChange(() => this.postSnapshot()),
      registry.onDidChangeRepositories(() => this.postSnapshotIfStateChanged()),
      viewState.onDidChangeGrouping(() => this.postSnapshot()),
      graph.onDidChange(() => this.postSnapshot()),
      ...(providers ? [providers.onDidChangeFirstRun(() => this.postSnapshotIfFirstRunChanged())] : []),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration('repohangar.staleFetchHours') ||
          e.affectsConfiguration('repohangar.gitGraph.whenMissing') ||
          e.affectsConfiguration('repohangar.dashboard.nameClick')
        ) {
          this.postSnapshot();
        }
      }),
    );
  }

  /** True when a dashboard panel exists or was restored, including a background tab not yet revived. */
  get exists(): boolean {
    if (this.panel || this.restored) return true;
    return vscode.window.tabGroups.all.some((group) =>
      group.tabs.some((tab) => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith(DASHBOARD_VIEW_TYPE)),
    );
  }

  get current(): vscode.WebviewPanel | undefined {
    return this.panel;
  }

  /** Opens the dashboard, or reveals the existing panel. */
  open(options: { preserveFocus?: boolean } = {}): void {
    const preserveFocus = options.preserveFocus ?? false;
    // A panel opened in the active group becomes its active tab even with preserveFocus, so the editor that had
    // focus is shown again and the dashboard waits in a background tab.
    const previous = preserveFocus && !this.panel ? vscode.window.activeTextEditor : undefined;
    if (previous) {
      this.openPanel(true);
      void vscode.window.showTextDocument(previous.document, { viewColumn: previous.viewColumn, preserveFocus: false, preview: false });
      return;
    }
    this.openPanel(preserveFocus);
  }

  private openPanel(preserveFocus: boolean): void {
    this.openedAt = Date.now();
    if (this.panel) {
      this.panel.reveal(undefined, preserveFocus);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      DASHBOARD_VIEW_TYPE,
      'RepoHangar',
      { viewColumn: vscode.window.tabGroups.activeTabGroup.viewColumn ?? vscode.ViewColumn.One, preserveFocus },
      this.webviewOptions(),
    );
    this.setup(panel);
  }

  /**
   * Show in RepoHangar (explorer-open-in-git-graph): opens the dashboard if needed, expands the row's group and moves
   * the focus to the row; the webview clears the filter and chips when they hide it.
   */
  async reveal(id: string): Promise<void> {
    const group = this.store.get(id)?.group;
    if (group && this.viewState.collapsed.includes(group)) await this.viewState.toggleGroup(group);
    this.pendingReveal = id;
    this.open();
    if (this.ready) {
      this.postSnapshot();
      this.flushReveal();
    }
  }

  /** Opens or closes the Create MR drawer; posted when the webview is ready. */
  showDrawer(data: DrawerData | null): void {
    this.pendingDrawer = data;
    if (this.ready) this.flushDrawer();
  }

  private flushDrawer(): void {
    if (this.pendingDrawer === undefined) return;
    const data = this.pendingDrawer;
    this.pendingDrawer = undefined;
    this.post({ type: 'drawer', data });
  }

  /** Shows the batch result panel above the grid, or closes it; `open` opens the dashboard first (Show Details). */
  showBatchResult(panel: BatchPanel | null, open = false): void {
    this.batchResultShown = panel !== null;
    if (open) this.open();
    if (this.ready) this.post({ type: 'batchResult', panel });
    else this.pendingBatchResult = true;
  }

  updateBatchResultLine(update: LineUpdate): void {
    if (this.batchResultShown) this.post({ type: 'batchResultLine', ...update });
  }

  /** The panel again for a webview that loaded again (it is not retained while hidden), or after Show Details. */
  private flushBatchResult(): void {
    if (!this.batchResultShown && !this.pendingBatchResult) return;
    this.pendingBatchResult = false;
    const panel = this.batchResultShown ? (this.actions.batchPanel() ?? null) : null;
    this.post({ type: 'batchResult', panel });
  }

  postDrawerUsers(id: string, users: string[]): void {
    this.post({ type: 'drawerUsers', id, users });
  }

  private flushReveal(): void {
    const id = this.pendingReveal;
    if (id === undefined) return;
    this.pendingReveal = undefined;
    this.post({ type: 'reveal', id });
  }

  async deserializeWebviewPanel(panel: vscode.WebviewPanel): Promise<void> {
    this.restored = true;
    this.openedAt = Date.now();
    panel.webview.options = this.webviewOptions();
    this.setup(panel);
    // A dashboard restored after a reload keeps its view (dashboard: Dashboard restored after a window reload); the
    // first-run panel waits for a dashboard the user opens.
    this.firstRunDecision = false;
  }

  private webviewOptions(): vscode.WebviewOptions & vscode.WebviewPanelOptions {
    return {
      enableScripts: true,
      retainContextWhenHidden: false,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    };
  }

  private setup(panel: vscode.WebviewPanel): void {
    this.panel = panel;
    this.ready = false;
    panel.webview.html = this.html(panel.webview);
    let pinned = false;
    const pin = () => {
      if (pinned || !panel.active) return;
      pinned = true;
      void vscode.commands.executeCommand('workbench.action.pinEditor');
    };
    this.panelDisposables = [
      panel.webview.onDidReceiveMessage((raw) => {
        const message = parseViewMessage(raw);
        if (message) void this.handle(message);
      }),
      panel.onDidChangeViewState(() => pin()),
      panel.onDidDispose(() => {
        for (const d of this.panelDisposables) d.dispose();
        this.panelDisposables = [];
        this.panel = undefined;
        this.ready = false;
        this.restored = false;
        this.selection = [];
        this.focused = undefined;
        this.batchResultShown = false;
        this.pendingBatchResult = false;
        this.firstRunDecision = undefined;
        this.firstRunWaited = false;
        if (this.firstRunTimer) clearTimeout(this.firstRunTimer);
        this.firstRunTimer = undefined;
      }),
    ];
    pin();
  }

  private async handle(message: ViewMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.ready = true;
        this.postSnapshot();
        this.flushReveal();
        this.flushDrawer();
        this.flushBatchResult();
        return;
      case 'firstPaint':
        this.firstPaintEmitter.fire({ ms: Date.now() - this.openedAt, rows: message.rows });
        return;
      case 'setGrouping':
        await this.viewState.chooseGrouping(message.mode);
        return;
      case 'toggleGroup':
        await this.viewState.toggleGroup(message.group);
        this.postSnapshot();
        return;
      case 'loadDetails': {
        const details = await this.registry.loadDetails(message.id);
        if (!details) return;
        const compareTarget = this.providers ? await this.providers.compareTarget(message.id) : undefined;
        this.post({ type: 'details', id: message.id, details: compareTarget === undefined ? details : { ...details, compareTarget } });
        return;
      }
      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', 'git.enabled');
        return;
      // The actions ignore ids that are not listed repositories.
      case 'runAction':
        await this.actions.runRowAction(message.id, message.action);
        return;
      case 'runBatch':
        await this.actions.runBatch(message.action, message.ids, { fromDashboard: true });
        return;
      case 'switchBranch':
        await this.actions.switchBranchIn(message.ids, { fromDashboard: true });
        return;
      case 'createBranch':
        await this.actions.createBranchIn(message.ids, { fromDashboard: true });
        return;
      case 'fix':
        await this.actions.fix(message.id, message.fix);
        return;
      case 'createMrs':
        await this.actions.createMrsIn(message.ids);
        return;
      case 'retryFailed':
        await this.actions.retryFailed();
        return;
      case 'copyAllLinks':
        await this.actions.copyAllLinks();
        return;
      case 'closeBatchResult':
        this.batchResultShown = false;
        this.actions.closeBatchResult();
        return;
      case 'setSelection':
        this.selection = message.ids;
        return;
      case 'setFocus':
        this.focused = message.id;
        return;
      case 'editProfiles':
        await vscode.commands.executeCommand('repohangar.profiles.edit');
        return;
      case 'signIn':
        await this.providers?.signIn(message.host);
        return;
      case 'chooseProvider':
        await this.providers?.chooseProvider(message.host);
        return;
      case 'skipHost':
        await this.providers?.skipHost(message.host);
        return;
      case 'firstRunDone':
        await this.providers?.firstRunDone();
        return;
      case 'drawerChange':
        await this.drawer?.drawerChange(message.id, message.profile, message.edits);
        return;
      case 'drawerCreate':
        await this.drawer?.drawerCreate(message.id, message.profile, message.edits);
        return;
      case 'drawerClose':
        this.drawer?.drawerClose();
        return;
      case 'drawerSearchUsers':
        this.drawer?.drawerSearchUsers(message.id, message.text);
        return;
      case 'drawerSaveDefaults':
        await this.drawer?.drawerSaveDefaults(message.id, message.profile, message.edits, message.target);
        return;
    }
  }

  private lastStateKind: string | undefined;

  private snapshot(): Snapshot {
    const state = dashboardState(this.git.enabled, this.git.state, this.registry.size);
    this.lastStateKind = state.kind;
    return {
      type: 'snapshot',
      state,
      rows: this.store.all(),
      grouping: this.viewState.grouping,
      collapsed: this.viewState.collapsed,
      staleFetchHours: vscode.workspace.getConfiguration('repohangar').get<number>('staleFetchHours', 1),
      platform: process.platform,
      graph: this.graph.variant,
      nameClick: nameClickSetting(),
      firstRun: state.kind === 'grid' ? this.firstRunPanel() : null,
      firstRunPending: state.kind === 'grid' && !!this.providers && this.firstRunDecision === undefined,
    };
  }

  postSnapshot(): void {
    const snapshot = this.snapshot();
    this.lastFirstRun = JSON.stringify([snapshot.firstRun, snapshot.firstRunPending]);
    this.post(snapshot);
  }

  private lastFirstRun = 'null';
  /**
   * Whether this panel shows the first-run hosts panel: decided once, as soon as every listed repository has its row
   * (until then the snapshot says `firstRunPending`); the decision holds for the life of the panel.
   */
  private firstRunDecision: boolean | undefined;
  private firstRunWaited = false;
  private firstRunTimer: ReturnType<typeof setTimeout> | undefined;

  private firstRunPanel(): FirstRunPanel | null {
    if (!this.providers) return null;
    if (this.firstRunDecision === undefined) {
      // Dismissed before: nothing to wait for. A GitLab or GitHub row already computed: the panel, at once.
      if (this.providers.firstRunDismissed()) this.firstRunDecision = false;
      else if (this.providers.firstRun()) this.firstRunDecision = true;
    }
    if (this.firstRunDecision === undefined) {
      if (this.store.all().length < this.registry.size && !this.firstRunWaited) {
        // A row that never computes must not keep the dashboard loading: decide after at most 2 s.
        this.firstRunTimer ??= setTimeout(() => {
          this.firstRunWaited = true;
          this.postSnapshot();
        }, FIRST_RUN_WAIT_MS);
        return null;
      }
      this.firstRunDecision = this.providers.firstRun() !== undefined;
    }
    return this.firstRunDecision ? (this.providers.firstRun() ?? null) : null;
  }


  private postSnapshotIfFirstRunChanged(): void {
    const grid = dashboardState(this.git.enabled, this.git.state, this.registry.size).kind === 'grid';
    const panel = grid ? this.firstRunPanel() : null;
    const pending = grid && !!this.providers && this.firstRunDecision === undefined;
    if (JSON.stringify([panel, pending]) !== this.lastFirstRun) this.postSnapshot();
  }

  private postSnapshotIfStateChanged(): void {
    const kind = dashboardState(this.git.enabled, this.git.state, this.registry.size).kind;
    if (kind !== this.lastStateKind) this.postSnapshot();
  }

  private post(message: HostMessage): void {
    if (!this.panel || !this.ready) return;
    if (this.recordMessages) this.postedMessages.push(message);
    void this.panel.webview.postMessage(message);
  }

  /** Handles a raw message as if the webview had sent it (integration tests). */
  receiveForTest(raw: unknown): Promise<void> {
    const message = parseViewMessage(raw);
    return message ? this.handle(message) : Promise.resolve();
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');
    const dist = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', file)).toString();
    const csp = [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `img-src ${webview.cspSource}`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${dist('codicons/codicon.css')}">
<link rel="stylesheet" href="${dist('webview.css')}">
<title>RepoHangar</title>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" src="${dist('webview.js')}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this.panel?.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
