// provider-auth :: Sign-in matrix (R1–R6), Sign in from a cell, Sign out of a GitLab host, Sign out of github.com,
// Revoked GitLab token, Skipped GitLab host.

import * as assert from 'node:assert/strict';
import type { TestApi } from '../../../../src/extension';
import { reviewCell } from '../../../../src/shared/review';
import { idOf, ready, recordIntegrations, rowNamed, waitFor } from '../helpers';
import { MR_142, answerHttp, graphql, json, stubAuthUi, users, type UiStub } from './support';

const HOSTS = ['git.acme.com', 'github.com', 'github.acme.com'];

describe('Sign in and out', () => {
  let api: TestApi;
  let ui: UiStub & { restore(): void };
  let http: ReturnType<typeof answerHttp>;
  let stop: () => void;

  before(async () => {
    api = await ready(6);
    api.providers.focusOverride = true;
  });

  beforeEach(async () => {
    stop = recordIntegrations(api);
    ui = stubAuthUi(api);
    http = answerHttp(api, [
      users({ 'glpat-x1y2': 'ana.perez', 'ghp_a1b2': 'ana', 'gho_session': 'luisgomez' }),
      graphql('git.acme.com', () => [MR_142]),
      graphql('api.github.com', () => []),
      graphql('github.acme.com', () => []),
    ]);
    // Every host starts without a credential.
    for (const host of HOSTS) {
      await api.providers.auth.setSkipped(host, false);
      await api.providers.signOut(host);
      api.providers.auth.forget(host);
    }
    for (const host of HOSTS) await waitFor(() => api.providers.auth.hostState(host) === 'none', `${host} without a credential`);
    http.requests.length = 0;
    api.notifier.shown.length = 0;
  });

  afterEach(() => {
    http.restore();
    ui.restore();
    stop();
  });

  const cell = (name: string) => reviewCell(rowNamed(api, name)?.review, Date.now());
  const graphqlTo = (host: string) => http.requests.filter((r) => r.method === 'POST' && new URL(r.url).host === host);

  describe('Sign-in matrix', () => {
    it('R1 completes the VS Code GitHub sign-in on github.com and loads its review status at once', async () => {
      ui.sessions.github = { token: 'gho_session', username: 'luisgomez' };
      assert.equal(await api.providers.auth.signIn('github.com'), true);
      assert.ok(ui.sessionCalls.includes('github create'), JSON.stringify(ui.sessionCalls));
      await waitFor(() => graphqlTo('api.github.com').length === 1, 'the github.com review request');
      assert.equal(await api.providers.auth.storedToken('github.com'), undefined);
    });

    it('R2 keeps Sign in when the VS Code GitHub sign-in is canceled', async () => {
      assert.equal(await api.providers.auth.signIn('github.com'), false);
      assert.ok(ui.sessionCalls.includes('github create'));
      assert.equal(cell('web-shop').text, 'Sign in');
      assert.equal(graphqlTo('api.github.com').length, 0);
    });

    it('R3 opens the GitLab token page, stores the accepted token and loads git.acme.com at once', async () => {
      ui.pasted.push('glpat-x1y2');
      assert.equal(await api.providers.auth.signIn('git.acme.com'), true);
      assert.deepEqual(ui.opened, ['https://git.acme.com/-/user_settings/personal_access_tokens?name=RepoHangar&scopes=api']);
      assert.ok(http.requests.some((r) => r.url === 'https://git.acme.com/api/v4/user'));
      assert.equal(await api.providers.auth.storedToken('git.acme.com'), 'glpat-x1y2');
      await waitFor(() => graphqlTo('git.acme.com').length === 1, 'the git.acme.com review request');
    });

    it('R4 keeps the input open with the 401 message and stores nothing', async () => {
      ui.pasted.push('glpat-bad');
      assert.equal(await api.providers.auth.signIn('git.acme.com'), false);
      assert.deepEqual(ui.messages, ['git.acme.com did not accept this token (401).']);
      assert.equal(await api.providers.auth.storedToken('git.acme.com'), undefined);
    });

    it('R5 sends no request when the password input is dismissed', async () => {
      assert.equal(await api.providers.auth.signIn('git.acme.com'), false);
      assert.deepEqual(
        http.requests.map((r) => r.url),
        [],
      );
      assert.equal(cell('billing-api').text, 'Sign in');
    });

    it('R6 opens the GitHub Enterprise token page and stores the accepted token', async () => {
      ui.pasted.push('ghp_a1b2');
      assert.equal(await api.providers.auth.signIn('github.acme.com'), true);
      assert.deepEqual(ui.opened, ['https://github.acme.com/settings/tokens/new?description=RepoHangar&scopes=repo']);
      assert.ok(http.requests.some((r) => r.url === 'https://github.acme.com/api/v3/user'));
      assert.equal(await api.providers.auth.storedToken('github.acme.com'), 'ghp_a1b2');
      await waitFor(() => graphqlTo('github.acme.com').length === 1, 'the github.acme.com review request');
    });
  });

  it('signs in from a Sign in cell and fills every cell of the host', async () => {
    ui.pasted.push('glpat-x1y2');
    await api.dashboard.receiveForTest({ type: 'signIn', host: 'git.acme.com' });
    await waitFor(() => graphqlTo('git.acme.com').length === 1, 'one review request');
    await waitFor(() => cell('billing-api').text === '!142  ✓ passed', 'the billing-api cell');
    await waitFor(() => cell('ledger').text === '!142  ✓ passed', 'the ledger cell');
  });

  it('signs out of a GitLab host: token deleted, Sign in shown, no request', async () => {
    ui.pasted.push('glpat-x1y2');
    await api.providers.auth.signIn('git.acme.com');
    await waitFor(() => cell('billing-api').text.startsWith('!142'), 'the loaded cell');
    http.requests.length = 0;
    await api.providers.signOut('git.acme.com');
    assert.equal(await api.providers.auth.storedToken('git.acme.com'), undefined);
    await waitFor(() => cell('billing-api').text === 'Sign in', 'Sign in');
    await api.providers.queue.refresh();
    assert.equal(graphqlTo('git.acme.com').length, 0);
  });

  it('does not sign out of github.com, which uses the VS Code account', async () => {
    ui.sessions.github = { token: 'gho_session', username: 'luisgomez' };
    await api.providers.auth.signIn('github.com');
    await api.providers.signOut('github.com');
    assert.ok(
      api.notifier.shown.some(
        (n) => n.text === 'RepoHangar uses your VS Code account for github.com. Sign out of it from the Accounts menu.',
      ),
      JSON.stringify(api.notifier.shown),
    );
    assert.equal(api.providers.auth.hostState('github.com'), 'credential');
  });

  it('deletes a revoked GitLab token, warns once and sends nothing until the user signs in', async () => {
    ui.pasted.push('glpat-x1y2');
    await api.providers.auth.signIn('git.acme.com');
    await waitFor(() => graphqlTo('git.acme.com').length === 1, 'the first request');
    api.notifier.answer = () => undefined;
    http.restore();
    http = answerHttp(api, [(url) => (url.host === 'git.acme.com' ? json({ message: '401 Unauthorized' }, 401) : undefined)]);
    await api.providers.queue.loadNow([idOf(api, 'billing-api')]);
    await waitFor(() => api.notifier.shown.some((n) => n.text === 'git.acme.com rejected the saved token.'), 'the warning');
    const warning = api.notifier.shown.find((n) => n.text === 'git.acme.com rejected the saved token.');
    assert.deepEqual(warning?.buttons, ['Sign In…']);
    assert.equal(await api.providers.auth.storedToken('git.acme.com'), undefined);
    const sent = http.requests.length;
    await api.providers.queue.refresh();
    assert.equal(http.requests.length, sent);
  });

  it('sends nothing and runs no glab for a skipped host', async () => {
    await api.providers.auth.setSkipped('git.acme.com', true);
    api.providers.auth.forget('git.acme.com');
    ui.cliOutput['glab config get token --host git.acme.com'] = 'glpat-x1y2';
    await api.providers.refresh();
    assert.equal(http.requests.filter((r) => new URL(r.url).host === 'git.acme.com').length, 0);
    assert.equal(ui.cliCalls.filter((c) => c.startsWith('glab')).length, 0);
    const billing = cell('billing-api');
    assert.equal(billing.text, '—');
    assert.equal(billing.tooltip, 'git.acme.com is skipped. Run "RepoHangar: Sign In to Host…" to connect it.');
    await api.providers.auth.setSkipped('git.acme.com', false);
  });
});
