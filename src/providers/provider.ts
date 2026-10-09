// The provider interface (PROPOSAL.md §6.1, hosting-providers design D-2): one implementation per host type, behind a
// factory keyed by host. No vscode import.

import type { ReviewState } from '../shared/model';
import { GitHubProvider } from './github';
import { GitLabProvider } from './gitlab';
import type { Credential, Http } from './http';

export type HostedProvider = 'gitlab' | 'github';

/** One repository and branch of a review request; `key` identifies it in the answer. */
export interface ReviewItem {
  key: string;
  projectPath: string;
  branch: string;
}

export type ReviewResult =
  | { kind: 'review'; review: ReviewState }
  /** The branch has no open review */
  | { kind: 'none' }
  /** The project does not exist or the credential cannot read it */
  | { kind: 'notFound' };

/** The GraphQL selection a host still accepts, as field paths (design D-2). */
export type Selection = readonly string[];

export interface ReviewAnswer {
  results: Map<string, ReviewResult>;
  /** The selection after the fields the host reported missing were removed, when it changed */
  selection?: Selection;
  /** The host answered that the review connection cannot be queried, so it uses REST from now on (GitLab) */
  rest?: boolean;
  /** Number of HTTP requests sent */
  requests: number;
}

export interface UserInfo {
  username: string;
}

export interface HostingProvider {
  readonly kind: HostedProvider;
  /** The remote host, lower-cased, without port */
  readonly host: string;
  /** `URL.host` of the API, which the credential belongs to (`api.github.com` for github.com) */
  readonly apiHost: string;

  /** The open review of every item, with one GraphQL request per chunk of at most 50 items. */
  reviewStates(items: readonly ReviewItem[], credential: Credential, options: ReviewOptions): Promise<ReviewAnswer>;
  /** The project's default branch, or undefined when it cannot be read */
  defaultBranch(projectPath: string, credential: Credential): Promise<string | undefined>;
  /** The user a token belongs to; throws an `HttpError` with status 401 when the host does not accept it */
  currentUser(token: string): Promise<UserInfo>;
  /** Web pages: the review list of a branch, and the compare page */
  reviewListUrl(projectPath: string, branch: string): string;
  compareUrl(projectPath: string, target: string, branch: string): string;
}

export interface ReviewOptions {
  /** The selection remembered for the host; undefined uses the full one */
  selection?: Selection;
  /** Use the REST fallback (GitLab) */
  rest?: boolean;
}

export const CHUNK_SIZE = 50;
export const MAX_REDUCTIONS = 3;

/** `https://<host>[:<port>]` of a web URL. */
export function webOrigin(webUrl: string): string {
  return new URL(webUrl).origin;
}

export class ProviderFactory {
  private readonly providers = new Map<string, HostingProvider>();

  constructor(private readonly http: Http) {}

  /** The provider of a host; `origin` is the web origin of one of its repositories, which keeps a port. */
  get(kind: HostedProvider, host: string, origin: string): HostingProvider {
    const key = `${kind} ${origin}`;
    let provider = this.providers.get(key);
    if (!provider) {
      provider = kind === 'gitlab' ? new GitLabProvider(this.http, host, origin) : new GitHubProvider(this.http, host, origin);
      this.providers.set(key, provider);
    }
    return provider;
  }
}

/** Splits items into chunks of at most `size`. */
export function chunks<T>(items: readonly T[], size = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** A GraphQL string literal. */
export function gqlString(value: string): string {
  return JSON.stringify(value);
}

/** The fields a GraphQL error names as missing: `Field 'x' doesn't exist on type 'Y'`. */
export function missingFields(errors: unknown): { field: string; type: string }[] {
  if (!Array.isArray(errors)) return [];
  const out: { field: string; type: string }[] = [];
  for (const error of errors) {
    const message = (error as { message?: unknown } | undefined)?.message;
    if (typeof message !== 'string') continue;
    const match = /Field '([^']+)' doesn't exist on type '([^']+)'/.exec(message);
    if (match) out.push({ field: match[1] as string, type: match[2] as string });
  }
  return out;
}
