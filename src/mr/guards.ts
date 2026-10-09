// The checks before a merge request is created, and the GitLab path without a token (mr-creation: Create guards,
// GitLab without a token, Push before create; design D-1). No vscode import.

import { plural } from '../shared/format';
import type { Head, Operation, Provider } from '../shared/model';

export type UsePushOptions = 'whenNoToken' | 'always' | 'never';

export interface GuardState {
  repo: string;
  operation: Operation | null;
  head: Head;
  provider: Provider | null;
  host: string;
  credential: boolean;
  usePushOptions: UsePushOptions;
  /** The rendered target branch */
  target: string;
  /** Commits of HEAD that `refs/remotes/<remote>/<target>` does not have */
  aheadOfTarget: number;
  /** Files with conflicts, unstaged, staged or untracked changes */
  dirtyFiles: number;
}

export type GuardButton = 'Sign In…' | 'Create Branch…' | 'Pull' | 'Open Source Control';

export type GuardResult =
  | { kind: 'stop'; text: string; button?: GuardButton }
  | { kind: 'create'; path: 'api' | 'pushOptions'; warning?: { text: string; button: GuardButton } };

const OPERATIONS: Record<Operation['kind'], string> = { rebase: 'rebase', merge: 'merge', 'cherry-pick': 'cherry-pick', revert: 'revert' };

/** The guards in row order (Guard matrix R1–R10, GitLab path matrix R1–R6). */
export function checkGuards(s: GuardState): GuardResult {
  const pre = preGuards(s);
  return pre.kind === 'stop' ? pre : postGuards(s, pre.path);
}

export type PathResult = { kind: 'stop'; text: string; button?: GuardButton } | { kind: 'path'; path: 'api' | 'pushOptions' };

/** R1–R5 and the GitLab path: the checks that need no target. */
export function preGuards(s: Pick<GuardState, 'repo' | 'operation' | 'head' | 'provider' | 'host' | 'credential' | 'usePushOptions'>): PathResult {
  if (s.operation) return { kind: 'stop', text: `Finish the ${OPERATIONS[s.operation.kind]} in ${s.repo} first.` };
  if (s.head.kind !== 'branch') return { kind: 'stop', text: `${s.repo} is not on a branch.` };
  if (s.provider !== 'gitlab' && s.provider !== 'github') return { kind: 'stop', text: `${s.repo} is not on a known GitLab or GitHub host.` };
  let path: 'api' | 'pushOptions' = 'api';
  if (s.provider === 'github') {
    if (!s.credential) return { kind: 'stop', text: `Sign in to ${s.host} to create pull requests.`, button: 'Sign In…' };
  } else if (!s.credential) {
    if (s.usePushOptions === 'never') return { kind: 'stop', text: `Sign in to ${s.host} to create merge requests.`, button: 'Sign In…' };
    path = 'pushOptions';
  } else if (s.usePushOptions === 'always') {
    path = 'pushOptions';
  }
  return { kind: 'path', path };
}

/** R6–R10 and GitLab path R6, once the target is known. */
export function postGuards(s: GuardState, path: 'api' | 'pushOptions'): GuardResult {
  if (s.head.kind !== 'branch') return { kind: 'stop', text: `${s.repo} is not on a branch.` };
  const branch = s.head.name;
  if (branch === s.target) return { kind: 'stop', text: `You're on ${s.target}. Create a branch for your changes first.`, button: 'Create Branch…' };
  if (s.aheadOfTarget < 1) return { kind: 'stop', text: `Nothing to merge into ${s.target} from ${branch}.` };
  const behind = s.head.upstream ? (s.head.behind ?? 0) : 0;
  if (behind > 0) {
    return { kind: 'stop', text: `The remote branch of ${s.repo} has ${plural(behind, 'commit', 'commits')} you don't have.`, button: 'Pull' };
  }
  if (path === 'pushOptions' && s.head.upstream && (s.head.ahead ?? 0) === 0) {
    return {
      kind: 'stop',
      text: `${branch} is already pushed, so GitLab cannot create the merge request during a push. Sign in to ${s.host} to create it.`,
      button: 'Sign In…',
    };
  }
  if (s.dirtyFiles > 0) {
    const files = s.dirtyFiles === 1 ? '1 uncommitted file is' : `${s.dirtyFiles} uncommitted files are`;
    return { kind: 'create', path, warning: { text: `${files} not in the merge request.`, button: 'Open Source Control' } };
  }
  return { kind: 'create', path };
}

export type PushPlan =
  | { kind: 'none' }
  | { kind: 'publish'; commits: number }
  | { kind: 'push'; commits: number }
  | { kind: 'stop'; text: string; button: 'Push' };

/** Push before create (Push matrix): publish a branch without upstream, push one ahead of it, or stop. */
export function pushPlan(head: Extract<Head, { kind: 'branch' }>, aheadOfTarget: number, pushIfNeeded: boolean, remote: string): PushPlan {
  const needed = !head.upstream || (head.ahead ?? 0) > 0;
  if (!needed) return { kind: 'none' };
  if (!pushIfNeeded) {
    return { kind: 'stop', text: `${head.name} is not pushed to ${remote}. Push it, or set "pushIfNeeded": true in the MR profile.`, button: 'Push' };
  }
  return head.upstream ? { kind: 'push', commits: head.ahead ?? 0 } : { kind: 'publish', commits: aheadOfTarget };
}
