// mr-creation :: Push-options result, Push rejected for authentication, Add the reviewers after connecting. git.acme.com
// has no token; billing-api pushes to a bare remote that accepts push options and prints GitLab's `remote:` lines
// from a pre-receive hook, or to a local HTTP server that answers 401.

import * as assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { TestApi } from '../../../../src/extension';
import { reviewCell } from '../../../../src/shared/review';
import { idOf, ready, rowNamed, setConfig, waitFor } from '../helpers';
import { MR_142, gitIn, graphql, startCreating, type CreateSession } from './support';

// GitLab's answer to a push that created a merge request, printed by the hook (git adds `remote: `).
const HOOK = [
  '#!/bin/sh',
  'cat > /dev/null',
  'i=0',
  'while [ "$i" -lt "${GIT_PUSH_OPTION_COUNT:-0}" ]; do',
  '  eval "echo \\"\\$GIT_PUSH_OPTION_$i\\"" >> push-options.txt',
  '  i=$((i + 1))',
  'done',
  'echo ""',
  'echo "View merge request for $(git rev-parse --abbrev-ref HEAD 2>/dev/null || true):"',
  'echo "  https://git.acme.com/payments/billing-api/-/merge_requests/142"',
  'echo ""',
  '',
].join('\n');

describe('GitLab push options', () => {
  let api: TestApi;
  let session: CreateSession;
  let bare: string;

  const billing = () => rowNamed(api, 'billing-api')?.path as string;
  const press = () => api.dashboard.receiveForTest({ type: 'runAction', id: idOf(api, 'billing-api'), action: 'createMr' });
  const toAcme = () => session.http.requests.filter((r) => new URL(r.url).host === 'git.acme.com');

  before(async () => {
    api = await ready(6);
    api.providers.focusOverride = true;
  });

  async function withoutToken(routes: Parameters<typeof startCreating>[1] = {}): Promise<void> {
    session = await startCreating(api, { signedIn: false, ...routes });
    await api.providers.signOut('git.acme.com');
    api.providers.auth.forget('git.acme.com');
    await waitFor(() => api.providers.auth.hostState('git.acme.com') === 'none', 'git.acme.com without a credential');
    await setConfig('repohangar.mr.profiles', { default: { reviewers: ['ana.perez', 'luis.gomez'], description: 'Ticket {ticket}' } });
    bare = gitIn(billing(), 'remote', 'get-url', '--push', 'origin').trim();
    gitIn(bare, 'config', 'receive.advertisePushOptions', 'true');
    writeFileSync(join(bare, 'hooks', 'pre-receive'), HOOK, { mode: 0o755 });
    rmSync(join(bare, 'push-options.txt'), { force: true });
    session.http.requests.length = 0;
  }

  afterEach(async () => {
    rmSync(join(bare, 'hooks', 'pre-receive'), { force: true });
    rmSync(join(bare, 'push-options.txt'), { force: true });
    gitIn(bare, 'config', '--unset', 'receive.advertisePushOptions');
    await session.finish();
  });

  it('pushes with the options and reports the merge request GitLab created, without reviewers', async () => {
    await withoutToken();
    await session.branch('billing-api', 'feature/ABC-12-push-options');
    await press();
    const result = api.notifier.shown.find((n) => n.text.startsWith('Pushed'));
    assert.deepEqual(
      [result?.text, result?.buttons],
      [
        'Pushed 2 commits; GitLab reports !142 for feature/ABC-12-push-options in billing-api without reviewers (ana.perez, luis.gomez)',
        ['Open MR', 'Copy link', 'Connect git.acme.com'],
      ],
    );
    assert.deepEqual(toAcme(), []);
    const options = readFileSync(join(bare, 'push-options.txt'), 'utf8').trim().split(/\r?\n/);
    assert.deepEqual(options.slice(0, 2), ['merge_request.create', 'merge_request.target=main']);
    assert.ok(options.includes('merge_request.description=Ticket ABC-12'), options.join(' | '));
    assert.ok(options.some((o) => o.startsWith('merge_request.title=feat: ABC-12')), options.join(' | '));
    assert.equal(gitIn(billing(), 'rev-parse', 'HEAD'), gitIn(billing(), 'rev-parse', 'refs/remotes/origin/feature/ABC-12-push-options'));
    const cell = await waitFor(() => {
      const c = reviewCell(rowNamed(api, 'billing-api')?.review, Date.now());
      return c.kind === 'pushed' ? c : undefined;
    }, 'the pushed cell');
    assert.deepEqual([cell.text, cell.tooltip], ['!142', 'Created during the push. Sign in to git.acme.com to see its status.']);
  });

  it('adds the reviewers with one PUT after Connect git.acme.com', async () => {
    await withoutToken({ routes: [graphql('git.acme.com', () => [MR_142])] });
    await session.branch('billing-api', 'feature/ABC-12-connect');
    api.notifier.answer = (n) => (n.text.startsWith('Pushed') ? 'Connect git.acme.com' : undefined);
    await press();
    const puts = await waitFor(() => {
      const sent = session.http.requests.filter((r) => r.method === 'PUT');
      return sent.length ? sent : undefined;
    }, 'the PUT');
    assert.deepEqual(
      puts.map((r) => [r.url, (r.body as { reviewer_ids: number[] }).reviewer_ids]),
      [['https://git.acme.com/api/v4/projects/payments%2Fbilling-api/merge_requests/142', [11, 12]]],
    );
    await waitFor(() => rowNamed(api, 'billing-api')?.review?.kind === 'loaded', 'the review loaded with the new token');
    assert.ok(reviewCell(rowNamed(api, 'billing-api')?.review, Date.now()).text.startsWith('!142'));
  });

  describe('rejected for authentication', () => {
    let server: Server;
    const env = ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0'] as const;
    let previousEnv: Record<string, string | undefined>;
    let previousUrl: string;

    afterEach(async () => {
      gitIn(billing(), 'remote', 'set-url', '--push', 'origin', previousUrl);
      for (const key of env) {
        if (previousEnv[key] === undefined) delete process.env[key];
        else process.env[key] = previousEnv[key];
      }
      await new Promise((resolve) => server.close(resolve));
    });

    it('stops with the Git message, Connect and Show Output, and sends no request', async () => {
      await withoutToken();
      server = createServer((_req, res) => {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="GitLab"' });
        res.end();
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;
      // No credential helper: the rejected user and password in the URL are final.
      previousEnv = Object.fromEntries(env.map((k) => [k, process.env[k]]));
      Object.assign(process.env, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: '' });
      previousUrl = gitIn(billing(), 'remote', 'get-url', '--push', 'origin').trim();
      gitIn(billing(), 'remote', 'set-url', '--push', 'origin', `http://ana:wrong@127.0.0.1:${port}/payments/billing-api.git`);
      await session.branch('billing-api', 'feature/ABC-12-auth-failed');
      await press();
      assert.deepEqual(
        api.notifier.shown.map((n) => [n.text, n.buttons]),
        [
          [
            `Push failed in billing-api: fatal: Authentication failed for 'http://127.0.0.1:${port}/payments/billing-api.git/'`,
            ['Connect git.acme.com', 'Show Output'],
          ],
        ],
      );
      assert.deepEqual(toAcme(), []);
    });
  });
});
