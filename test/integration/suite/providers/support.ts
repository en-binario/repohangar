// Answers for the provider requests of the extension under test, and the interactive parts of sign-in.

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import type { TestApi } from '../../../../src/extension';
import { vscodeAuthUi, type AuthUi } from '../../../../src/providers/auth';

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
