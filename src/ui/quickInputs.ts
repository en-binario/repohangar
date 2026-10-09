// The quick picks and the input box of a branch batch (batch-operations: Branch suggestions, Uncommitted changes
// choice, Create branch in repositories; design D-5). The integration tests replace them.

import * as vscode from 'vscode';
import { createItemLabel, plausibleBranchName, type BranchSuggestion } from '../git/branchBatch';
import type { DirtyChoice } from '../shared/model';

export interface SwitchPickModel {
  /** `Switch branch in 3 repositories` */
  title: string;
  targets: number;
  suggestions: BranchSuggestion[];
}

export type SwitchPick = { kind: 'switch'; branch: string } | { kind: 'create'; branch: string } | undefined;

export interface SwitchItem {
  label: string;
  detail?: string;
  pick: NonNullable<SwitchPick>;
}

/**
 * The items of the switch quick pick for the typed text: `＋ Create "<text>" …` first when the text could be a branch
 * name that no target has, then every suggestion.
 */
export function switchItems(model: SwitchPickModel, typed: string): SwitchItem[] {
  const items: SwitchItem[] = model.suggestions.map((s) => ({ label: s.name, detail: s.detail, pick: { kind: 'switch', branch: s.name } }));
  const text = typed.trim();
  if (plausibleBranchName(text) && !model.suggestions.some((s) => s.name === text)) {
    items.unshift({ label: createItemLabel(text, model.targets), pick: { kind: 'create', branch: text } });
  }
  return items;
}

export interface DirtyPickModel {
  /** `1 of 3 repositories have uncommitted changes` */
  title: string;
}

export const DIRTY_ITEMS: readonly { label: string; choice: DirtyChoice }[] = [
  { label: 'Skip', choice: 'skip' },
  { label: 'Stash and switch', choice: 'stash' },
  { label: 'Switch anyway', choice: 'switchAnyway' },
];

export interface NameInputModel {
  /** `Create branch in 4 repositories` */
  title: string;
  /** Runs on Enter: the message that keeps the box open, or undefined to accept the name */
  validate(name: string): Promise<string | undefined>;
}

export interface BranchUi {
  pickBranch(model: SwitchPickModel): Promise<SwitchPick>;
  /** Undefined when dismissed with Esc */
  pickDirtyChoice(model: DirtyPickModel): Promise<DirtyChoice | undefined>;
  /** Undefined when dismissed with Esc */
  inputBranchName(model: NameInputModel): Promise<string | undefined>;
}

export const vscodeBranchUi: BranchUi = {
  pickBranch(model) {
    return new Promise((resolve) => {
      const qp = vscode.window.createQuickPick<vscode.QuickPickItem & { pick: NonNullable<SwitchPick> }>();
      qp.title = model.title;
      qp.placeholder = 'Select a branch, or type a new branch name';
      qp.matchOnDetail = false;
      const update = () => {
        qp.items = switchItems(model, qp.value).map((item) => ({ ...item, alwaysShow: item.pick.kind === 'create' }));
      };
      update();
      let done = false;
      qp.onDidChangeValue(update);
      qp.onDidAccept(() => {
        const item = qp.selectedItems[0] ?? qp.activeItems[0];
        if (!item) return;
        done = true;
        qp.hide();
        resolve(item.pick);
      });
      qp.onDidHide(() => {
        qp.dispose();
        if (!done) resolve(undefined);
      });
      qp.show();
    });
  },

  async pickDirtyChoice(model) {
    const chosen = await vscode.window.showQuickPick(
      DIRTY_ITEMS.map((item) => ({ ...item })),
      { title: model.title, placeHolder: 'What to do with the repositories that have uncommitted changes' },
    );
    return chosen?.choice;
  },

  inputBranchName(model) {
    return new Promise((resolve) => {
      const box = vscode.window.createInputBox();
      box.title = model.title;
      box.placeholder = 'Branch name, created from the current HEAD of each repository';
      let done = false;
      // Validated on Enter only: one git process per name, not per keystroke (design D-4).
      box.onDidChangeValue(() => (box.validationMessage = undefined));
      box.onDidAccept(async () => {
        const name = box.value.trim();
        if (!name) return;
        box.busy = true;
        const message = await model.validate(name);
        box.busy = false;
        if (message !== undefined) {
          box.validationMessage = message;
          return;
        }
        done = true;
        box.hide();
        resolve(name);
      });
      box.onDidHide(() => {
        box.dispose();
        if (!done) resolve(undefined);
      });
      box.show();
    });
  },
};
