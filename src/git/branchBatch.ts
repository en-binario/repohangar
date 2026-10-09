// Switch and create a branch across repositories: the branch suggestions of the switch quick pick and the plan of
// each repository's job (batch-operations: Branch suggestions, Switch branch in repositories, Create branch in
// repositories; design D-2). Pure; no vscode import.

import { plural } from '../shared/format';
import type { DirtyChoice, Head, JobResult, Operation } from '../shared/model';

export type { DirtyChoice } from '../shared/model';

/** What the branch rules read of one repository. */
export interface BranchSnapshot {
  operation: Operation | null;
  head: Head;
  /** The commit of HEAD; undefined when the branch has no commits */
  headCommit?: string;
  /** Distinct paths with conflicts, unstaged, staged or untracked changes */
  dirtyFiles: number;
  /** Local branch names */
  local: readonly string[];
  /** The chosen remote, or null when the repository has none */
  remote: string | null;
  /** Branch names of the chosen remote, without `<remote>/` and without `HEAD` */
  remoteBranches: readonly string[];
}

export interface BranchSuggestion {
  name: string;
  local: number;
  remote: number;
  missing: number;
  /** `local in 2 · remote in 1 (tracking branch will be created)` */
  detail: string;
}

/** A Git step of a branch job, run in this order. */
export type BranchStep =
  | { kind: 'stash'; message: string }
  | { kind: 'checkout'; branch: string }
  /** `repository.createBranch(branch, true, upstream)`, then `setBranchUpstream(branch, upstream)` */
  | { kind: 'track'; branch: string; upstream: string }
  /** `repository.createBranch(branch, true)` from the current HEAD */
  | { kind: 'create'; branch: string };

/** Skip with a result, or run the steps and record `done`. */
export type BranchPlan = { result: JobResult } | { steps: BranchStep[]; done: JobResult };

export function switchStashMessage(branch: string): string {
  return `RepoHangar: before switching to ${branch}`;
}

export const PULL_STASH_MESSAGE = 'RepoHangar: before pulling';

function skipped(detail: string): BranchPlan {
  return { result: { state: 'skipped', detail } };
}

function dirtyDetail(files: number): string {
  return `dirty (${plural(files, 'file', 'files')})`;
}

export function suggestionDetail(local: number, remote: number, missing: number): string {
  const parts: string[] = [];
  if (local > 0) parts.push(`local in ${local}`);
  if (remote > 0) parts.push(`remote in ${remote} (tracking branch will be created)`);
  if (missing > 0) parts.push(`missing in ${missing} (those repositories will be skipped)`);
  return parts.join(' · ');
}

/**
 * Every branch a target has locally or on its chosen remote, ordered by the number of targets that have it
 * (descending), then by name. A branch counts as local where it exists locally, else as remote.
 */
export function suggestBranches(snapshots: readonly Pick<BranchSnapshot, 'local' | 'remoteBranches'>[]): BranchSuggestion[] {
  const counts = new Map<string, { local: number; remote: number }>();
  for (const snapshot of snapshots) {
    const local = new Set(snapshot.local);
    const remote = snapshot.remoteBranches.filter((name) => name !== 'HEAD');
    for (const name of new Set([...snapshot.local, ...remote])) {
      const count = counts.get(name) ?? { local: 0, remote: 0 };
      if (local.has(name)) count.local++;
      else count.remote++;
      counts.set(name, count);
    }
  }
  return [...counts.entries()]
    .map(([name, { local, remote }]) => {
      const missing = snapshots.length - local - remote;
      return { name, local, remote, missing, detail: suggestionDetail(local, remote, missing) };
    })
    .sort((a, b) => b.local + b.remote - (a.local + a.remote) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** The item of the switch quick pick that creates the typed branch in every target. */
export function createItemLabel(name: string, targets: number): string {
  return `＋ Create "${name}" from current HEAD in all ${targets}`;
}

export function invalidNameMessage(name: string): string {
  return `"${name}" is not a valid branch name.`;
}

/**
 * The rules of `git check-ref-format --branch` that need no repository, for the create item of the switch quick pick,
 * which cannot start a process per keystroke (design D-4). The name is checked with Git again before it is used.
 */
export function plausibleBranchName(name: string): boolean {
  if (name.length === 0 || name === '@' || name.startsWith('-') || name.endsWith('/') || name.endsWith('.')) return false;
  if (name.includes('..') || name.includes('@{') || name.includes('//')) return false;
  // Control characters, space, ~ ^ : ? * [ \ and DEL.
  if (/[\x00-\x20~^:?*[\\\x7f]/.test(name)) return false;
  return name.split('/').every((part) => part.length > 0 && !part.startsWith('.') && !part.endsWith('.lock'));
}

/** The rules of the Switch eligibility matrix, applied in row order; R11 is Git refusing the checkout. */
export function switchPlan(snapshot: BranchSnapshot, branch: string, dirtyChoice: DirtyChoice): BranchPlan {
  if (snapshot.operation) return skipped(`${snapshot.operation.kind} in progress`);
  const local = snapshot.local.includes(branch);
  if (local && snapshot.head.kind === 'branch' && snapshot.head.name === branch) {
    return { result: { state: 'ok', detail: `already on ${branch}` } };
  }
  const remote = !local && snapshot.remote !== null && snapshot.remoteBranches.includes(branch);
  if (!local && !remote) return skipped(`no branch ${branch}`);
  const steps: BranchStep[] = [];
  let done: JobResult = { state: 'ok' };
  if (snapshot.dirtyFiles > 0) {
    if (dirtyChoice === 'skip') return skipped(dirtyDetail(snapshot.dirtyFiles));
    if (dirtyChoice === 'stash') {
      steps.push({ kind: 'stash', message: switchStashMessage(branch) });
      done = { state: 'ok', detail: `stashed ${plural(snapshot.dirtyFiles, 'file', 'files')}` };
    }
  }
  if (local) {
    steps.push({ kind: 'checkout', branch });
  } else {
    const upstream = `${snapshot.remote}/${branch}`;
    steps.push({ kind: 'track', branch, upstream });
    if (done.detail === undefined) done = { state: 'ok', detail: `tracking ${upstream} created` };
  }
  return { steps, done };
}

/** The rules of the Create eligibility matrix, applied in row order. */
export function createPlan(snapshot: Pick<BranchSnapshot, 'operation' | 'head' | 'headCommit' | 'local'>, name: string): BranchPlan {
  if (snapshot.operation) return skipped(`${snapshot.operation.kind} in progress`);
  if (snapshot.local.includes(name)) return skipped('branch exists');
  const commit = snapshot.head.kind === 'detached' ? snapshot.head.commit : (snapshot.headCommit ?? '');
  return {
    steps: [{ kind: 'create', branch: name }],
    done: { state: 'ok', detail: commit ? `created from ${commit.slice(0, 7)}` : 'created' },
  };
}
