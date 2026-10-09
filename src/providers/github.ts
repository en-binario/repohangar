// GitHub and GitHub Enterprise: one GraphQL request per chunk of repositories for the open pull requests, and a
// reduced selection after schema errors (hosting-providers: Batched review status, Reduced selection and REST
// fallback). No vscode import.

import type { ReviewState } from '../shared/model';
import { graphqlMessage, pathSegment } from './gitlab';
import { HttpError, type Credential, type Http } from './http';
import {
  CHUNK_SIZE,
  MAX_REDUCTIONS,
  chunks,
  gqlString,
  missingFields,
  type HostingProvider,
  type ReviewAnswer,
  type ReviewItem,
  type ReviewOptions,
  type ReviewResult,
  type Selection,
  type UserInfo,
} from './provider';
import { selectionSet, valueAt, withoutField } from './selection';

const ROLLUP = 'commits(last: 1).nodes.commit.statusCheckRollup.state';

export const GITHUB_SELECTION: Selection = [
  'number',
  'url',
  'title',
  'isDraft',
  'mergeable',
  'reviewDecision',
  'headRefOid',
  'autoMergeRequest.mergeMethod',
  ROLLUP,
];

const REQUIRED = new Set(['number', 'url']);
const OWNERS: Record<string, string> = {
  PullRequest: '',
  AutoMergeRequest: 'autoMergeRequest',
  Commit: 'commits(last: 1).nodes.commit',
  StatusCheckRollup: 'commits(last: 1).nodes.commit.statusCheckRollup',
};

/** The pull request connection cannot be queried on this host; cached values stay, marked as not refreshed. */
export class UnsupportedQueryError extends Error {}

export class GitHubProvider implements HostingProvider {
  readonly kind = 'github' as const;
  readonly apiHost: string;
  private readonly graphqlUrl: string;
  private readonly restUrl: string;

  constructor(
    private readonly http: Http,
    readonly host: string,
    private readonly origin: string,
  ) {
    const dotCom = host === 'github.com';
    this.restUrl = dotCom ? 'https://api.github.com' : `${origin}/api/v3`;
    this.graphqlUrl = dotCom ? 'https://api.github.com/graphql' : `${origin}/api/graphql`;
    this.apiHost = new URL(this.restUrl).host;
  }

  private headers(): Record<string, string> {
    return { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  }

  async reviewStates(items: readonly ReviewItem[], credential: Credential, options: ReviewOptions): Promise<ReviewAnswer> {
    let selection = options.selection ?? GITHUB_SELECTION;
    let changed = false;
    let requests = 0;
    const results = new Map<string, ReviewResult>();
    for (const chunk of chunks(items, CHUNK_SIZE)) {
      for (let attempt = 0; ; attempt++) {
        requests++;
        const answer = await this.http.request<{ data?: Record<string, unknown> | null; errors?: unknown }>({
          method: 'POST',
          url: this.graphqlUrl,
          credential,
          headers: this.headers(),
          body: { query: this.query(chunk, selection) },
        });
        const missing = missingFields(answer.json?.errors);
        if (missing.length === 0) {
          if (!answer.json?.data && answer.json?.errors) throw new HttpError('status', graphqlMessage(answer.json.errors), answer.status);
          chunk.forEach((item, i) => results.set(item.key, mapGraphql(answer.json?.data?.[`r${i}`], selection)));
          break;
        }
        const reduced = reduce(selection, missing);
        if (reduced === 'unsupported' || attempt >= MAX_REDUCTIONS) throw new UnsupportedQueryError(graphqlMessage(answer.json?.errors));
        selection = reduced;
        changed = true;
      }
    }
    return { results, requests, ...(changed ? { selection } : {}) };
  }

  query(items: readonly ReviewItem[], selection: Selection): string {
    const fields = selectionSet(selection);
    const aliases = items.map((item, i) => {
      const [owner, name] = splitProject(item.projectPath);
      return `r${i}: repository(owner: ${gqlString(owner)}, name: ${gqlString(name)}) { pullRequests(headRefName: ${gqlString(item.branch)}, states: [OPEN], first: 1) { nodes { ${fields} } } }`;
    });
    return `query RepoHangarStatus { ${aliases.join(' ')} }`;
  }

  async defaultBranch(projectPath: string, credential: Credential): Promise<string | undefined> {
    const [owner, name] = splitProject(projectPath);
    const answer = await this.http.request<{ default_branch?: unknown }>({
      url: `${this.restUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      credential,
      headers: this.headers(),
    });
    return typeof answer.json?.default_branch === 'string' ? answer.json.default_branch : undefined;
  }

  async currentUser(token: string): Promise<UserInfo> {
    const answer = await this.http.request<{ login?: unknown }>({
      url: `${this.restUrl}/user`,
      credential: { token, apiHost: this.apiHost },
      headers: this.headers(),
    });
    return { username: typeof answer.json?.login === 'string' ? answer.json.login : '' };
  }

  reviewListUrl(projectPath: string, branch: string): string {
    return `${this.origin}/${projectPath}/pulls?q=is%3Apr+is%3Aopen+head%3A${encodeURIComponent(branch)}`;
  }

  compareUrl(projectPath: string, target: string, branch: string): string {
    return `${this.origin}/${projectPath}/compare/${pathSegment(target)}...${pathSegment(branch)}`;
  }
}

/** `owner` and `name` of `owner/name`; a deeper path keeps everything before the last segment as the owner. */
export function splitProject(projectPath: string): [string, string] {
  const i = projectPath.lastIndexOf('/');
  return i < 0 ? [projectPath, projectPath] : [projectPath.slice(0, i), projectPath.slice(i + 1)];
}

function reduce(selection: Selection, missing: { field: string; type: string }[]): Selection | 'unsupported' {
  let next = selection;
  for (const { field, type } of missing) {
    if ((type === 'PullRequest' && REQUIRED.has(field)) || field === 'pullRequests' || field === 'nodes') return 'unsupported';
    const reduced = withoutField(next, OWNERS, type, field);
    if (!reduced) return 'unsupported';
    next = reduced;
  }
  return next;
}

function mapGraphql(repository: unknown, selection: Selection): ReviewResult {
  if (repository === null || repository === undefined) return { kind: 'notFound' };
  const node = valueAt(repository, 'pullRequests.nodes') as unknown;
  const pr = Array.isArray(node) ? (node[0] as Record<string, unknown> | undefined) : undefined;
  if (!pr) return { kind: 'none' };
  const has = (path: string) => selection.includes(path);
  const review: ReviewState = {
    provider: 'github',
    number: Number(pr.number),
    url: String(pr.url ?? ''),
    title: String(pr.title ?? ''),
    draft: pr.isDraft === true,
    pipeline: has(ROLLUP) ? ((valueAt(pr, ROLLUP) as string | null | undefined) ?? null) : null,
    reviewDecision: has('reviewDecision') ? ((pr.reviewDecision as string | null | undefined) ?? null) : null,
    mergeStatus: has('mergeable') ? ((pr.mergeable as string | null | undefined) ?? null) : null,
    autoMerge: has('autoMergeRequest.mergeMethod') && pr.autoMergeRequest !== null && pr.autoMergeRequest !== undefined,
    headSha: typeof pr.headRefOid === 'string' ? pr.headRefOid : '',
  };
  return { kind: 'review', review };
}
