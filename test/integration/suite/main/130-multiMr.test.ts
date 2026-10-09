// mr-creation :: Three linked merge requests in two keystrokes, Confirmation before a selection and Retry after a
// failed push. Temp clones of their own bare remotes: the fetch URL names git.acme.com or github.com, the push URL is
// the bare remote; GitLab and GitHub answer through the stubbed fetch, which counts every request.

import * as assert from 'node:assert/strict';
import { chmodSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestApi } from '../../../../src/extension';
import type { BatchConfirmModel } from '../../../../src/mr/service';
import { commit, git } from '../../fixtures/repos';
import { ready, recordIntegrations, setConfig } from '../helpers';
import { answerHttp, graphql, json, stubAuthUi, users, type Route, type SentRequest } from '../providers/support';
import { closeTempRepos, openTempRepo, type TempRepo } from '../tempRepos';

const BRANCH = 'feature/ABC-12-notes';
const IIDS: Record<string, number> = { 'mr-billing': 142, 'mr-ledger': 143, 'mr-infra': 20, 'mr2-billing': 142, 'mr2-ledger': 143 };

/** GitLab and GitHub answers for creation and the description updates, per project. */
function routes(): Route[] {
  const project = (url: URL) => decodeURIComponent(/\/projects\/([^/]+)/.exec(url.pathname)?.[1] ?? '');
  return [
    users({ 'glpat-x1y2': 'carla.ruiz', gho_session: 'ana-perez' }),
    graphql('git.acme.com', () => []),
    graphql('api.github.com', () => []),
    (url, method) =>
      url.host === 'git.acme.com' && method === 'GET' && url.pathname === '/api/v4/users'
        ? json([{ id: 13, username: url.searchParams.get('username') }])
        : undefined,
    (url, method) =>
      url.host === 'git.acme.com' && method === 'GET' && /^\/api\/v4\/projects\/[^/]+$/.test(url.pathname)
        ? json({ id: 31, default_branch: 'main', squash_option: 'default_off' })
        : undefined,
    (url, method) => {
      if (url.host !== 'git.acme.com' || method !== 'POST' || !url.pathname.endsWith('/merge_requests')) return undefined;
      const path = project(url);
      const iid = IIDS[path.split('/')[1] as string] ?? 1;
      return json({ iid, web_url: `https://git.acme.com/${path}/-/merge_requests/${iid}`, reviewers: [], assignees: [], labels: [] }, 201);
    },
    (url, method) => (url.host === 'git.acme.com' && method === 'PUT' && /\/merge_requests\/\d+$/.test(url.pathname) ? json({}) : undefined),
    (url, method) =>
      url.host === 'api.github.com' && method === 'GET' && url.pathname === '/repos/acme/mr-web'
        ? json({ default_branch: 'main', allow_squash_merge: true, allow_auto_merge: true, delete_branch_on_merge: false })
        : undefined,
    (url, method) =>
      url.host === 'api.github.com' && method === 'POST' && url.pathname === '/repos/acme/mr-web/pulls'
        ? json({ number: 311, html_url: 'https://github.com/acme/mr-web/pull/311' }, 201)
        : undefined,
    (url, method) => (url.host === 'api.github.com' && method === 'PATCH' && url.pathname === '/repos/acme/mr-web/pulls/311' ? json({}) : undefined),
  ];
}

/** On feature/ABC-12-notes with 2 commits ahead of main, fetch URL on its host, pushes to its bare remote. */
function feature(host: 'gitlab' | 'github', name: string) {
  return (path: string) => {
    const bare = git(path, 'remote', 'get-url', 'origin').trim();
    git(path, 'remote', 'set-url', 'origin', host === 'gitlab' ? `https://git.acme.com/payments/${name}.git` : `https://github.com/acme/${name}.git`);
    git(path, 'remote', 'set-url', '--push', 'origin', bare);
    git(path, 'checkout', '-b', BRANCH);
    commit(path, 'notes.md', 'Add notes field to invoice');
    commit(path, 'pdf.md', 'Expose notes in PDF');
  };
}

