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
  /** The commit of HEAD, the cache key of the review state with the repository and branch */
  headSha?: string;
  /** The chosen remote's host, project path and web URL, when it is hosted (no credentials) */
  hosted?: HostedRemote;
  /** The target of the compare page from `refs/remotes/<remote>/HEAD` (`main`), or null when unknown */
  defaultBranch?: string | null;
  /** Commits of HEAD that `refs/remotes/<remote>/<defaultBranch>` lacks, for the [Create MR] button (mr-creation) */
  aheadOfDefault?: number;
  /** What the MR / PR cell shows (hosting-providers); set by the provider layer */
  review?: ReviewInfo;
}

export interface HostedRemote {
  host: string;
  projectPath: string;
  webUrl: string;
}

/**
 * The open merge request or pull request of a branch, with the provider's values as they came (hosting-providers
 * design D-2); `src/shared/review.ts` turns them into cell text.
 */
export interface ReviewState {
  provider: 'gitlab' | 'github';
  /** GitLab iid or GitHub number */
  number: number;
  url: string;
  title: string;
  draft: boolean;
  /** GitLab `headPipeline.status` or GitHub `statusCheckRollup.state`; null when there is none */
  pipeline: string | null;
  /** GitLab, null when the field is not in the selection */
  approvalsRequired?: number | null;
  approvalsLeft?: number | null;
  /** GitHub `reviewDecision` */
  reviewDecision?: string | null;
  /** GitLab `detailedMergeStatus` or GitHub `mergeable`; null when the field is not in the selection */
  mergeStatus: string | null;
  autoMerge: boolean;
  headSha: string;
  /** GitLab `description` or GitHub `body`, read only by the review check before creating (add-multi-repo-mrs D-2) */
  description?: string;
}

/** The state of a row's MR / PR cell (hosting-providers: Batched review status, Review state cache). */
export type ReviewInfo =
  /** No provider, or HEAD not on a branch: `—` */
  | { kind: 'none' }
  /** The provider stays `unknown` after the probe: `?` */
  | { kind: 'unknownHost'; host: string }
  /** No credential for the host: `Sign in` */
  | { kind: 'signIn'; host: string }
  /** The host is skipped: `—` with a tooltip */
  | { kind: 'skipped'; host: string }
  /** No stored state for the branch yet: `…` */
  | { kind: 'loading' }
  /** The project does not exist or cannot be read: `—` with a tooltip */
  | { kind: 'notFound'; host: string; projectPath: string }
  /** A loaded state: an open review, or null for none; `stale` marks it as not refreshed */
  | { kind: 'loaded'; provider: 'gitlab' | 'github'; review: ReviewState | null; stale: boolean; fetchedAt: number }
  /** A merge request GitLab reported during a push-options push, without a token to read it (mr-creation) */
  | { kind: 'pushed'; host: string; number: number; url: string };

/** Actions that run as a job: one at a time per repository, shown in the Sync cell. */
export type JobAction = 'fetch' | 'pull' | 'pullFf' | 'push' | 'publish' | 'sync' | 'createMr' | 'switch' | 'createBranch';

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
  | 'showInSourceControl'
  | 'openReview'
  | 'copyReviewLink'
  | 'openCompare'
  | 'openPipeline'
  | 'createMr'
  | 'createMrEdit';

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
  'openReview',
  'copyReviewLink',
  'openCompare',
  'openPipeline',
  'createMr',
  'createMrEdit',
];

export type BatchAction = 'fetch' | 'pullFf' | 'switch' | 'createBranch' | 'createMr';

/** What the user chose for the dirty targets of a switch (batch-operations: Uncommitted changes choice). */
export type DirtyChoice = 'skip' | 'stash' | 'switchAnyway';

/** The parameters of a batch, kept for Retry failed (batch-operations design D-1). */
export interface BatchParams {
  /** The branch of a Switch or Create */
  branch?: string;
  dirtyChoice?: DirtyChoice;
}

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
  /** The target of the compare page; null when it cannot be determined (hosting-providers: Compare page) */
  compareTarget?: string | null;
}

/** A button of a host line in the first-run hosts panel (provider-auth: First-run hosts panel). */
export type FirstRunButton = 'signInGitHub' | 'pasteToken' | 'skip';

/** The merge request defaults line after the hosts (mr-profiles: Defaults line in the first-run panel) */
export interface DefaultsLine {
  /** `Merge request defaults: none yet.` or `Merge request defaults: 2 profiles.` */
  text: string;
  button: 'setUpProfile' | 'editProfiles';
  /** `(you can also save them from the form)` */
  note?: string;
}

export interface FirstRunPanel {
  /** `Found 14 repositories: 9 on git.acme.com (GitLab) · 4 on github.com (GitHub) · 1 local only` */
  summary: string;
  hosts: { host: string; line: string; buttons: FirstRunButton[] }[];
  defaults?: DefaultsLine;
}

export type GitApiState = 'uninitialized' | 'initialized';

export type DashboardState =
  | { kind: 'gitDisabled' }
  | { kind: 'loading' }
  | { kind: 'noRepositories' }
  | { kind: 'grid' };

export type ChipId = 'dirty' | 'behind' | 'ahead' | 'hasReview' | 'pipelineFailed' | 'noUpstream';
