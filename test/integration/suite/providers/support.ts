// Answers for the provider requests of the extension under test, and the interactive parts of sign-in.

import { execFile, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { TestApi } from '../../../../src/extension';
import type { QuickCreateChoice, QuickCreateModel } from '../../../../src/mr/service';
import { vscodeAuthUi, type AuthUi } from '../../../../src/providers/auth';
import type { RowData } from '../../../../src/shared/model';
import { recordIntegrations, waitFor } from '../helpers';

export interface SentRequest {
  method: string;
  url: string;
  authorization?: string;
  body?: unknown;
}

/** Answers a request, or returns undefined to fall through to the next route; unanswered requests get 404. */
export type Route = (url: URL, method: string, body: unknown, authorization: string | undefined) => Response | undefined;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

/** Replaces the extension's fetch; returns the requests it receives. */
export function answerHttp(api: TestApi, routes: Route[]): { requests: SentRequest[]; restore(): void } {
  const requests: SentRequest[] = [];
  const http = api.providers.http;
  const previous = http.fetchOverride;
  http.fetchOverride = async (url, init) => {
    const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Record<string, string>;
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const authorization = headers.Authorization;
    requests.push({ method, url, ...(authorization ? { authorization } : {}), ...(body === undefined ? {} : { body }) });
    const parsed = new URL(url);
    for (const route of routes) {
      const answer = route(parsed, method, body, authorization);
      if (answer) return answer;
    }
    return json({ message: '404 Not Found' }, 404);
  };
  return { requests, restore: () => (http.fetchOverride = previous) };
}

/** `GET /user` of GitLab (`/api/v4/user`) and GitHub (`/user`, `/api/v3/user`): 200 for the listed tokens, else 401. */
export function users(accepted: Record<string, string>): Route {
  return (url, method, _body, authorization) => {
    if (method !== 'GET' || !/^\/(api\/v4\/|api\/v3\/)?user$/.test(url.pathname)) return undefined;
    const token = authorization?.replace(/^Bearer /, '') ?? '';
    const name = accepted[token];
    if (name === undefined) return json({ message: '401 Unauthorized' }, 401);
    return json(url.pathname.startsWith('/api/v4') ? { username: name } : { login: name });
  };
}

/** A GraphQL status answer: every alias gets `nodes` (GitLab merge requests or GitHub pull requests), or null. */
export function graphql(host: string, nodes: (alias: string, query: string) => unknown[] | null): Route {
  return (url, method, body) => {
    if (method !== 'POST' || url.host !== host || !url.pathname.endsWith('/graphql')) return undefined;
    const query = (body as { query: string }).query;
    const data: Record<string, unknown> = {};
    for (const match of query.matchAll(/\b(r\d+):\s*(project|repository)\(/g)) {
      const alias = match[1] as string;
      const list = nodes(alias, query);
      data[alias] = list === null ? null : match[2] === 'project' ? { mergeRequests: { nodes: list } } : { pullRequests: { nodes: list } };
    }
    return json({ data });
  };
}

export const MR_142 = {
  iid: '142',
  webUrl: 'https://git.acme.com/payments/billing-api/-/merge_requests/142',
  title: 'feat: ABC-12 Add billing notes',
  draft: false,
  detailedMergeStatus: 'MERGEABLE',
  approvalsRequired: 0,
  approvalsLeft: 0,
  autoMergeEnabled: false,
  diffHeadSha: 'c3d4e5f',
  headPipeline: { status: 'SUCCESS' },
};

export interface UiStub {
  sessions: Partial<Record<'github' | 'github-enterprise', { token: string; username: string }>>;
  /** Answers of the password input, in order; undefined presses Esc */
  pasted: (string | undefined)[];
  /** The validation messages the password input showed */
  messages: string[];
  opened: string[];
  sessionCalls: string[];
  cliCalls: string[];
  /** Output of the fake glab and gh per argument line; a missing line exits 1 */
  cliOutput: Record<string, string>;
}

/**
 * Replaces the interactive parts of sign-in. `glab` and `gh` run as `node test/integration/fixtures/fake-cli.js
 * <command> <args…>` through execFile, answering from `cliOutput`.
 */
export function stubAuthUi(api: TestApi, initial: Partial<UiStub> = {}): UiStub & { restore(): void } {
  const stub: UiStub = { sessions: {}, pasted: [], messages: [], opened: [], sessionCalls: [], cliCalls: [], cliOutput: {}, ...initial };
  const auth = api.providers.auth;
  const ui: AuthUi = {
    session: async (id, mode) => {
      stub.sessionCalls.push(`${id} ${mode}`);
      return stub.sessions[id];
    },
    openExternal: async (url) => {
      stub.opened.push(url);
    },
    password: async (_title, accept) => {
      for (;;) {
        const value = stub.pasted.shift();
        if (value === undefined) return undefined;
        const message = await accept(value);
        if (!message) return value;
        stub.messages.push(message);
      }
    },
    cli: (command, args) => {
      stub.cliCalls.push([command, ...args].join(' '));
      return new Promise((resolve) => {
        execFile(
          process.execPath,
          [fakeCli(), command, ...args],
          { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', REPOHANGAR_FAKE_CLI: JSON.stringify(stub.cliOutput) }, timeout: 10_000 },
          (error, stdout, stderr) => resolve(error ? undefined : `${stdout}${stderr}`),
        );
      });
    },
  };
  auth.ui = ui;
  return Object.assign(stub, { restore: () => (auth.ui = vscodeAuthUi) });
}

function fakeCli(): string {
  // out/test/integration/suite/providers → the repository root
  return join(__dirname, '..', '..', '..', '..', '..', 'test', 'integration', 'fixtures', 'fake-cli.js');
}

// ---------------------------------------------------------------------------------------------------------------
// Merge request creation (add-mr-creation)

export function gitIn(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', ['-c', 'user.name=Ana Pérez', '-c', 'user.email=ana@acme.test', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

/**
 * Puts the repository on a new branch from origin/main with `commits` commits; `publish` pushes it with upstream and
 * `aheadOfUpstream` adds commits after that. Waits until the row shows the branch.
 */
export async function onNewBranch(
  api: TestApi,
  path: string,
  branch: string,
  options: { commits?: number; publish?: boolean; aheadOfUpstream?: number } = {},
): Promise<RowData> {
  gitIn(path, 'checkout', '-q', '--no-track', '-B', branch, 'origin/main');
  const commit = (n: number, tag: string) => {
    for (let i = 1; i <= n; i++) {
      writeFileSync(join(path, `${tag}-${i}-${Date.now()}.md`), `${tag} ${i}\n`);
      gitIn(path, 'add', '.');
      gitIn(path, 'commit', '-q', '-m', `${tag} change ${i}`);
    }
  };
  commit(options.commits ?? 2, 'feature');
  if (options.publish) gitIn(path, 'push', '-q', '-u', 'origin', branch);
  commit(options.aheadOfUpstream ?? 0, 'ahead');
  const id = api.registry.ids().find((i) => api.registry.repository(i)?.rootUri.fsPath.toLowerCase() === path.toLowerCase()) as string;
  await api.registry.repository(id)?.status();
  await api.store.recompute(id);
  return waitFor(() => {
    const row = api.store.get(id);
    return row?.head.kind === 'branch' && row.head.name === branch ? row : undefined;
  }, `${branch} in the row`);
}

/** GitLab answers for creation: no open merge request, users, the project, and the create and close requests. */
export function gitlabCreateRoutes(options: { iid?: number; squashOption?: string } = {}): Route[] {
  const ids: Record<string, number> = { 'ana.perez': 11, 'luis.gomez': 12, 'carla.ruiz': 13 };
  const byId = Object.fromEntries(Object.entries(ids).map(([n, id]) => [id, n]));
  return [
    users({ 'glpat-x1y2': 'carla.ruiz' }),
    graphql('git.acme.com', () => []),
    (url, method) => {
      if (url.host !== 'git.acme.com' || method !== 'GET' || url.pathname !== '/api/v4/users') return undefined;
      const name = url.searchParams.get('username') ?? '';
      return json(ids[name] ? [{ id: ids[name], username: name }] : []);
    },
    (url, method) =>
      url.host === 'git.acme.com' && method === 'GET' && /^\/api\/v4\/projects\/[^/]+$/.test(url.pathname)
        ? json({ id: 31, default_branch: 'main', squash_option: options.squashOption ?? 'default_off' })
        : undefined,
    (url, method, body) => {
      if (url.host !== 'git.acme.com' || method !== 'POST' || !url.pathname.endsWith('/merge_requests')) return undefined;
      const b = body as { reviewer_ids?: number[]; assignee_ids?: number[]; labels?: string; title: string };
      const iid = options.iid ?? 142;
      return json(
        {
          iid,
          web_url: `https://git.acme.com/payments/billing-api/-/merge_requests/${iid}`,
          title: b.title,
          reviewers: (b.reviewer_ids ?? []).map((id) => ({ id, username: byId[id] })),
          assignees: (b.assignee_ids ?? []).map((id) => ({ id, username: byId[id] })),
          labels: b.labels ? b.labels.split(',') : [],
        },
        201,
      );
    },
    (url, method) => (url.host === 'git.acme.com' && method === 'PUT' && /\/merge_requests\/\d+$/.test(url.pathname) ? json({ state: 'closed' }) : undefined),
  ];
}

export interface CreateSession {
  http: ReturnType<typeof answerHttp>;
  ui: ReturnType<typeof stubAuthUi>;
  /** URLs the creation opened in the browser */
  opened: string[];
  /** The models the quick create input was shown with; `answers` answers them in order (undefined is Esc) */
  quickInputs: QuickCreateModel[];
  answers: (QuickCreateChoice | ((model: QuickCreateModel) => QuickCreateChoice))[];
  /** A new branch of `options` in the repository, checked out until `finish` */
  branch(name: string, branch: string, options?: Parameters<typeof onNewBranch>[3]): Promise<RowData>;
  /** The create requests sent */
  creates(): SentRequest[];
  finish(): Promise<void>;
}

/**
 * Records the integrations, dismisses every notification, signs in to git.acme.com (unless `signedIn` is false),
 * answers GitLab's creation requests and replaces the browser and the quick create input.
 */
export async function startCreating(api: TestApi, options: { signedIn?: boolean; routes?: Route[] } = {}): Promise<CreateSession> {
  const stop = recordIntegrations(api);
  api.notifier.answer = () => undefined;
  const ui = stubAuthUi(api, { pasted: ['glpat-x1y2'] });
  const http = answerHttp(api, [...(options.routes ?? []), ...gitlabCreateRoutes()]);
  if (options.signedIn !== false) await api.providers.auth.signIn('git.acme.com');
  const opened: string[] = [];
  api.mr.openUrl = async (url) => opened.push(url);
  const quickInputs: QuickCreateModel[] = [];
  const answers: CreateSession['answers'] = [];
  const previousUi = api.mr.ui;
  api.mr.ui = {
    quickCreate: async (model) => {
      quickInputs.push(model);
      const answer = answers.shift();
      return typeof answer === 'function' ? answer(model) : answer;
    },
  };
  const branches: { path: string; branch: string; back: string }[] = [];
  http.requests.length = 0;
  return {
    http,
    ui,
    opened,
    quickInputs,
    answers,
    async branch(name, branch, branchOptions) {
      const path = api.store.all().find((r) => r.name === name)?.path as string;
      branches.push({ path, branch, back: gitIn(path, 'branch', '--show-current').trim() });
      return onNewBranch(api, path, branch, branchOptions);
    },
    creates: () => http.requests.filter((r) => r.method === 'POST' && r.url.endsWith('/merge_requests')),
    async finish() {
      api.mr.ui = previousUi;
      for (const key of ['mr.profiles', 'mr.quickCreate', 'gitlab.usePushOptions']) {
        await vscode.workspace.getConfiguration('repohangar').update(key, undefined, vscode.ConfigurationTarget.Global);
      }
      await api.providers.signOut('git.acme.com');
      for (const { path, branch, back } of branches.reverse()) {
        gitIn(path, 'checkout', '-q', '-f', back);
        gitIn(path, 'branch', '-q', '-D', branch);
      }
      http.restore();
      ui.restore();
      stop();
    },
  };
}
