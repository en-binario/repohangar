// Which repositories a batch covers, and the toolbar labels (batch-operations: Batch targets). Shared by the extension
// host and the webview; no vscode import.

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
  if (action === 'fetch') return selectedCount > 0 ? `⟳ Fetch (${selectedCount})` : '⟳ Fetch all';
  return selectedCount > 0 ? `⇣ Pull (ff) (${selectedCount})` : '⇣ Pull all (ff)';
}

/** The name of a batch in its progress and summary notifications. */
export function batchTitle(action: BatchAction): string {
  return action === 'fetch' ? 'Fetch all' : 'Pull all (ff)';
}
