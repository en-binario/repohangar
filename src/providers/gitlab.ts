// GitLab: one GraphQL request per chunk of repositories for the open merge requests, a reduced selection after schema
// errors, and the REST fallback (hosting-providers: Batched review status, Reduced selection and REST fallback).
// No vscode import.

import type { ReviewState } from '../shared/model';
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

export const GITLAB_SELECTION: Selection = [
  'iid',
  'webUrl',
  'title',
  'draft',
  'detailedMergeStatus',
  'approvalsRequired',
  'approvalsLeft',
  'autoMergeEnabled',
  'diffHeadSha',
  'headPipeline.status',
];

/** The fields that identify a merge request; a schema error on them switches the host to REST. */
const REQUIRED = new Set(['iid', 'webUrl']);
/** The path prefix whose last segment has each type. */
const OWNERS: Record<string, string> = { MergeRequest: '', Pipeline: 'headPipeline' };

export const REST_CONCURRENCY = 4;

export class GitLabProvider implements HostingProvider {
  readonly kind = 'gitlab' as const;
  readonly apiHost: string;
  private readonly graphqlUrl: string;
  private readonly restUrl: string;

  constructor(
    private readonly http: Http,
    readonly host: string,
    private readonly origin: string,
  ) {
    this.apiHost = new URL(origin).host;
    this.graphqlUrl = `${origin}/api/graphql`;
    this.restUrl = `${origin}/api/v4`;
  }

  async reviewStates(items: readonly ReviewItem[], credential: Credential, options: ReviewOptions): Promise<ReviewAnswer> {
    if (options.rest) return this.rest(items, credential);
    let selection = options.selection ?? GITLAB_SELECTION;
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
          body: { query: this.query(chunk, selection) },
        });
        const missing = missingFields(answer.json?.errors);
        if (missing.length === 0) {
          if (!answer.json?.data && answer.json?.errors) throw new HttpError('status', graphqlMessage(answer.json.errors), answer.status);
          chunk.forEach((item, i) => results.set(item.key, mapGraphql(answer.json?.data?.[`r${i}`], selection)));
          break;
        }
        const reduced = reduce(selection, missing);
        if (reduced === 'rest' || attempt >= MAX_REDUCTIONS) {
          const rest = await this.rest(items, credential);
          return { results: rest.results, rest: true, requests: requests + rest.requests };
        }
        selection = reduced;
        changed = true;
      }
    }
    return { results, requests, ...(changed ? { selection } : {}) };
  }

  query(items: readonly ReviewItem[], selection: Selection): string {
    const fields = selectionSet(selection);
    const aliases = items.map(
      (item, i) =>
        `r${i}: project(fullPath: ${gqlString(item.projectPath)}) { mergeRequests(sourceBranches: [${gqlString(item.branch)}], state: opened, first: 1) { nodes { ${fields} } } }`,
    );
    return `query RepoHangarStatus { ${aliases.join(' ')} }`;
  }

  /** One `GET …/merge_requests?source_branch=…&state=opened&per_page=1` per repository, 4 at a time, with ETags. */
  private async rest(items: readonly ReviewItem[], credential: Credential): Promise<ReviewAnswer> {
    const results = new Map<string, ReviewResult>();
    const queue = [...items];
    let requests = 0;
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const url = `${this.project(item.projectPath)}/merge_requests?source_branch=${encodeURIComponent(item.branch)}&state=opened&per_page=1`;
        requests++;
        try {
          const answer = await this.http.request<unknown[]>({ url, credential, etag: true });
          const mr = Array.isArray(answer.json) ? (answer.json[0] as Record<string, unknown> | undefined) : undefined;
          results.set(item.key, mr ? { kind: 'review', review: mapRest(mr) } : { kind: 'none' });
        } catch (error) {
          if (error instanceof HttpError && error.kind === 'status' && error.status === 404) results.set(item.key, { kind: 'notFound' });
          else throw error;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(REST_CONCURRENCY, items.length) }, worker));
    return { results, rest: true, requests };
  }

  private project(projectPath: string): string {
    return `${this.restUrl}/projects/${encodeURIComponent(projectPath)}`;
  }

  async defaultBranch(projectPath: string, credential: Credential): Promise<string | undefined> {
    const answer = await this.http.request<{ default_branch?: unknown }>({ url: this.project(projectPath), credential });
    return typeof answer.json?.default_branch === 'string' ? answer.json.default_branch : undefined;
  }

  async currentUser(token: string): Promise<UserInfo> {
    const answer = await this.http.request<{ username?: unknown }>({ url: `${this.restUrl}/user`, credential: { token, apiHost: this.apiHost } });
    return { username: typeof answer.json?.username === 'string' ? answer.json.username : '' };
  }

  /** `GET /api/v4/version`, with the token when there is one; undefined when it cannot be read. */
  async version(credential: Credential | undefined): Promise<string | undefined> {
    try {
      const answer = await this.http.request<{ version?: unknown }>({ url: `${this.restUrl}/version`, ...(credential ? { credential } : {}) });
      return typeof answer.json?.version === 'string' ? answer.json.version : undefined;
    } catch {
      return undefined;
    }
  }

  reviewListUrl(projectPath: string, branch: string): string {
    return `${this.origin}/${projectPath}/-/merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}`;
  }

  compareUrl(projectPath: string, target: string, branch: string): string {
    return `${this.origin}/${projectPath}/-/compare/${pathSegment(target)}...${pathSegment(branch)}`;
  }
}

