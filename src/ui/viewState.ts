// Dashboard view state kept per workspace (design D-5): the Group menu choice and the collapsed groups.
// The Group menu never writes `repohangar.groupBy`.

import * as vscode from 'vscode';
import type { GroupingMode } from '../shared/model';
import { GROUPING_MODES } from '../shared/protocol';

const GROUP_BY_KEY = 'repohangar.view.groupBy';
const COLLAPSED_KEY = 'repohangar.view.collapsedGroups';

export function settingGrouping(): GroupingMode {
  const value = vscode.workspace.getConfiguration('repohangar').get<string>('groupBy', 'parentFolder');
  return (GROUPING_MODES as readonly string[]).includes(value) ? (value as GroupingMode) : 'parentFolder';
}

export class ViewState implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  /** Fires when the effective grouping mode changes. */
  readonly onDidChangeGrouping = this.changeEmitter.event;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly memento: vscode.Memento) {
    this.subscription = vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('repohangar.groupBy')) return;
      // A change of the setting replaces the remembered Group menu choice.
      void this.memento.update(GROUP_BY_KEY, undefined).then(() => this.changeEmitter.fire());
    });
  }

  /** The Group menu choice remembered for this workspace, if any. */
  get groupingChoice(): GroupingMode | undefined {
    return this.memento.get<GroupingMode>(GROUP_BY_KEY);
  }

  get grouping(): GroupingMode {
    return this.groupingChoice ?? settingGrouping();
  }

  async chooseGrouping(mode: GroupingMode): Promise<void> {
    await this.memento.update(GROUP_BY_KEY, mode);
    this.changeEmitter.fire();
  }

  get collapsed(): string[] {
    return this.memento.get<string[]>(COLLAPSED_KEY, []);
  }

  async toggleGroup(group: string): Promise<string[]> {
    const set = new Set(this.collapsed);
    if (set.has(group)) set.delete(group);
    else set.add(group);
    const next = [...set].sort();
    await this.memento.update(COLLAPSED_KEY, next);
    return next;
  }

  dispose(): void {
    this.subscription.dispose();
    this.changeEmitter.dispose();
  }
}