describe('merge requests on a selection', () => {
  let api: TestApi;
  let http: ReturnType<typeof answerHttp>;
  let ui: ReturnType<typeof stubAuthUi>;
  let stop: () => void;
  let confirms: BatchConfirmModel[];
  let confirmAnswer: boolean;
  const repos: TempRepo[] = [];

  const open = async (host: 'gitlab' | 'github', name: string) => {
    const repo = await openTempRepo(api, name, feature(host, name));
    repos.push(repo);
    return repo;
  };
  const sent = (method: string, host?: string) => http.requests.filter((r) => r.method === method && (!host || new URL(r.url).host === host));
  const creates = () => http.requests.filter((r) => r.method === 'POST' && /\/(merge_requests|pulls)$/.test(r.url));
  const updates = () => http.requests.filter((r) => r.method === 'PUT' || r.method === 'PATCH');
  const description = (r: SentRequest) => (r.body as { description?: string; body?: string }).description ?? (r.body as { body: string }).body;
  /** Select the rows (Space or Ctrl+A in the webview), then press m. */
  const pressM = async (selected: TempRepo[]) => {
    const ids = selected.map((r) => r.id);
    await api.dashboard.receiveForTest({ type: 'setSelection', ids });
    await api.dashboard.receiveForTest({ type: 'createMrs', ids });
  };

  before(async () => {
    api = await ready(14);
    await setConfig('repohangar.hosts', { 'git.acme.com': 'gitlab' });
    stop = recordIntegrations(api);
    api.notifier.answer = () => undefined;
    ui = stubAuthUi(api, { pasted: ['glpat-x1y2'], sessions: { github: { token: 'gho_session', username: 'ana-perez' } } });
    http = answerHttp(api, routes());
    api.mr.batchUi = {
      confirmBatch: async (model) => {
        confirms.push(model);
        return confirmAnswer;
      },
    };
  });
  beforeEach(() => {
    confirms = [];
    confirmAnswer = true;
  });
  after(async () => {
    await setConfig('repohangar.mr.quickCreate', undefined);
    await api.providers.signOut('git.acme.com');
    await api.providers.signOut('github.com');
    await closeTempRepos(api, repos);
    await setConfig('repohangar.hosts', undefined);
    api.dashboard.selection = [];
    http.restore();
    ui.restore();
    stop();
  });

  it('creates 3 linked merge requests in two keystrokes', async () => {
    const billing = await open('gitlab', 'mr-billing');
    const ledger = await open('gitlab', 'mr-ledger');
    const web = await open('github', 'mr-web');
    // A host is known once a listed repository uses it.
    assert.equal(await api.providers.auth.signIn('git.acme.com'), true);
    assert.equal(await api.providers.auth.signIn('github.com'), true);
    http.requests.length = 0;
    await pressM([billing, ledger, web]);

    assert.deepEqual(confirms, []);
    assert.deepEqual(creates().map((r) => new URL(r.url).host).sort(), ['api.github.com', 'git.acme.com', 'git.acme.com']);
    const written = updates();
    assert.deepEqual(written.map((r) => `${r.method} ${new URL(r.url).pathname}`).sort(), [
      'PATCH /repos/acme/mr-web/pulls/311',
      'PUT /api/v4/projects/payments%2Fmr-billing/merge_requests/142',
      'PUT /api/v4/projects/payments%2Fmr-ledger/merge_requests/143',
    ]);
    const links = {
      'mr-billing': '- mr-billing !142 https://git.acme.com/payments/mr-billing/-/merge_requests/142',
      'mr-ledger': '- mr-ledger !143 https://git.acme.com/payments/mr-ledger/-/merge_requests/143',
      'mr-web': '- mr-web #311 https://github.com/acme/mr-web/pull/311',
    };
    for (const r of written) {
      const text = description(r);
      const self = Object.keys(links).find((name) => r.url.includes(name)) as keyof typeof links;
      const others = Object.entries(links).filter(([name]) => name !== self).map(([, line]) => line);
      assert.ok(text.includes(`Related:\n${others.join('\n')}\n<!-- /repohangar:related -->`), `${self}: ${text}`);
      assert.equal(text.split('<!-- repohangar:related -->').length, 2);
    }
    // Each branch was published to its bare remote.
    for (const repo of [billing, ledger, web]) assert.equal(git(repo.path, 'rev-parse', '--abbrev-ref', '@{u}').trim(), `origin/${BRANCH}`);
    const panel = api.actions.results.panel();
    assert.equal(panel?.title, `Create MRs — ${BRANCH}`);
    assert.deepEqual(panel?.lines.map((l) => l.text), [
      '✓ mr-billing  !142  git.acme.com/payments/mr-billing  (pushed 2)',
      '✓ mr-ledger  !143  git.acme.com/payments/mr-ledger  (pushed 2)',
      '✓ mr-web  #311  github.com/acme/mr-web  (pushed 2)',
    ]);
    assert.equal(panel?.note, 'Related links added to all 3 descriptions.');
    assert.equal(panel?.links, true);
  });

  it('asks once before a selection with "confirm", and sends nothing on Esc', async () => {
    await setConfig('repohangar.mr.quickCreate', 'confirm');
    const [billing, ledger, web] = repos as [TempRepo, TempRepo, TempRepo];
    confirmAnswer = false;
    http.requests.length = 0;
    const processes = api.gitProcessLog.length;
    await pressM([billing, ledger, web]);
    assert.deepEqual(confirms, [
      {
        title: 'Create merge requests in 3 repositories',
        label: 'Create 3',
        detail: `mr-billing main ← ${BRANCH} · mr-ledger main ← ${BRANCH} · mr-web main ← ${BRANCH}`,
      },
    ]);
    assert.deepEqual(http.requests, []);
    assert.ok(!api.gitProcessLog.slice(processes).some((c) => c.args[0] === 'push'));
    await setConfig('repohangar.mr.quickCreate', undefined);
  });

  it('retries a failed push, then links all three merge requests again', async () => {
    const billing = await open('gitlab', 'mr2-billing');
    const ledger = await open('gitlab', 'mr2-ledger');
    const infra = await open('gitlab', 'mr-infra');
    const hook = join(infra.bare, 'hooks', 'pre-receive');
    writeFileSync(hook, '#!/bin/sh\necho "Permission denied (publickey)" >&2\nexit 1\n');
    chmodSync(hook, 0o755);
    http.requests.length = 0;
    await pressM([billing, ledger, infra]);
    const failed = api.actions.results.lineOf(infra.id);
    assert.equal(failed?.state, 'failed');
    assert.match(failed?.text ?? '', /^✗ mr-infra {2}push failed: /);
    assert.equal(api.actions.results.panel()?.canRetry, true);
    assert.deepEqual(updates().map((r) => new URL(r.url).pathname).sort(), [
      '/api/v4/projects/payments%2Fmr2-billing/merge_requests/142',
      '/api/v4/projects/payments%2Fmr2-ledger/merge_requests/143',
    ]);

    rmSync(hook);
    http.requests.length = 0;
    await api.dashboard.receiveForTest({ type: 'retryFailed' });
    assert.deepEqual(creates().map((r) => new URL(r.url).pathname), ['/api/v4/projects/payments%2Fmr-infra/merge_requests']);
    assert.equal(git(infra.path, 'rev-parse', '--abbrev-ref', '@{u}').trim(), `origin/${BRANCH}`);
    const written = updates();
    assert.deepEqual(written.map((r) => new URL(r.url).pathname).sort(), [
      '/api/v4/projects/payments%2Fmr-infra/merge_requests/20',
      '/api/v4/projects/payments%2Fmr2-billing/merge_requests/142',
      '/api/v4/projects/payments%2Fmr2-ledger/merge_requests/143',
    ]);
    for (const r of written) {
      const text = description(r);
      const listed = ['mr-infra !20', 'mr2-billing !142', 'mr2-ledger !143'].filter((ref) => text.includes(`- ${ref} `));
      assert.equal(listed.length, 2, text);
      assert.equal(text.split('<!-- repohangar:related -->').length, 2);
    }
    assert.equal(api.actions.results.lineOf(infra.id)?.text, '✓ mr-infra  !20  git.acme.com/payments/mr-infra  (pushed 2)');
    assert.equal(api.actions.results.panel()?.note, 'Related links added to all 3 descriptions.');
  });
});
