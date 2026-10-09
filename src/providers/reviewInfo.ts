// Which repositories a review request includes and what their MR / PR cell shows from the stored states
// (hosting-providers: Batched review status, Review state cache; design D-4). No vscode import.

import type { ReviewInfo, ReviewState, RowData } from '../shared/model';

/** The credential state of a host as the provider layer knows it. */
export type HostState =
  /** A credential exists */
  | 'credential'
  /** Lookup still running (VS Code session, SecretStorage, glab or gh) */
  | 'pending'
  /** No credential: `Sign in` */
  | 'none'
  /** Skipped by the user */
  | 'skipped';

export interface StoredReview {
  /** The open review, or null for none */
  review: ReviewState | null;
  /** The project was not found or cannot be read */
  notFound?: boolean;
  headSha: string;
  /** Epoch ms of the answer */
  fetchedAt: number;
}

export interface InfoContext {
  hostState(host: string): HostState;
  stored(id: string, branch: string): StoredReview | undefined;
  /** Epoch ms when this window session started; earlier states are not refreshed */
  sessionStart: number;
  /** The last request to the host failed */
  hostFailing(host: string): boolean;
}

/** The host and branch a row's review request needs, or undefined when the row gets no request at all. */
export function reviewTarget(row: RowData): { host: string; provider: 'gitlab' | 'github'; branch: string } | undefined {
  if ((row.provider !== 'gitlab' && row.provider !== 'github') || !row.hosted) return undefined;
  if (row.head.kind !== 'branch') return undefined;
  return { host: row.hosted.host, provider: row.provider, branch: row.head.name };
}

/** Whether the row is in its host's review request (Repository inclusion matrix). */
export function included(row: RowData, ctx: Pick<InfoContext, 'hostState'>): boolean {
  const target = reviewTarget(row);
  return target !== undefined && ctx.hostState(target.host) === 'credential';
}

export function reviewInfo(row: RowData, ctx: InfoContext): ReviewInfo {
  if (row.provider === null || !row.hosted) return { kind: 'none' };
  if (row.provider === 'unknown') return { kind: 'unknownHost', host: row.hosted.host };
  const target = reviewTarget(row);
  if (!target) return { kind: 'none' };
  const state = ctx.hostState(target.host);
  if (state === 'skipped') return { kind: 'skipped', host: target.host };
  if (state === 'none') return { kind: 'signIn', host: target.host };
  const stored = ctx.stored(row.id, target.branch);
  if (!stored) return { kind: 'loading' };
  if (stored.notFound) return { kind: 'notFound', host: target.host, projectPath: row.hosted.projectPath };
  const stale =
    stored.fetchedAt < ctx.sessionStart ||
    (row.headSha !== undefined && stored.headSha !== row.headSha) ||
    ctx.hostFailing(target.host);
  return { kind: 'loaded', provider: target.provider, review: stored.review, stale, fetchedAt: stored.fetchedAt };
}

/** The key of a stored state. */
export function storeKey(id: string, branch: string): string {
  return `${id}\u0000${branch}`;
}
