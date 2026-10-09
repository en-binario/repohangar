// Turns raw row data into the text the dashboard and the status bar show (design D-3).
// Imported by the extension host and the webview; no vscode import, no Node import.

import type {
  ChipId,
  DashboardState,
  GitApiState,
  JobAction,
  Operation,
  Provider,
  RowData,
  RowDetails,
  RowJob,
} from './model';
import { openReview, reference, reviewChips } from './review';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Ages

/** `now` under 1 minute, `<m> min` under 1 hour, `<h> h` under 24 hours, else `<d> d`, each rounded down. */
export function ageText(ms: number): string {
  const age = Math.max(0, ms);
  if (age < MINUTE) return 'now';
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min`;
  if (age < DAY) return `${Math.floor(age / HOUR)} h`;
  return `${Math.floor(age / DAY)} d`;
}

/** `just now` under 1 minute, else the age followed by ` ago`. */
export function agoText(ms: number): string {
  return ms < MINUTE ? 'just now' : `${ageText(ms)} ago`;
}

// ---------------------------------------------------------------------------------------------------------------
// Cells

export interface CellText {
  text: string;
  /** Accessible name */
  label: string;
}

function operationText(op: Operation): string {
  switch (op.kind) {
    case 'rebase':
      return op.step !== undefined && op.total !== undefined ? `REBASING ${op.step}/${op.total}` : 'REBASING';
    case 'merge':
      return 'MERGING';
    case 'cherry-pick':
      return 'CHERRY-PICKING';
    case 'revert':
      return 'REVERTING';
  }
}

export interface BranchCell {
  text: string;
  /** `no upstream` when HEAD is on a branch without upstream and no operation is in progress */
  badge: CellText | null;
}

export function branchCell(row: RowData): BranchCell {
  if (row.operation) return { text: operationText(row.operation), badge: null };
  if (row.head.kind === 'detached') return { text: `detached ${row.head.commit.slice(0, 7)}`, badge: null };
  return {
    text: row.head.name,
    badge: row.head.upstream ? null : { text: 'no upstream', label: 'No upstream branch' },
  };
}

const NOTHING_TO_SYNC: CellText = { text: '—', label: 'Nothing to sync' };

export function syncCell(row: RowData): CellText {
  if (row.operation || row.head.kind === 'detached') return NOTHING_TO_SYNC;
  const { upstream, ahead, behind } = row.head;
  if (!upstream) return row.remote ? { text: '⇡ publish', label: 'Branch not published' } : NOTHING_TO_SYNC;
  if (ahead === undefined || behind === undefined || (ahead === 0 && behind === 0)) return NOTHING_TO_SYNC;
  const parts: CellText[] = [];
  if (ahead > 0) parts.push({ text: `↑${ahead}`, label: `${plural(ahead, 'commit', 'commits')} ahead` });
  if (behind > 0) parts.push({ text: `↓${behind}`, label: `${plural(behind, 'commit', 'commits')} behind` });
  return { text: parts.map((p) => p.text).join(' '), label: parts.map((p) => p.label).join(', ') };
}

const RUNNING: Record<JobAction, string> = {
  fetch: 'fetching',
  pull: 'pulling',
  pullFf: 'pulling',
  push: 'pushing',
  publish: 'publishing',
  sync: 'syncing',
};

const ACTION_NAMES: Record<JobAction, string> = {
  fetch: 'fetch',
  pull: 'pull',
  pullFf: 'pull',
  push: 'push',
  publish: 'publish',
  sync: 'sync',
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface JobCell extends CellText {
  /** The message of a failure */
  tooltip?: string;
}

/** The job text of the Sync cell (git-operations: Job state in the row); null leaves the cell to the sync state. */
export function jobCell(job: RowJob | undefined): JobCell | null {
  if (!job) return null;
  const name = ACTION_NAMES[job.action];
  switch (job.state) {
    case 'running':
      return { text: `⟳ ${RUNNING[job.action]}`, label: capitalize(RUNNING[job.action]) };
    case 'skipped':
      return { text: `↷ ${job.detail ?? 'skipped'}`, label: `Skipped: ${job.detail ?? name}` };
    case 'failed':
      return {
        text: `✗ ${name} failed`,
        label: `${capitalize(name)} failed${job.detail ? `: ${job.detail}` : ''}`,
        ...(job.detail ? { tooltip: job.detail } : {}),
      };
    case 'ok':
      return null;
  }
}

/** The Sync cell as shown: the job while it runs or after a skip or failure, else the sync state. */
export function shownSyncCell(row: RowData): JobCell {
  return jobCell(row.job) ?? syncCell(row);
}

export interface ChangesCell extends CellText {
  segments: CellText[];
}

export function isDirty(row: Pick<RowData, 'counts'>): boolean {
  const c = row.counts;
  return c.conflicts + c.unstaged + c.staged + c.untracked > 0;
}

export function changesCell(row: RowData): ChangesCell {
  const { conflicts, unstaged, staged, untracked } = row.counts;
  const segments: CellText[] = [];
  if (conflicts > 0) segments.push({ text: `⚠ ${conflicts} confl`, label: `${plural(conflicts, 'file', 'files')} with conflicts` });
  if (unstaged > 0) segments.push({ text: `●${unstaged}`, label: `${plural(unstaged, 'file', 'files')} with unstaged changes` });
  if (staged > 0) segments.push({ text: `+${staged}`, label: `${plural(staged, 'file', 'files')} with staged changes` });
  if (untracked > 0) segments.push({ text: `?${untracked}`, label: plural(untracked, 'untracked file', 'untracked files') });
  if (row.stashes > 0) segments.push({ text: `≡${row.stashes}`, label: plural(row.stashes, 'stash', 'stashes') });
  if (segments.length === 0) return { text: '—', label: 'No changes', segments };
  return {
    text: segments.map((s) => s.text).join(' '),
    label: segments.map((s) => s.label).join(', '),
    segments,
  };
}

export interface FetchedCell {
  /** The age, or `never` */
  age: string;
  stale: CellText | null;
  /** The whole cell, as shown: `2 h ⚠` */
  text: string;
}

/** The Fetched cell. `staleFetchHours` 0 turns the stale marker off. */
export function fetchedCell(lastFetch: number | null, now: number, staleFetchHours: number): FetchedCell {
  if (lastFetch === null) return { age: 'never', stale: null, text: 'never' };
  const elapsed = now - lastFetch;
  const age = ageText(elapsed);
  const isStale = staleFetchHours > 0 && elapsed >= staleFetchHours * HOUR;
  const stale = isStale ? { text: '⚠', label: `Last fetch more than ${staleFetchHours} h ago` } : null;
  return { age, stale, text: stale ? `${age} ⚠` : age };
}

const BADGES: Record<Provider, CellText> = {
  gitlab: { text: 'GL', label: 'GitLab' },
  github: { text: 'GH', label: 'GitHub' },
  unknown: { text: '?', label: 'Unknown host' },
};

export interface RepositoryCell {
  name: string;
  badge: CellText | null;
  /** Two lines: the root path and the remote URL, or `No remote` */
  tooltip: string;
  /** The cell as text: `billing-api GL` */
  text: string;
}

export function repositoryCell(row: RowData): RepositoryCell {
  const badge = row.provider ? BADGES[row.provider] : null;
  return {
    name: row.name,
    badge,
    tooltip: `${row.path}\n${row.remote ? row.remote.displayUrl : 'No remote'}`,
    text: badge ? `${row.name} ${badge.text}` : row.name,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Row details

export function detailsLines(row: RowData, details: RowDetails, now: number): string[] {
  const commit = details.commit
    ? `${details.commit.hash.slice(0, 7)}  "${details.commit.subject}" — ${details.commit.author}, ${agoText(now - details.commit.date)}`
    : 'No commits yet';
  const upstream = row.head.kind === 'branch' && row.head.upstream ? row.head.upstream : 'none';
  const remote = row.remote ? `${row.remote.name}  ${row.remote.displayUrl}` : 'none';
  return [`Last commit  ${commit}`, `Upstream  ${upstream}`, `Remote  ${remote}`, `Path  ${row.path}`];
}

// ---------------------------------------------------------------------------------------------------------------
// Filters

export const CHIPS: readonly { id: ChipId | 'all'; label: string; key: string }[] = [
  { id: 'all', label: 'All', key: '1' },
  { id: 'dirty', label: 'Dirty', key: '2' },
  { id: 'behind', label: 'Behind', key: '3' },
  { id: 'ahead', label: 'Ahead', key: '4' },
  { id: 'hasReview', label: 'Has MR', key: '5' },
  { id: 'pipelineFailed', label: 'Pipeline ✗', key: '6' },
  { id: 'noUpstream', label: 'No upstream', key: '7' },
];

export function chipMembership(row: RowData): Record<ChipId, boolean> {
  const branch = row.head.kind === 'branch' ? row.head : undefined;
  return {
    dirty: isDirty(row),
    behind: (branch?.behind ?? 0) >= 1 && !!branch?.upstream,
    ahead: (branch?.ahead ?? 0) >= 1 && !!branch?.upstream,
    ...reviewChips(row),
    noUpstream: !!branch && !branch.upstream,
  };
}

/** A row matches when the text is a case-insensitive substring of its name, branch or group, and every chip holds. */
export function matchesFilter(row: RowData, text: string, chips: readonly ChipId[]): boolean {
  const needle = text.trim().toLowerCase();
  if (needle) {
    const branch = row.head.kind === 'branch' ? row.head.name : '';
    const haystacks = [row.name, branch, row.group ?? ''];
    if (!haystacks.some((h) => h.toLowerCase().includes(needle))) return false;
  }
  const member = chipMembership(row);
  return chips.every((chip) => member[chip]);
}

export function compareNames(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Dashboard state

export function dashboardState(gitEnabled: boolean, apiState: GitApiState, repositories: number): DashboardState {
  if (!gitEnabled) return { kind: 'gitDisabled' };
  if (apiState !== 'initialized') return { kind: 'loading' };
  if (repositories === 0) return { kind: 'noRepositories' };
  return { kind: 'grid' };
}

export function emptyStateText(state: DashboardState): { text: string; button?: string } | null {
  switch (state.kind) {
    case 'gitDisabled':
      return { text: 'The Git extension is disabled (git.enabled is false).', button: 'Open Settings' };
    case 'loading':
      return { text: 'Loading repositories…' };
    case 'noRepositories':
      return { text: 'No Git repositories found in this workspace.' };
    case 'grid':
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Status bar

export interface StatusBarModel {
  visible: boolean;
  text: string;
  tooltip: string;
  label: string;
}

const MAX_NAMES = 10;

function nameList(items: string[]): string {
  const shown = items.slice(0, MAX_NAMES).join(', ');
  return items.length > MAX_NAMES ? `${shown} and ${items.length - MAX_NAMES} more` : shown;
}

function isBehind(row: RowData): boolean {
  return chipMembership(row).behind;
}

export function statusBarModel(rows: readonly RowData[], enabled: boolean): StatusBarModel {
  const n = rows.length;
  const sorted = [...rows].sort((a, b) => compareNames(a.name, b.name));
  const behind = sorted.filter(isBehind);
  const dirty = sorted.filter(isDirty);

  const segments = [`$(git-branch) ${n} ${n === 1 ? 'repo' : 'repos'}`];
  if (behind.length > 0) segments.push(`$(arrow-down)${behind.length}`);
  if (dirty.length > 0) segments.push(`$(circle-filled)${dirty.length}`);
  const reviews = sorted.flatMap((r) => {
    const review = openReview(r);
    return review ? [`${r.name} ${reference(review)}`] : [];
  });
  if (reviews.length > 0) segments.push(`$(git-pull-request)${reviews.length}`);

  const lines = [`RepoHangar: ${plural(n, 'repository', 'repositories')}`];
  if (behind.length > 0) {
    lines.push(`Behind: ${nameList(behind.map((r) => `${r.name} ↓${r.head.kind === 'branch' ? r.head.behind : 0}`))}`);
  }
  if (dirty.length > 0) lines.push(`Dirty: ${nameList(dirty.map((r) => r.name))}`);
  if (behind.length === 0 && dirty.length === 0) lines.push('All repositories are clean and up to date.');
  if (reviews.length > 0) lines.push(`Open MR/PR: ${nameList(reviews)}`);

  return {
    visible: enabled && n > 0,
    text: segments.join('  '),
    tooltip: lines.join('\n'),
    label: `RepoHangar: ${plural(n, 'repository', 'repositories')}, ${behind.length} behind, ${dirty.length} with changes${
      reviews.length > 0 ? `, ${reviews.length} with an open MR or PR` : ''
    }`,
  };
}
