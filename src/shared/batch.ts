// Which repositories a batch covers, and the toolbar labels (batch-operations: Batch targets, Branch batch targets).
// Shared by the extension host and the webview; no vscode import.

import type { BatchAction } from './model';

/**
 * The triggers of a batch: the commands and toolbar buttons (`fetchAll`, `pullAllFf`, also the `F` key), the row keys
 * `f` and `p` while rows are selected, and `pullFf` for the active repository.
 */
export type BatchTrigger = 'fetchAll' | 'pullAllFf' | 'f' | 'p' | 'pullFf';

export interface BatchTargets {
  action: BatchAction;
  ids: string[];
}

/**
 * The repositories of a batch. `selected` are the rows selected in the dashboard (empty when it is closed), `listed`
 * every listed repository and `active` the repository resolved for `pullFf`. Selected ids that are no longer listed
 * are dropped.
 */
export function batchTargets(
  trigger: BatchTrigger,
  selected: readonly string[],
  listed: readonly string[],
  active?: string,
): BatchTargets {
  const action: BatchAction = trigger === 'fetchAll' || trigger === 'f' ? 'fetch' : 'pullFf';
  if (trigger === 'pullFf') return { action, ids: active === undefined ? [] : [active] };
  const known = new Set(listed);
  const chosen = selected.filter((id) => known.has(id));
  return { action, ids: chosen.length > 0 ? chosen : [...listed] };
}

export function toolbarLabel(action: BatchAction, selectedCount: number): string {
  const count = selectedCount > 0 ? ` (${selectedCount})` : '';
  switch (action) {
    case 'fetch':
      return selectedCount > 0 ? `⟳ Fetch${count}` : '⟳ Fetch all';
    case 'pullFf':
      return selectedCount > 0 ? `⇣ Pull (ff)${count}` : '⇣ Pull all (ff)';
    case 'switch':
      return `⎇ Switch…${count}`;
    case 'createBranch':
      return `＋ Branch…${count}`;
  }
}

/** The name of a batch in its progress and summary notifications and its result panel. */
export function batchTitle(action: BatchAction, branch = ''): string {
  switch (action) {
    case 'fetch':
      return 'Fetch all';
    case 'pullFf':
      return 'Pull all (ff)';
    case 'switch':
      return `Switch to ${branch}`;
    case 'createBranch':
      return `Create branch ${branch}`;
  }
}

/**
 * The triggers of a branch batch (batch-operations: Branch batch targets): the keys `b` and `n`, and the commands and
 * toolbar buttons `switchBranch` and `createBranch`.
 */
export type BranchTrigger = 'b' | 'n' | 'switchBranch' | 'createBranch';

export interface BranchTargets {
  action: 'switch' | 'createBranch';
  ids: string[];
}

/**
 * The repositories of a branch batch: the selected rows that are still listed, else the focused row for `n`, else
 * every listed repository. Undefined for `b` without a selection, which switches the focused row with VS Code's
 * branch picker (git-operations: Row action keys).
 */
export function branchTargets(
  trigger: BranchTrigger,
  selected: readonly string[],
  listed: readonly string[],
  focused?: string,
): BranchTargets | undefined {
  const action = trigger === 'b' || trigger === 'switchBranch' ? 'switch' : 'createBranch';
  const known = new Set(listed);
  const chosen = selected.filter((id) => known.has(id));
  if (chosen.length > 0) return { action, ids: chosen };
  if (trigger === 'b') return undefined;
  if (trigger === 'n') return { action, ids: focused !== undefined && known.has(focused) ? [focused] : [] };
  return { action, ids: [...listed] };
}
