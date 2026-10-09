// The notifications of a batch: its progress and its summary (batch-operations: Job pool, Batch results). Pure; no
// vscode import.

import { batchTitle } from '../shared/batch';
import type { BatchAction, JobResult } from '../shared/model';

export interface BatchSummary {
  severity: 'information' | 'warning';
  text: string;
  /** The notification offers `Show Git Output` */
  showOutput: boolean;
}

export function progressText(action: BatchAction, done: number, total: number): string {
  return `${batchTitle(action)}: ${done}/${total}`;
}

/** Whether a Pull (ff) result counts as up to date rather than updated. */
function upToDate(result: JobResult): boolean {
  return result.state === 'ok' && result.detail === 'up to date';
}

export function batchSummary(action: BatchAction, elapsedMs: number, results: readonly JobResult[]): BatchSummary {
  const count = (state: JobResult['state']) => results.filter((r) => r.state === state).length;
  const ok = results.filter((r) => r.state === 'ok' && !(action === 'pullFf' && upToDate(r))).length;
  const skipped = count('skipped');
  const failed = count('failed');
  // The first count is always shown; the others only when not 0.
  const parts = [action === 'fetch' ? `✓ ${ok} fetched` : `✓ ${ok} updated`];
  if (action === 'pullFf') {
    const level = results.filter(upToDate).length;
    if (level > 0) parts.push(`= ${level} up to date`);
  }
  if (skipped > 0) parts.push(`↷ ${skipped} skipped`);
  if (failed > 0) parts.push(`✗ ${failed} failed`);
  return {
    severity: failed > 0 ? 'warning' : 'information',
    text: `${batchTitle(action)} — finished in ${(elapsedMs / 1000).toFixed(1)} s: ${parts.join(' · ')}`,
    showOutput: failed > 0,
  };
}

export function recentlyFetchedText(seconds: number): string {
  return `These repositories were fetched ${seconds} s ago.`;
}
