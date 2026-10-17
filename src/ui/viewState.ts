// Dashboard view state kept per workspace (design D-5): the Group menu choice, the collapsed groups and the sort
// (add-group-selection-and-sorting design D-2). The Group menu and the sort never write a setting.

import * as vscode from 'vscode';
import type { GroupingMode } from '../shared/model';
import { GROUPING_MODES } from '../shared/protocol';
import { DEFAULT_SORT, isSort, type Sort } from '../shared/sort';

const GROUP_BY_KEY = 'repohangar.view.groupBy';
const COLLAPSED_KEY = 'repohangar.view.collapsedGroups';
const SORT_KEY = 'repohangar.view.sort';

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

  /** The sort chosen for this workspace; an absent or invalid value reads as the default. */
  get sort(): Sort {
    const value = this.memento.get<unknown>(SORT_KEY);
    return isSort(value) ? { column: value.column, direction: value.direction } : DEFAULT_SORT;
  }

  async chooseSort(sort: Sort): Promise<void> {
    await this.memento.update(SORT_KEY, { column: sort.column, direction: sort.direction });
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
