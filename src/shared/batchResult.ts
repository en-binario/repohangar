// The batch result panel (batch-operations: Batch result panel, Fix buttons, Retry failed; design D-6): its counts,
// lines and fix buttons. Shared by the extension host and the webview; no vscode import.

import { batchTitle } from './batch';
import { compareNames } from './format';
import type { BatchAction, JobResult } from './model';

/** The fix buttons of a result line, a closed set the host validates (design D-6). */
export type FixId = 'stashAndPull' | 'pullRebase' | 'publish' | 'openScm' | 'showGitOutput' | 'stashAndSwitch' | 'createBranchHere';

export const FIX_IDS: readonly FixId[] = ['stashAndPull', 'pullRebase', 'publish', 'openScm', 'showGitOutput', 'stashAndSwitch', 'createBranchHere'];

export const FIX_LABELS: Record<FixId, string> = {
  stashAndPull: 'Stash and pull',
  pullRebase: 'Pull with rebase',
  publish: 'Publish',
  openScm: 'Open SCM',
  showGitOutput: 'Show Git Output',
  stashAndSwitch: 'Stash and switch',
  createBranchHere: 'Create branch here',
};

export interface ResultLine {
  id: string;
  /** The repository name */
  name: string;
  state: JobResult['state'];
  /** `✗ infra-charts  fetch failed: Permission denied (publickey)` */
  text: string;
  fixes: FixId[];
  /** A fix button or Retry failed runs on this repository */
  running?: boolean;
}

export interface BatchPanel {
  kind: BatchAction;
  /** `Pull all (ff) — finished in 6.2 s` */
  title: string;
  /** The counts of the summary: `✓ 1 updated · ↷ 1 skipped · ✗ 1 failed` */
  counts: string;
  lines: ResultLine[];
  /** At least one line is `failed` */
  canRetry: boolean;
}

/** Whether a Pull (ff) result counts as up to date rather than updated. */
function upToDate(result: JobResult): boolean {
  return result.state === 'ok' && result.detail === 'up to date';
}

const OK_COUNTS: Record<BatchAction, string> = { fetch: 'fetched', pullFf: 'updated', switch: 'switched', createBranch: 'created' };

/** The counts of a batch, leaving out every count of 0 except the first (batch-operations: Batch results). */
export function batchCounts(action: BatchAction, results: readonly JobResult[]): string {
  const ok = results.filter((r) => r.state === 'ok' && !(action === 'pullFf' && upToDate(r))).length;
  const skipped = results.filter((r) => r.state === 'skipped').length;
  const failed = results.filter((r) => r.state === 'failed').length;
  const parts = [`✓ ${ok} ${OK_COUNTS[action]}`];
  if (action === 'pullFf') {
    const level = results.filter(upToDate).length;
    if (level > 0) parts.push(`= ${level} up to date`);
  }
  if (skipped > 0) parts.push(`↷ ${skipped} skipped`);
  if (failed > 0) parts.push(`✗ ${failed} failed`);
  return parts.join(' · ');
}

export function finishedTitle(action: BatchAction, branch: string | undefined, elapsedMs: number): string {
  return `${batchTitle(action, branch)} — finished in ${(elapsedMs / 1000).toFixed(1)} s`;
}

const ICONS: Record<JobResult['state'], string> = { ok: '✓', skipped: '↷', failed: '✗' };

/** The detail of a line: the result's detail, or what a plain `ok` did in this batch. */
function lineDetail(action: BatchAction, result: JobResult, branch: string | undefined): string {
  if (result.detail !== undefined) return result.detail;
  if (result.state !== 'ok') return result.state;
  switch (action) {
    case 'fetch':
      return 'fetched';
    case 'pullFf':
      return 'updated';
    case 'switch':
      return `switched to ${branch ?? ''}`;
    case 'createBranch':
      return 'created';
  }
}

/** The rules of the Fix button matrix; the first button is the one the matrix describes. */
export function fixButtons(action: BatchAction, result: JobResult, branch: string | undefined): FixId[] {
  const detail = result.detail ?? '';
  if (result.state === 'ok') return [];
  if (result.state === 'failed') return action === 'fetch' || action === 'pullFf' ? ['showGitOutput'] : [];
  if (detail.endsWith(' in progress') && action !== 'fetch') return ['openScm'];
  if (action === 'pullFf') {
    if (detail.startsWith('dirty (')) return ['stashAndPull'];
    if (detail.startsWith('diverged (')) return ['pullRebase', 'openScm'];
    if (detail === 'no upstream') return ['publish'];
  }
  if (action === 'switch') {
    if (detail.startsWith('dirty (')) return ['stashAndSwitch'];
    if (branch !== undefined && detail === `no branch ${branch}`) return ['createBranchHere'];
  }
  return [];
}

export function resultLine(action: BatchAction, branch: string | undefined, id: string, name: string, result: JobResult): ResultLine {
  return {
    id,
    name,
    state: result.state,
    text: `${ICONS[result.state]} ${name}  ${lineDetail(action, result, branch)}`,
    fixes: fixButtons(action, result, branch),
  };
}

const ORDER: Record<JobResult['state'], number> = { failed: 0, skipped: 1, ok: 2 };

/** Failed, skipped, then ok, each by repository name. */
export function orderLines(lines: readonly ResultLine[]): ResultLine[] {
  return [...lines].sort((a, b) => ORDER[a.state] - ORDER[b.state] || compareNames(a.name, b.name));
}

/** Whether a batch ends with a result panel: at least one `skipped` or `failed` result. */
export function needsPanel(results: readonly JobResult[]): boolean {
  return results.some((r) => r.state !== 'ok');
}
