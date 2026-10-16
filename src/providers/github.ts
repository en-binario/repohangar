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
  type CreateInput,
  type CreateNotice,
  type CreateOutcome,
  type HostingProvider,
  type ProjectInfo,
  type ReviewAnswer,
  type ReviewItem,
  type ReviewOptions,
  type ReviewResult,
  type Selection,
  type UserInfo,
  type UserMatch,
} from './provider';
import { notFoundNotice } from '../mr/users';
import { selectionSet, valueAt, withoutField } from './selection';

const ASSIGNABLE_USERS =
  'query($owner: String!, $name: String!, $q: String!) { repository(owner: $owner, name: $name) { assignableUsers(query: $q, first: 10) { nodes { login name } } } }';

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
    let selection: Selection = [...(options.selection ?? GITHUB_SELECTION), ...(options.description ? ['body'] : [])];
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

  // ---------------------------------------------------------------------------------------------------------------
  // Pull request creation (mr-creation: GitHub create requests, Reviewers and assignees, Undo)

  private repoUrl(projectPath: string): string {
    const [owner, name] = splitProject(projectPath);
    return `${this.restUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  }

  async projectInfo(projectPath: string, credential: Credential): Promise<ProjectInfo> {
    const answer = await this.http.request<Record<string, unknown>>({ url: this.repoUrl(projectPath), credential, headers: this.headers() });
    const j = answer.json ?? {};
    const bool = (key: string) => (typeof j[key] === 'boolean' ? { [key]: j[key] } : {});
    const info: ProjectInfo = {
      ...(typeof j.default_branch === 'string' ? { defaultBranch: j.default_branch } : {}),
    };
    const flags = { ...bool('allow_squash_merge'), ...bool('allow_auto_merge'), ...bool('delete_branch_on_merge') } as Record<string, boolean>;
    if (flags.allow_squash_merge !== undefined) info.allowSquashMerge = flags.allow_squash_merge;
    if (flags.allow_auto_merge !== undefined) info.allowAutoMerge = flags.allow_auto_merge;
    if (flags.delete_branch_on_merge !== undefined) info.deleteBranchOnMerge = flags.delete_branch_on_merge;
    return info;
  }

  reviewUrl(projectPath: string, number: number): string {
    return `${this.origin}/${projectPath}/pull/${number}`;
  }

  async createReview(input: CreateInput, credential: Credential): Promise<CreateOutcome> {
    const repo = this.repoUrl(input.projectPath);
    type Pull = { number?: unknown; html_url?: unknown };
    let pull: Pull;
    try {
      pull = (
        await this.http.request<Pull>({
          method: 'POST',
          url: `${repo}/pulls`,
          credential,
          headers: this.headers(),
          body: { title: input.title, head: input.source, base: input.target, body: input.description, draft: input.draft },
        })
      ).json;
    } catch (error) {
      if (!(error instanceof HttpError) || (error.kind !== 'status' && error.kind !== 'timeout')) throw error;
      const message = githubMessage(error);
      if (error.status === 422 && /already exists/i.test(message)) return { kind: 'exists' };
      return { kind: 'failed', ...(error.status === undefined ? {} : { status: error.status }), message };
    }
    const number = Number(pull.number);
    const ref = `#${number}`;
    const notices: CreateNotice[] = [];
    const applied = { reviewers: [] as string[], assignees: [] as string[], labels: [] as string[] };
    const follow = async (run: () => Promise<unknown>, ok: () => void, failed: (message: string, status?: number) => void) => {
      try {
        await run();
        ok();
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        failed(githubMessage(error), error.status);
      }
    };
    const post = (path: string, body: unknown) => this.http.request({ method: 'POST', url: `${repo}${path}`, credential, headers: this.headers(), body });
    await Promise.all([
      input.reviewers.length || input.teams.length
        ? follow(
            () => post(`/pulls/${number}/requested_reviewers`, { reviewers: input.reviewers, team_reviewers: input.teams }),
            () => applied.reviewers.push(...input.reviewers, ...input.teams.map((t) => `team:${t}`)),
            (message, status) => {
              const names = [...input.reviewers, ...input.teams.map((t) => `team:${t}`)];
              if (status === 422 && names.length === 1) notices.push(notFoundNotice('Reviewer', names[0] as string, this.host));
              else notices.push({ text: `Reviewers were not added to ${ref}: ${message}`, button: 'Open Settings' });
            },
          )
        : undefined,
      input.assignees.length
        ? follow(
            () => post(`/issues/${number}/assignees`, { assignees: input.assignees }),
            () => applied.assignees.push(...input.assignees),
            (message) => notices.push({ text: `Assignees were not added to ${ref}: ${message}` }),
          )
        : undefined,
      input.labels.length
        ? follow(
            () => post(`/issues/${number}/labels`, { labels: input.labels }),
            () => applied.labels.push(...input.labels),
            (message) => notices.push({ text: `Labels were not added to ${ref}: ${message}` }),
          )
        : undefined,
    ]);
    return {
      kind: 'created',
      number,
      url: typeof pull.html_url === 'string' ? pull.html_url : this.reviewUrl(input.projectPath, number),
      applied,
      notices,
    };
  }

  async closeReview(projectPath: string, number: number, credential: Credential): Promise<void> {
    await this.http.request({ method: 'PATCH', url: `${this.repoUrl(projectPath)}/pulls/${number}`, credential, headers: this.headers(), body: { state: 'closed' } });
  }

  async updateDescription(projectPath: string, number: number, description: string, credential: Credential): Promise<void> {
    await this.http.request({ method: 'PATCH', url: `${this.repoUrl(projectPath)}/pulls/${number}`, credential, headers: this.headers(), body: { body: description } });
  }

  /** One GraphQL `assignableUsers(query:)`, which matches the login and the name (add-user-picker design D-3). */
  async searchUsers(projectPath: string, text: string, credential: Credential): Promise<UserMatch[]> {
    const [owner, name] = splitProject(projectPath);
    type Answer = { data?: { repository?: { assignableUsers?: { nodes?: ({ login?: unknown; name?: unknown } | null)[] } } | null }; errors?: unknown };
    const answer = await this.http.request<Answer>({
      method: 'POST',
      url: this.graphqlUrl,
      credential,
      body: { query: ASSIGNABLE_USERS, variables: { owner, name, q: text } },
    });
    if (!answer.json?.data && answer.json?.errors) throw new HttpError('status', graphqlMessage(answer.json.errors), answer.status);
    const nodes = answer.json?.data?.repository?.assignableUsers?.nodes ?? [];
    return nodes
      .filter((u): u is { login: string; name?: unknown } => typeof u?.login === 'string')
      .slice(0, 10)
      .map((u) => ({ username: u.login, name: typeof u.name === 'string' ? u.name : '' }));
  }
}

/** The most specific message of a GitHub error: `errors[0].message`, else `message`. */
export function githubMessage(error: HttpError): string {
  const body = error.body as { message?: unknown; errors?: { message?: unknown }[] } | undefined;
  const first = Array.isArray(body?.errors) ? body?.errors[0]?.message : undefined;
  if (typeof first === 'string') return first;
  return typeof body?.message === 'string' ? body.message : error.message;
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
    // Every alias reports the same missing field: one already removed is not a new error.
    if (!next.some((path) => path === field || path.startsWith(`${field}.`) || path.includes(`.${field}.`) || path.endsWith(`.${field}`))) continue;
    const reduced = withoutField(next, OWNERS, type, field);
    if (!reduced) return 'unsupported';
    next = reduced;
  }
  // Nothing could be removed: the selection would fail again.
  return next === selection ? 'unsupported' : next;
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
    ...(has('body') ? { description: typeof pr.body === 'string' ? pr.body : '' } : {}),
  };
  return { kind: 'review', review };
}
