// One review request for a host: the credential, the provider query with the host's remembered selection, the stored
// states, and the outcome the queue backs off on (hosting-providers: Batched review status, Review request failures).
// No vscode import.

import type { RowData } from '../shared/model';
import { UnsupportedQueryError } from './github';
import { HttpError, type Credential } from './http';
import type { HostedProvider, HostingProvider, ReviewItem, Selection } from './provider';
import { reviewTarget, type StoredReview } from './reviewInfo';
import type { LoadOutcome } from './reviewQueue';

export interface HostSelection {
  selection?: Selection;
  rest?: boolean;
}

export interface LoaderPort {
  row(id: string): RowData | undefined;
  provider(kind: HostedProvider, host: string, origin: string): HostingProvider;
  credential(host: string, kind: HostedProvider): Promise<Credential | undefined>;
  /** A request with the credential was answered 401 (provider-auth: Rejected credential) */
  rejected(host: string, kind: HostedProvider): Promise<void>;
  selection(host: string): HostSelection;
  saveSelection(host: string, selection: HostSelection): Promise<void>;
  store(id: string, branch: string, state: StoredReview): void;
  now(): number;
  log(message: string): void;
}

export class ReviewLoader {
  /** HTTP requests sent per host (integration and performance tests). */
  readonly requests = new Map<string, number>();

  constructor(private readonly port: LoaderPort) {}

  async load(host: string, ids: readonly string[]): Promise<LoadOutcome> {
    const targets = ids.flatMap((id) => {
      const row = this.port.row(id);
      const target = row ? reviewTarget(row) : undefined;
      return row && target && target.host === host ? [{ row, target }] : [];
    });
    const first = targets[0];
    if (!first?.row.hosted) return { ok: true };
    const kind = first.target.provider;
    const credential = await this.port.credential(host, kind);
    if (!credential) return { ok: true };
    const provider = this.port.provider(kind, host, new URL(first.row.hosted.webUrl).origin);
    const items: ReviewItem[] = targets.map(({ row, target }) => ({
      key: row.id,
      projectPath: row.hosted?.projectPath ?? '',
      branch: target.branch,
    }));
    const remembered = this.port.selection(host);
    try {
      const answer = await provider.reviewStates(items, credential, {
        ...(remembered.selection ? { selection: remembered.selection } : {}),
        ...(remembered.rest ? { rest: true } : {}),
      });
      this.requests.set(host, (this.requests.get(host) ?? 0) + answer.requests);
      const fetchedAt = this.port.now();
      for (const { row, target } of targets) {
        const result = answer.results.get(row.id);
        if (!result) continue;
        this.port.store(row.id, target.branch, {
          review: result.kind === 'review' ? result.review : null,
          ...(result.kind === 'notFound' ? { notFound: true } : {}),
          headSha: row.headSha ?? '',
          fetchedAt,
        });
      }
      if (answer.rest && !remembered.rest) await this.port.saveSelection(host, { rest: true });
      else if (answer.selection) await this.port.saveSelection(host, { selection: answer.selection });
      return { ok: true };
    } catch (error) {
      this.requests.set(host, (this.requests.get(host) ?? 0) + 1);
      if (error instanceof HttpError && error.kind === 'status' && error.status === 401) {
        await this.port.rejected(host, kind);
        return { ok: false };
      }
      if (error instanceof HttpError && error.kind === 'rateLimited') {
        this.port.log(`Review request to ${host} rate limited until ${new Date(error.untilMs ?? 0).toISOString()}`);
        return { ok: false, ...(error.untilMs === undefined ? {} : { untilMs: error.untilMs }) };
      }
      const message = error instanceof UnsupportedQueryError ? `unsupported query: ${error.message}` : String((error as Error)?.message ?? error);
      this.port.log(`Review request to ${host} failed: ${message}`);
      return { ok: false };
    }
  }
}
