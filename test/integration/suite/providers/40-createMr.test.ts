// mr-creation :: Push matrix (R1–R5), One keystroke on an unpublished branch, Sign in continues the creation, Create a
// branch from the target guard, Undo within 30 seconds, Undo after 30 seconds, m pressed twice. Real repositories with
// a bare remote; the providers answer through the stubbed fetch.

import * as assert from 'node:assert/strict';
import type { TestApi } from '../../../../src/extension';
import type { Repository } from '../../../../src/git/git';
import { idOf, ready, recordIntegrations, rowNamed, setConfig, waitFor } from '../helpers';
import { answerHttp, gitIn, gitlabCreateRoutes, graphql, json, onNewBranch, stubAuthUi, users, type Route } from './support';

const CREATE_URL = 'https://git.acme.com/api/v4/projects/payments%2Fbilling-api/merge_requests';

/** GitHub answers for web-shop: no open pull request, the repository, and #311 on create. */
function githubCreateRoutes(): Route[] {
  return [
    graphql('api.github.com', () => []),
    (url, method) =>
      url.host === 'api.github.com' && method === 'GET' && url.pathname === '/repos/acme/web-shop'
        ? json({ default_branch: 'main', allow_squash_merge: true, allow_auto_merge: true, delete_branch_on_merge: false })
        : undefined,
    (url, method) =>
      url.host === 'api.github.com' && method === 'POST' && url.pathname === '/repos/acme/web-shop/pulls'
        ? json({ number: 311, html_url: 'https://github.com/acme/web-shop/pull/311' }, 201)
        : undefined,
    (url, method) => (url.host === 'api.github.com' && method === 'POST' && /\/(requested_reviewers|assignees|labels)$/.test(url.pathname) ? json({}, 201) : undefined),
    (url, method) => (url.host === 'api.github.com' && method === 'PATCH' ? json({ state: 'closed' }) : undefined),
  ];
}

