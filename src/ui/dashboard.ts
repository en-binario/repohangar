// The dashboard webview panel: one per window, pinned, restored after a reload, with a strict CSP and validated
// messages (dashboard capability, design D-4 and D-10).

import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { GitApiAccess } from '../git/api';
import type { Registry } from '../git/registry';
import { dashboardState } from '../shared/format';
import { parseViewMessage, type HostMessage, type Snapshot, type ViewMessage } from '../shared/protocol';
import type { RowStore } from '../state/store';
import type { Actions } from './actions';
import type { ViewState } from './viewState';

export const DASHBOARD_VIEW_TYPE = 'repohangar.dashboard';

export interface FirstPaint {
  ms: number;
  rows: number;
}

export class DashboardController implements vscode.Disposable, vscode.WebviewPanelSerializer {
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

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: RowStore,
    private readonly registry: Registry,
    private readonly git: GitApiAccess,
    private readonly viewState: ViewState,
    private readonly actions: Pick<Actions, 'runRowAction' | 'runBatch'>,
  ) {
    this.disposables.push(
      this.firstPaintEmitter,
      store.onBatch((batch) => this.post({ type: 'patch', upserts: batch.upserts, removals: batch.removals })),
      git.onDidChange(() => this.postSnapshot()),
      registry.onDidChangeRepositories(() => this.postSnapshotIfStateChanged()),
      viewState.onDidChangeGrouping(() => this.postSnapshot()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('repohangar.staleFetchHours')) this.postSnapshot();
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

  async deserializeWebviewPanel(panel: vscode.WebviewPanel): Promise<void> {
    this.restored = true;
    this.openedAt = Date.now();
    panel.webview.options = this.webviewOptions();
    this.setup(panel);
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
      }),
    ];
    pin();
  }

  private async handle(message: ViewMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.ready = true;
        this.postSnapshot();
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
        if (details) this.post({ type: 'details', id: message.id, details });
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
        await this.actions.runBatch(message.action, message.ids);
        return;
      case 'setSelection':
        this.selection = message.ids;
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
    };
  }

  postSnapshot(): void {
    this.post(this.snapshot());
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
