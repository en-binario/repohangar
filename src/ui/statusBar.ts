// The status bar summary (status-bar capability).

import * as vscode from 'vscode';
import { statusBarModel } from '../shared/format';
import type { RowStore } from '../state/store';

export class StatusBar implements vscode.Disposable {
  readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly store: RowStore) {
    this.item = vscode.window.createStatusBarItem('repohangar.summary', vscode.StatusBarAlignment.Left, 100);
    this.item.name = 'RepoHangar';
    this.item.command = 'repohangar.open';
    this.disposables.push(
      this.item,
      store.onBatch(() => this.update()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('repohangar.statusBar.enabled')) this.update();
      }),
    );
    this.update();
  }

  update(): void {
    const enabled = vscode.workspace.getConfiguration('repohangar').get<boolean>('statusBar.enabled', true);
    const model = statusBarModel(this.store.all(), enabled);
    this.item.text = model.text;
    this.item.tooltip = model.tooltip;
    this.item.accessibilityInformation = { label: model.label, role: 'button' };
    this.shown = model.visible;
    if (model.visible) this.item.show();
    else this.item.hide();
  }

  /** Whether the item was last shown (true) or hidden (false). */
  shown = false;

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
