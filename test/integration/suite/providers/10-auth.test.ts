// provider-auth :: GitLab credentials end to end: a glab login imported, validated, stored and announced.

import * as assert from 'node:assert/strict';
import type { TestApi } from '../../../../src/extension';
import { ready, recordIntegrations, waitFor } from '../helpers';
import { answerHttp, graphql, stubAuthUi, users } from './support';

describe('Credentials', () => {
  let api: TestApi;

  before(async () => {
    api = await ready(6);
    api.providers.focusOverride = true;
  });

  it('imports the glab login for git.acme.com, stores it and announces it', async () => {
    const stop = recordIntegrations(api);
    const ui = stubAuthUi(api, { cliOutput: { 'glab config get token --host git.acme.com': 'glpat-x1y2\n' } });
    const http = answerHttp(api, [users({ 'glpat-x1y2': 'ana.perez' }), graphql('git.acme.com', () => [])]);
    try {
      const auth = api.providers.auth;
      auth.forget('git.acme.com');
      assert.equal(auth.hostState('git.acme.com'), 'pending');
      await waitFor(() => auth.hostState('git.acme.com') === 'credential', 'the glab credential');
      assert.equal(await auth.storedToken('git.acme.com'), 'glpat-x1y2');
      assert.deepEqual(auth.account('git.acme.com'), { username: 'ana.perez', source: 'glab' });
      assert.ok(ui.cliCalls.includes('glab config get token --host git.acme.com'), JSON.stringify(ui.cliCalls));
      assert.deepEqual(
        api.notifier.shown.filter((n) => n.text.startsWith('Using your glab')).map((n) => n.text),
        ['Using your glab login for git.acme.com.'],
      );
      assert.ok(http.requests.some((r) => r.url === 'https://git.acme.com/api/v4/user' && r.authorization === 'Bearer glpat-x1y2'));
    } finally {
      await api.providers.signOut('git.acme.com');
      http.restore();
      ui.restore();
      stop();
    }
  });
});
