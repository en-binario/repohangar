// The MR / PR cell, the review chips, the review lines of the row details, the compare page and Open MR
// (hosting-providers: MR / PR cell, Review lines in row details, Compare page, Open merge request). Shared by the
// extension host and the webview; no vscode import, no Node import.

import { ageText } from './format';
import type { ReviewInfo, ReviewState, RowData } from './model';

export interface Part {
  text: string;
  label: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Values

const GITLAB_PENDING = new Set(['PENDING', 'CREATED', 'WAITING_FOR_RESOURCE', 'PREPARING', 'SCHEDULED', 'WAITING_FOR_CALLBACK']);

/** The pipeline (GitLab) or checks (GitHub) value; null shows nothing. */
export function pipelineValue(provider: 'gitlab' | 'github', raw: string | null | undefined): Part | null {
  if (!raw) return null;
  const value = raw.toUpperCase();
  if (provider === 'gitlab') {
    if (value === 'SUCCESS') return { text: '✓ passed', label: 'Pipeline passed' };
    if (value === 'RUNNING') return { text: '⟳ running', label: 'Pipeline running' };
    if (GITLAB_PENDING.has(value)) return { text: '◷ pending', label: 'Pipeline pending' };
    if (value === 'MANUAL') return { text: '◷ manual', label: 'Pipeline waiting for a manual job' };
    if (value === 'FAILED') return { text: '✗ failed', label: 'Pipeline failed' };
    if (value === 'CANCELED' || value === 'CANCELING') return { text: '⊘ canceled', label: 'Pipeline canceled' };
    return null;
  }
  if (value === 'SUCCESS') return { text: '✓ passed', label: 'Checks passed' };
  if (value === 'PENDING' || value === 'EXPECTED') return { text: '⟳ running', label: 'Checks running' };
  if (value === 'FAILURE' || value === 'ERROR') return { text: '✗ failed', label: 'Checks failed' };
  return null;
}

/** Whether a pipeline value keeps the refresh timer running (hosting-providers design D-5). */
export function pipelineActive(review: ReviewState): boolean {
  const text = pipelineValue(review.provider, review.pipeline)?.text;
  return text === '⟳ running' || text === '◷ pending';
}

export function approvalValue(review: ReviewState): Part | null {
  if (review.provider === 'gitlab') {
    const required = review.approvalsRequired;
    if (typeof required !== 'number' || required < 1) return null;
    const left = Math.max(0, Math.min(required, review.approvalsLeft ?? required));
    const given = required - left;
    return { text: `${given}/${required}`, label: `${given} of ${required} approvals` };
  }
  switch (review.reviewDecision) {
    case 'APPROVED':
      return { text: 'approved', label: 'Approved' };
    case 'CHANGES_REQUESTED':
      return { text: 'changes requested', label: 'Changes requested' };
    case 'REVIEW_REQUIRED':
      return { text: 'review required', label: 'Review required' };
    default:
      return null;
  }
}

const GITLAB_BLOCKED = new Set([
  'BLOCKED_STATUS',
  'NOT_APPROVED',
  'CI_MUST_PASS',
  'CI_STILL_RUNNING',
  'DISCUSSIONS_NOT_RESOLVED',
  'DRAFT_STATUS',
  'NOT_OPEN',
  'NEED_REBASE',
  'JIRA_ASSOCIATION_MISSING',
  'EXTERNAL_STATUS_CHECKS',
  'REQUESTED_CHANGES',
]);

export type Mergeable = 'yes' | 'conflicts' | 'blocked' | 'unknown';

export function mergeableValue(provider: 'gitlab' | 'github', raw: string | null | undefined): Mergeable {
  const value = (raw ?? '').toUpperCase();
  if (provider === 'gitlab') {
    if (value === 'MERGEABLE') return 'yes';
    if (value === 'CONFLICT') return 'conflicts';
    if (GITLAB_BLOCKED.has(value)) return 'blocked';
    return 'unknown';
  }
  if (value === 'MERGEABLE') return 'yes';
  if (value === 'CONFLICTING') return 'conflicts';
  return 'unknown';
}

export function reference(review: Pick<ReviewState, 'provider' | 'number'>): string {
  return review.provider === 'gitlab' ? `!${review.number}` : `#${review.number}`;
}

export function reviewNoun(provider: 'gitlab' | 'github'): string {
  return provider === 'gitlab' ? 'merge request' : 'pull request';
}

/** The parts of an open review: reference, Draft, pipeline, approvals, `auto ⇢`. */
export function reviewParts(review: ReviewState): Part[] {
  const parts: Part[] = [
    { text: reference(review), label: `${review.provider === 'gitlab' ? 'Merge request' : 'Pull request'} ${review.number}` },
  ];
  if (review.draft) parts.push({ text: 'Draft', label: 'Draft' });
  const pipeline = pipelineValue(review.provider, review.pipeline);
  if (pipeline) parts.push(pipeline);
  const approvals = approvalValue(review);
  if (approvals) parts.push(approvals);
  if (review.autoMerge) parts.push({ text: 'auto ⇢', label: 'Auto-merge enabled' });
  return parts;
}

// ---------------------------------------------------------------------------------------------------------------
// The MR / PR cell

export type ReviewCellKind = 'review' | 'none' | 'signIn' | 'unknownHost' | 'loading' | 'create' | 'pushed';

export interface ReviewCell {
  kind: ReviewCellKind;
  /** The cell as shown, parts separated by two spaces */
  text: string;
  label: string;
  tooltip?: string;
  parts: Part[];
  /** Shown dimmed, with `Not refreshed since …` */
  stale: boolean;
  /** The host of a `Sign in` or `?` cell */
  host?: string;
  review?: ReviewState;
}

const SEPARATOR = '  ';

function simple(kind: ReviewCellKind, text: string, label: string, extra: Partial<ReviewCell> = {}): ReviewCell {
  return { kind, text, label, parts: [{ text, label }], stale: false, ...extra };
}

/**
 * The cell of a row: [Create MR] / [Create PR] in place of `—` when no review is open, HEAD is on a branch other than
 * the default branch and at least one commit is ahead of it (mr-creation: Create MR button in the MR / PR cell).
 */
export function rowReviewCell(row: Pick<RowData, 'review' | 'head' | 'defaultBranch' | 'aheadOfDefault'>, now: number): ReviewCell {
  const cell = reviewCell(row.review, now);
  const info = row.review;
  if (info?.kind !== 'loaded' || info.review || info.stale) return cell;
  if (row.head.kind !== 'branch' || !row.defaultBranch || row.head.name === row.defaultBranch) return cell;
  if ((row.aheadOfDefault ?? 0) < 1) return cell;
  const text = info.provider === 'gitlab' ? '[Create MR]' : '[Create PR]';
  return simple('create', text, info.provider === 'gitlab' ? 'Create merge request' : 'Create pull request');
}

export function reviewCell(info: ReviewInfo | undefined, now: number): ReviewCell {
  if (!info) return simple('none', '—', 'No merge request');
  switch (info.kind) {
    case 'pushed':
      return simple('pushed', `!${info.number}`, `Merge request ${info.number}`, {
        tooltip: `Created during the push. Sign in to ${info.host} to see its status.`,
        host: info.host,
      });
    case 'none':
      return simple('none', '—', 'No merge request');
    case 'unknownHost':
      return simple('unknownHost', '?', 'Unknown host', { tooltip: `Unknown host ${info.host} — choose its provider`, host: info.host });
    case 'signIn':
      return simple('signIn', 'Sign in', `Sign in to ${info.host}`, { host: info.host });
    case 'skipped':
      return simple('none', '—', 'Host skipped', {
        tooltip: `${info.host} is skipped. Run "RepoHangar: Sign In to Host…" to connect it.`,
        host: info.host,
      });
    case 'loading':
      return simple('loading', '…', 'Loading');
    case 'notFound':
      return simple('none', '—', 'Project not found', {
        tooltip: `${info.projectPath} was not found on ${info.host}, or your account cannot read it.`,
      });
    case 'loaded': {
      const staleLine = info.stale ? `Not refreshed since ${ageText(now - info.fetchedAt)} ago` : undefined;
      const staleLabel = info.stale ? ', not refreshed' : '';
      if (!info.review) {
        const label = info.provider === 'gitlab' ? 'No open merge request' : 'No open pull request';
        return { ...simple('none', '—', `${label}${staleLabel}`), stale: info.stale, ...(staleLine ? { tooltip: staleLine } : {}) };
      }
      const parts = reviewParts(info.review);
      return {
        kind: 'review',
        text: parts.map((p) => p.text).join(SEPARATOR),
        label: `${parts.map((p) => p.label).join(', ')}${staleLabel}`,
        tooltip: staleLine ? `${info.review.title}\n${staleLine}` : info.review.title,
        parts,
        stale: info.stale,
        review: info.review,
      };
    }
  }
}

/** The open review of a row, loaded or cached. */
export function openReview(row: Pick<RowData, 'review'>): ReviewState | undefined {
  return row.review?.kind === 'loaded' && row.review.review ? row.review.review : undefined;
}

export function reviewChips(row: Pick<RowData, 'review'>): { hasReview: boolean; pipelineFailed: boolean } {
  const review = openReview(row);
  return {
    hasReview: !!review,
    pipelineFailed: !!review && pipelineValue(review.provider, review.pipeline)?.text === '✗ failed',
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Row details

export interface ReviewDetails {
  lines: { text: string; button?: { label: string; url: string } }[];
  buttons: ReviewButton[];
}

export type ReviewButton = 'openReview' | 'copyLink' | 'compare';

/** The review lines and buttons of the row details; undefined when the provider is not gitlab or github or not loaded. */
export function reviewDetails(row: Pick<RowData, 'provider' | 'review'>): ReviewDetails | undefined {
  if (row.provider !== 'gitlab' && row.provider !== 'github') return undefined;
  if (row.review?.kind !== 'loaded') return undefined;
  const short = row.provider === 'gitlab' ? 'MR' : 'PR';
  const review = row.review.review;
  if (!review) return { lines: [{ text: `${short}  none` }], buttons: ['compare'] };
  const approvals = approvalValue(review);
  const mr = [
    short,
    reference(review),
    review.title,
    `Draft: ${review.draft ? 'yes' : 'no'}`,
    ...(approvals ? [approvals.text] : []),
    `Mergeable: ${mergeableValue(review.provider, review.mergeStatus)}`,
  ].join(SEPARATOR);
  const pipeline = pipelineValue(review.provider, review.pipeline);
  const gitlab = review.provider === 'gitlab';
  return {
    lines: [
      { text: mr },
      {
        text: `${gitlab ? 'Pipeline' : 'Checks'}${SEPARATOR}${pipeline ? pipeline.text : 'none'}`,
        button: { label: gitlab ? 'Open pipeline ↗' : 'Open checks ↗', url: `${review.url}/${gitlab ? 'pipelines' : 'checks'}` },
      },
    ],
    buttons: ['openReview', 'copyLink', 'compare'],
  };
}

export function openReviewLabel(provider: 'gitlab' | 'github'): string {
  return provider === 'gitlab' ? 'Open MR ↗' : 'Open PR ↗';
}

// ---------------------------------------------------------------------------------------------------------------
// Compare page

export type CompareState = { enabled: true; target: string | null } | { enabled: false; reason: string };

/**
 * Whether the compare item applies. `target` is the default branch from `refs/remotes/<remote>/HEAD`, else the one the
 * provider reported; null with a credential means the provider is asked on click.
 */
export function compareState(
  row: Pick<RowData, 'provider' | 'head' | 'defaultBranch' | 'review'>,
  providerDefault: string | null | undefined,
): CompareState {
  if (row.provider !== 'gitlab' && row.provider !== 'github') return { enabled: false, reason: 'Not on a known GitLab or GitHub host' };
  if (row.head.kind !== 'branch') return { enabled: false, reason: 'Not on a branch' };
  const target = row.defaultBranch ?? providerDefault ?? null;
  if (target === null) {
    const credential = row.review !== undefined && row.review.kind !== 'signIn' && row.review.kind !== 'skipped';
    if (providerDefault === null || !credential) return { enabled: false, reason: 'Default branch unknown' };
    return { enabled: true, target: null };
  }
  if (target === row.head.name) return { enabled: false, reason: `Already on ${target}` };
  return { enabled: true, target };
}

// ---------------------------------------------------------------------------------------------------------------
// Open merge request

export type OpenPlan = { kind: 'open'; url: string } | { kind: 'notify'; text: string };

export interface ReviewUrls {
  reviewListUrl(projectPath: string, branch: string): string;
}

/** What `o`, a click on the reference and `repohangar.mr.open` do (Open merge request matrix). */
export function openReviewPlan(row: Pick<RowData, 'name' | 'provider' | 'head' | 'hosted' | 'review'>, urls: ReviewUrls): OpenPlan {
  if ((row.provider !== 'gitlab' && row.provider !== 'github') || !row.hosted) {
    return { kind: 'notify', text: `${row.name} is not on a known GitLab or GitHub host.` };
  }
  if (row.head.kind !== 'branch') return { kind: 'notify', text: `${row.name} is not on a branch.` };
  const branch = row.head.name;
  if (row.review?.kind === 'pushed') return { kind: 'open', url: row.review.url };
  if (row.review?.kind === 'loaded') {
    if (row.review.review) return { kind: 'open', url: row.review.review.url };
    return { kind: 'notify', text: `No open ${reviewNoun(row.provider)} for ${branch} in ${row.name}.` };
  }
  return { kind: 'open', url: urls.reviewListUrl(row.hosted.projectPath, branch) };
}

/** What `repohangar.mr.copyLink` copies, or the notification (Copy merge request link). */
export function copyLinkPlan(row: Pick<RowData, 'name' | 'provider' | 'head' | 'hosted' | 'review'>): OpenPlan {
  const plan = openReviewPlan(row, { reviewListUrl: () => '' });
  if (plan.kind === 'notify') return plan;
  if ((row.review?.kind === 'loaded' && row.review.review) || row.review?.kind === 'pushed') return plan;
  const branch = row.head.kind === 'branch' ? row.head.name : '';
  return { kind: 'notify', text: `No merge request loaded for ${branch} in ${row.name}.` };
}
