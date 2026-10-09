// Raw row data shared by the extension host and the webview (design D-3). No vscode import.

export type Provider = 'gitlab' | 'github' | 'unknown';

export type GroupingMode = 'parentFolder' | 'workspaceFolder' | 'custom' | 'none';

export type Operation =
  | { kind: 'rebase'; step?: number; total?: number }
  | { kind: 'merge' }
  | { kind: 'cherry-pick' }
  | { kind: 'revert' };

export type Head =
  | { kind: 'branch'; name: string; upstream?: string; ahead?: number; behind?: number }
  | { kind: 'detached'; commit: string };

export interface ChangeCounts {
  conflicts: number;
  unstaged: number;
  staged: number;
  untracked: number;
}

export interface RowData {
  /** `rootUri.toString()` */
  id: string;
  name: string;
  /** Repository root, `Uri.fsPath` */
  path: string;
  /** Group name, or null when the grouping mode is `none` */
  group: string | null;
  /** null: no remote or a not-hosted remote */
  provider: Provider | null;
  /** The chosen remote, with credentials removed from its URL */
  remote: { name: string; displayUrl: string } | null;
  head: Head;
  operation: Operation | null;
  counts: ChangeCounts;
  stashes: number;
  /** Epoch ms of the newest FETCH_HEAD, or null when never fetched */
  lastFetch: number | null;
  /** The running or last finished job (git-operations design D-2) */
  job?: RowJob;
}

/** Actions that run as a job: one at a time per repository, shown in the Sync cell. */
export type JobAction = 'fetch' | 'pull' | 'pullFf' | 'push' | 'publish' | 'sync';

export interface JobResult {
  state: 'ok' | 'skipped' | 'failed';
  /** The reason of a skip, the message of a failure, or what an ok did (`up to date`) */
  detail?: string;
}

export interface RowJob {
  action: JobAction;
  state: 'running' | JobResult['state'];
  detail?: string;
}

/** Actions on one row, sent by the webview (git-operations design D-3). Push and Publish share `push`. */
export type RowAction =
  | 'fetch'
  | 'pull'
  | 'push'
  | 'sync'
  | 'switchBranch'
  | 'terminal'
  | 'stash'
  | 'stashPop'
  | 'discardAll'
  | 'revealInOS'
  | 'copyPath'
  | 'copyBranch'
  | 'graph'
  | 'revealInExplorer'
  | 'showInSourceControl';

export const ROW_ACTIONS: readonly RowAction[] = [
  'fetch',
  'pull',
  'push',
  'sync',
  'switchBranch',
  'terminal',
  'stash',
  'stashPop',
  'discardAll',
  'revealInOS',
  'copyPath',
  'copyBranch',
  'graph',
  'revealInExplorer',
  'showInSourceControl',
];

export type BatchAction = 'fetch' | 'pullFf';

export interface CommitDetails {
  hash: string;
  subject: string;
  author: string;
  /** Epoch ms */
  date: number;
}

/** Details of one row, loaded on demand (design D-9). `commit` is null when the branch has no commits. */
export interface RowDetails {
  commit: CommitDetails | null;
}

export type GitApiState = 'uninitialized' | 'initialized';

export type DashboardState =
  | { kind: 'gitDisabled' }
  | { kind: 'loading' }
  | { kind: 'noRepositories' }
  | { kind: 'grid' };

export type ChipId = 'dirty' | 'behind' | 'ahead' | 'noUpstream';