/** The selection without the missing fields, or `rest` when a required field or the connection itself is missing. */
function reduce(selection: Selection, missing: { field: string; type: string }[]): Selection | 'rest' {
  let next = selection;
  for (const { field, type } of missing) {
    if ((type === 'MergeRequest' && REQUIRED.has(field)) || field === 'mergeRequests' || field === 'nodes') return 'rest';
    const reduced = withoutField(next, OWNERS, type, field);
    if (!reduced) return 'rest';
    next = reduced;
  }
  return next;
}

function mapGraphql(project: unknown, selection: Selection): ReviewResult {
  if (project === null || project === undefined) return { kind: 'notFound' };
  const node = valueAt(project, 'mergeRequests.nodes') as unknown;
  const mr = Array.isArray(node) ? (node[0] as Record<string, unknown> | undefined) : undefined;
  if (!mr) return { kind: 'none' };
  const has = (path: string) => selection.includes(path);
  const review: ReviewState = {
    provider: 'gitlab',
    number: Number(mr.iid),
    url: String(mr.webUrl ?? ''),
    title: String(mr.title ?? ''),
    draft: mr.draft === true,
    pipeline: has('headPipeline.status') ? ((valueAt(mr, 'headPipeline.status') as string | null | undefined) ?? null) : null,
    approvalsRequired: has('approvalsRequired') ? numberOrNull(mr.approvalsRequired) : null,
    approvalsLeft: has('approvalsLeft') ? numberOrNull(mr.approvalsLeft) : null,
    mergeStatus: has('detailedMergeStatus') ? ((mr.detailedMergeStatus as string | null | undefined) ?? null) : null,
    autoMerge: mr.autoMergeEnabled === true,
    headSha: typeof mr.diffHeadSha === 'string' ? mr.diffHeadSha : '',
  };
  return { kind: 'review', review };
}

function mapRest(mr: Record<string, unknown>): ReviewState {
  const pipeline = (mr.head_pipeline as { status?: unknown } | undefined)?.status;
  return {
    provider: 'gitlab',
    number: Number(mr.iid),
    url: String(mr.web_url ?? ''),
    title: String(mr.title ?? ''),
    draft: mr.draft === true || mr.work_in_progress === true,
    pipeline: typeof pipeline === 'string' ? pipeline.toUpperCase() : null,
    approvalsRequired: null,
    approvalsLeft: null,
    mergeStatus: typeof mr.detailed_merge_status === 'string' ? mr.detailed_merge_status.toUpperCase() : null,
    autoMerge: mr.merge_when_pipeline_succeeds === true,
    headSha: typeof mr.sha === 'string' ? mr.sha : '',
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function graphqlMessage(errors: unknown): string {
  const first = Array.isArray(errors) ? (errors[0] as { message?: unknown } | undefined) : undefined;
  return typeof first?.message === 'string' ? first.message : 'GraphQL error';
}

/** A branch name in a URL path: every character encoded except `/`. */
export function pathSegment(name: string): string {
  return encodeURIComponent(name).replace(/%2F/gi, '/');
}
