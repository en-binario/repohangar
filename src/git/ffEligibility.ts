// Pull (ff): which repositories are fast-forwarded after their fetch, and the result of each (batch-operations:
// Fast-forward eligibility, design D-5). Pure; no vscode import.

import { plural } from '../shared/format';
import type { Head, JobResult, Operation } from '../shared/model';

/** The fetch that Pull (ff) runs first: done, skipped because the repository has no remote, or failed. */
export type FetchOutcome = { state: 'ok' } | { state: 'skipped'; detail: string } | { state: 'failed'; detail: string };

/** The repository after the fetch. */
export interface FfState {
  operation: Operation | null;
  head: Head;
  /** Distinct paths with conflicts, unstaged, staged or untracked changes */
  dirtyFiles: number;
}

export type FfDecision = { merge: true; commits: number } | { merge: false; result: JobResult };

/** The number of distinct paths across the change lists of a repository. */
export function distinctPaths(...lists: readonly (readonly string[])[]): number {
  return new Set(lists.flat()).size;
}

/** The rules of the Pull (ff) eligibility matrix, applied in row order. */
export function ffDecision(fetch: FetchOutcome, state: FfState): FfDecision {
  const skip = (detail: string): FfDecision => ({ merge: false, result: { state: 'skipped', detail } });
  if (fetch.state === 'failed') return { merge: false, result: { state: 'failed', detail: `fetch failed: ${fetch.detail}` } };
  if (state.operation) return skip(`${state.operation.kind} in progress`);
  if (state.head.kind === 'detached') return skip('detached HEAD');
  if (state.dirtyFiles > 0) return skip(`dirty (${plural(state.dirtyFiles, 'file', 'files')})`);
  const { upstream, ahead = 0, behind = 0 } = state.head;
  if (!upstream) return skip('no upstream');
  if (ahead > 0 && behind > 0) return skip(`diverged (↑${ahead} ↓${behind})`);
  if (behind === 0) return { merge: false, result: { state: 'ok', detail: 'up to date' } };
  return { merge: true, commits: behind };
}

/** The result of `git merge --ff-only @{u}`: its error output when it failed, else the commits it fast-forwarded. */
export function ffMergeResult(commits: number, error?: string): JobResult {
  if (error !== undefined) {
    const line = error.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? 'git merge --ff-only failed';
    return { state: 'failed', detail: line };
  }
  return { state: 'ok', detail: `fast-forwarded ${plural(commits, 'commit', 'commits')}` };
}