describe('Create with defaults', () => {
  let api: TestApi;
  let stop: () => void;
  let ui: ReturnType<typeof stubAuthUi>;
  let http: ReturnType<typeof answerHttp>;
  let opened: string[];
  let pushes: unknown[][];
  let restorePush: () => void;
  let failPush: string | undefined;
  let branches: { path: string; branch: string; back: string }[];

  const billing = () => rowNamed(api, 'billing-api')?.path as string;
  const webShop = () => rowNamed(api, 'web-shop')?.path as string;
  const press = (name: string, action: 'createMr' | 'createMrEdit' = 'createMr') =>
    api.dashboard.receiveForTest({ type: 'runAction', id: idOf(api, name), action });
  const creates = (url = CREATE_URL) => http.requests.filter((r) => r.method === 'POST' && r.url === url);
  const shown = (start: string) => api.notifier.shown.find((n) => n.text.startsWith(start));

  async function branch(path: string, name: string, options: Parameters<typeof onNewBranch>[3] = {}) {
    branches.push({ path, branch: name, back: gitIn(path, 'branch', '--show-current').trim() });
    return onNewBranch(api, path, name, options);
  }

  before(async () => {
    api = await ready(6);
    api.providers.focusOverride = true;
  });

  beforeEach(async () => {
    stop = recordIntegrations(api);
    // Every notification is dismissed unless a test clicks a button.
    api.notifier.answer = () => undefined;
    branches = [];
    ui = stubAuthUi(api, { pasted: ['glpat-x1y2'] });
    http = answerHttp(api, [...gitlabCreateRoutes(), users({ gho_session: 'ana-perez' }), ...githubCreateRoutes()]);
    assert.equal(await api.providers.auth.signIn('git.acme.com'), true);
    opened = [];
    api.mr.openUrl = async (url) => opened.push(url);
    // repository.push of the Git extension, recorded; `failPush` makes it fail like Git does.
    pushes = [];
    failPush = undefined;
    const repository = api.registry.repository(idOf(api, 'billing-api')) as Repository;
    const original = repository.push;
    repository.push = async (...args: unknown[]) => {
      pushes.push(args);
      if (failPush) throw Object.assign(new Error('Failed to execute git'), { stderr: failPush });
      return (original as (...a: unknown[]) => Promise<void>).apply(repository, args);
    };
    restorePush = () => (repository.push = original);
    http.requests.length = 0;
  });

  afterEach(async () => {
    restorePush();
    api.mr.now = () => Date.now();
    await setConfig('repohangar.mr.profiles', undefined);
    await api.providers.signOut('git.acme.com');
    await api.providers.signOut('github.com');
    for (const { path, branch: name, back } of branches.reverse()) {
      gitIn(path, 'checkout', '-q', '-f', back);
      gitIn(path, 'branch', '-q', '-D', name);
    }
    http.restore();
    ui.restore();
    stop();
  });

  describe('Push matrix', () => {
    it('R1 publishes a branch without upstream, then creates', async () => {
      await branch(billing(), 'feature/ABC-12-push-r1');
      await press('billing-api');
      assert.deepEqual(pushes, [['origin', 'feature/ABC-12-push-r1', true]]);
      assert.equal(creates().length, 1);
      assert.match(shown('Created !142')?.text ?? '', /^Created !142 in billing-api \(pushed 2 commits\)/);
      assert.equal(gitIn(billing(), 'rev-parse', 'HEAD'), gitIn(billing(), 'rev-parse', 'refs/remotes/origin/feature/ABC-12-push-r1'));
    });

    it('R2 pushes a branch 2 commits ahead of its upstream, then creates', async () => {
      await branch(billing(), 'feature/ABC-12-push-r2', { commits: 1, publish: true, aheadOfUpstream: 2 });
      await waitFor(() => (rowNamed(api, 'billing-api')?.head as { ahead?: number }).ahead === 2, 'ahead 2');
      await press('billing-api');
      assert.deepEqual(pushes, [[]]);
      assert.equal(creates().length, 1);
      assert.match(shown('Created !142')?.text ?? '', /^Created !142 in billing-api \(pushed 2 commits\)/);
    });

    it('R3 creates without a push when the branch is level with its upstream', async () => {
      await branch(billing(), 'feature/ABC-12-push-r3', { publish: true });
      await press('billing-api');
      assert.deepEqual(pushes, []);
      assert.equal(creates().length, 1);
      const text = shown('Created !142')?.text ?? '';
      assert.match(text, /^Created !142 in billing-api/);
      assert.ok(!text.includes('pushed'), text);
    });

    it('R4 stops with Push when pushIfNeeded is false', async () => {
      await setConfig('repohangar.mr.profiles', { default: { pushIfNeeded: false } });
      await branch(billing(), 'feature/ABC-12-push-r4');
      await press('billing-api');
      assert.deepEqual(pushes, []);
      assert.equal(creates().length, 0);
      assert.deepEqual(
        api.notifier.shown.map((n) => [n.text, n.buttons]),
        [['feature/ABC-12-push-r4 is not pushed to origin. Push it, or set "pushIfNeeded": true in the MR profile.', ['Push']]],
      );
    });

    it('R5 stops with Show Git Output when the push fails', async () => {
      await branch(billing(), 'feature/ABC-12-push-r5');
      failPush = 'Permission denied (publickey)\nfatal: Could not read from remote repository.';
      await press('billing-api');
      assert.deepEqual(pushes, [['origin', 'feature/ABC-12-push-r5', true]]);
      assert.equal(creates().length, 0);
      assert.deepEqual(
        api.notifier.shown.map((n) => [n.text, n.buttons]),
        [['Push failed in billing-api: Permission denied (publickey)', ['Show Git Output']]],
      );
      assert.deepEqual(rowNamed(api, 'billing-api')?.job, {
        action: 'createMr',
        state: 'failed',
        detail: 'Push failed in billing-api: Permission denied (publickey)',
      });
    });
  });

  it('creates with one keystroke on an unpublished branch: push, one request with every field, no dialog', async () => {
    await setConfig('repohangar.mr.profiles', {
      default: { reviewers: ['ana.perez', 'luis.gomez'], labels: ['needs-review'], squash: true, deleteSourceBranch: true },
    });
    await branch(billing(), 'feature/ABC-12-one-key');
    let quickInputs = 0;
    const previousUi = api.mr.ui;
    api.mr.ui = { quickCreate: async () => (quickInputs++, undefined) };
    try {
      await press('billing-api');
    } finally {
      api.mr.ui = previousUi;
    }
    assert.deepEqual(pushes, [['origin', 'feature/ABC-12-one-key', true]]);
    const sent = creates();
    assert.equal(sent.length, 1);
    const body = sent[0]?.body as Record<string, unknown>;
    assert.equal(body.source_branch, 'feature/ABC-12-one-key');
    assert.equal(body.target_branch, 'main');
    assert.deepEqual(body.reviewer_ids, [11, 12]);
    assert.equal(body.labels, 'needs-review');
    assert.equal(body.squash, true);
    assert.equal(body.remove_source_branch, true);
    assert.equal(quickInputs, 0);
    assert.ok(!api.dashboard.postedMessages.some((m) => m.type === 'drawer'));
    // The result is the first notification of the creation: nothing asked before it.
    assert.match(api.notifier.shown[0]?.text ?? '', /^Created !142 in billing-api \(pushed 2 commits\): reviewers ana\.perez, luis\.gomez/);
  });

  it('continues the creation after Sign In…', async () => {
    await branch(webShop(), 'feature/ABC-12-sign-in', { commits: 3 });
    ui.sessions.github = { token: 'gho_session', username: 'ana-perez' };
    api.notifier.answer = (n) => (n.text === 'Sign in to github.com to create pull requests.' ? 'Sign In…' : undefined);
    await press('web-shop');
    assert.ok(ui.sessionCalls.includes('github create'), JSON.stringify(ui.sessionCalls));
    assert.equal(creates('https://api.github.com/repos/acme/web-shop/pulls').length, 1);
    assert.ok(shown('Created #311 in web-shop'), JSON.stringify(api.notifier.shown));
  });

  it('runs git.branch on billing-api from Create Branch… of the target guard', async () => {
    branches.push({ path: billing(), branch: 'mr-guard-scratch', back: gitIn(billing(), 'branch', '--show-current').trim() });
    gitIn(billing(), 'checkout', '-q', '-B', 'mr-guard-scratch');
    gitIn(billing(), 'checkout', '-q', 'main');
    await api.registry.repository(idOf(api, 'billing-api'))?.status();
    await waitFor(() => (rowNamed(api, 'billing-api')?.head as { name?: string }).name === 'main', 'billing-api on main');
    let branchArgs: unknown[] | undefined;
    api.commands.overrides.set('git.branch', async (...args) => (branchArgs = args));
    api.notifier.answer = (n) => (n.text === "You're on main. Create a branch for your changes first." ? 'Create Branch…' : undefined);
    await press('billing-api');
    assert.equal(creates().length, 0);
    const repository = branchArgs?.[0] as Repository | undefined;
    assert.equal(repository?.rootUri.fsPath.toLowerCase(), billing().toLowerCase());
  });

  it('closes the merge request with Undo within 30 s and keeps the branch', async () => {
    await branch(billing(), 'feature/ABC-12-undo');
    let clock = Date.now();
    api.mr.now = () => clock;
    api.notifier.answer = (n) => {
      if (!n.text.startsWith('Created !142')) return undefined;
      clock += 12_000;
      return 'Undo';
    };
    const before: string[] = [];
    await press('billing-api');
    // The refs as the push left them.
    before.push(gitIn(billing(), 'rev-parse', 'refs/heads/feature/ABC-12-undo'), gitIn(billing(), 'rev-parse', 'refs/remotes/origin/feature/ABC-12-undo'));
    await waitFor(() => shown('Closed !142'), 'the Undo result');
    const close = http.requests.filter((r) => r.method === 'PUT');
    assert.deepEqual(
      close.map((r) => [r.url, r.body]),
      [[`${CREATE_URL}/142`, { state_event: 'close' }]],
    );
    assert.equal(shown('Closed !142')?.text, 'Closed !142. The branch feature/ABC-12-undo was kept.');
    assert.deepEqual(
      [gitIn(billing(), 'rev-parse', 'refs/heads/feature/ABC-12-undo'), gitIn(billing(), 'rev-parse', 'refs/remotes/origin/feature/ABC-12-undo')],
      before,
    );
    assert.equal(gitIn(pushUrl(billing()), 'rev-parse', 'refs/heads/feature/ABC-12-undo'), before[1]);
  });

  it('sends nothing for Undo after 30 s and offers Open PR', async () => {
    await branch(webShop(), 'feature/ABC-12-late-undo', { commits: 1 });
    ui.sessions.github = { token: 'gho_session', username: 'ana-perez' };
    assert.equal(await api.providers.auth.signIn('github.com'), true);
    let clock = Date.now();
    api.mr.now = () => clock;
    api.notifier.answer = (n) => {
      if (!n.text.startsWith('Created #311')) return undefined;
      clock += 40_000;
      return 'Undo';
    };
    http.requests.length = 0;
    await press('web-shop');
    await waitFor(() => shown('Undo is no longer'), 'the expired Undo');
    assert.deepEqual(
      [shown('Undo is no longer')?.text, shown('Undo is no longer')?.buttons],
      ['Undo is no longer available for #311.', ['Open PR']],
    );
    assert.deepEqual(http.requests.filter((r) => r.method === 'PATCH'), []);
  });

  it('sends one create request when m is pressed twice', async () => {
    await branch(billing(), 'feature/ABC-12-twice');
    await Promise.all([press('billing-api'), press('billing-api')]);
    assert.equal(creates().length, 1);
  });
});

/** The bare remote billing-api pushes to. */
function pushUrl(path: string): string {
  return gitIn(path, 'remote', 'get-url', '--push', 'origin').trim();
}
