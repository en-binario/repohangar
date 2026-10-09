// The guards of the network row actions (git-operations: Push and Publish guards, Pull guards, Fetch guard): run the
// action, or record a result and say why it did not run. Pure; no vscode import.

import { plural } from '../shared/format';
import type { JobResult, RowData } from '../shared/model';

export interface GuardNotice {
  text: string;
  /** The notification offers `Pull` for the repository */
  pull?: boolean;
}

export type GuardRow = Pick<RowData, 'name' | 'operation' | 'head' | 'remote'>;

export type PushDecision =
  | { run: 'push' }
  | { run: 'publish'; remote: string; branch: string }
  | { result: JobResult; notice?: GuardNotice };

export type PullDecision = { run: 'pull' } | { result: JobResult; notice: GuardNotice };

export type FetchDecision = { run: 'fetch' } | { result: JobResult };

function skipped(detail: string): JobResult {
  return { state: 'skipped', detail };
}

export function pushGuard(row: GuardRow): PushDecision {
  if (row.operation) {
    const kind = row.operation.kind;
    return { result: skipped(`${kind} in progress`), notice: { text: `Finish the ${kind} in ${row.name} first.` } };
  }
  if (row.head.kind === 'detached') {
    return {
      result: skipped('detached HEAD'),
      notice: { text: `${row.name} has a detached HEAD. Check out a branch to push.` },
    };
  }
  const { name, upstream, ahead, behind } = row.head;
  if (!upstream) {
    if (!row.remote) return { result: skipped('no remote'), notice: { text: `${row.name} has no remote to publish to.` } };
    return { run: 'publish', remote: row.remote.name, branch: name };
  }
  if (behind !== undefined && behind >= 1) {
    return {
      result: skipped(`behind (↓${behind})`),
      notice: { text: `The remote branch of ${row.name} has ${plural(behind, 'commit', 'commits')} you don't have.`, pull: true },
    };
  }
  // Unknown counts: let Git decide.
  if (ahead === 0) return { result: { state: 'ok', detail: 'nothing to push' } };
  return { run: 'push' };
}

export function pullGuard(row: GuardRow): PullDecision {
  const skip = (reason: string): PullDecision => ({
    result: skipped(reason),
    notice: { text: `Pull skipped in ${row.name}: ${reason}.` },
  });
  if (row.operation) return skip(`${row.operation.kind} in progress`);
  if (row.head.kind === 'detached') return skip('detached HEAD');
  if (!row.head.upstream) return skip('no upstream');
  return { run: 'pull' };
}

export function fetchGuard(row: Pick<RowData, 'remote'>): FetchDecision {
  return row.remote ? { run: 'fetch' } : { result: skipped('no remote') };
}
