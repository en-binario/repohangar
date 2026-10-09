// The notifications of a batch: its progress and its summary (batch-operations: Job pool, Batch results). Pure; no
// vscode import.

import { batchTitle } from '../shared/batch';
import { batchCounts, finishedTitle, needsPanel } from '../shared/batchResult';
import type { BatchAction, JobResult } from '../shared/model';

export interface BatchSummary {
  severity: 'information' | 'warning';
  text: string;
  /** The notification offers `Show Git Output` */
  showOutput: boolean;
  /** The notification offers `Show Details`, which opens the result panel (batch-operations: Batch result panel) */
  showDetails: boolean;
}

export interface SummaryOptions {
  /** The branch of a Switch or Create */
  branch?: string;
  /** The batch was started from the dashboard, which shows the result panel itself */
  fromDashboard?: boolean;
}

export function progressText(action: BatchAction, done: number, total: number, branch?: string): string {
  return `${batchTitle(action, branch)}: ${done}/${total}`;
}

export function batchSummary(action: BatchAction, elapsedMs: number, results: readonly JobResult[], options: SummaryOptions = {}): BatchSummary {
  const failed = results.some((r) => r.state === 'failed');
  return {
    severity: failed ? 'warning' : 'information',
    text: `${finishedTitle(action, options.branch, elapsedMs)}: ${batchCounts(action, results)}`,
    showOutput: failed,
    showDetails: !options.fromDashboard && needsPanel(results),
  };
}

export function recentlyFetchedText(seconds: number): string {
  return `These repositories were fetched ${seconds} s ago.`;
}
