// hosting-providers performance target (§11.2): the review status of 50 repositories over 2 hosts costs 1 request per
// host and arrives in < 1.5 s, with the hosts answering after 100 ms.

import * as assert from 'node:assert/strict';
import { ready, waitFor } from '../helpers';
import { answerHttp, graphql, stubAuthUi, users } from '../providers/support';

describe('review status', () => {
  it('costs 2 requests and arrives in < 1.5 s for 50 repositories on 2 hosts', async () => {
    const api = await ready(50);
    api.providers.focusOverride = true;
    const ui = stubAuthUi(api, { sessions: { github: { token: 'gho_session', username: 'luisgomez' } }, pasted: ['glpat-x1y2'] });
    const status = (host: string) => {
      const answer = graphql(host, (alias) => [
        { iid: String(100 + Number(alias.slice(1))), number: 100 + Number(alias.slice(1)), webUrl: 'https://x', url: 'https://x', title: 't' },
      ]);
      return (url: URL, method: string, body: unknown, auth: string | undefined) => answer(url, method, body, auth);
    };
    const http = answerHttp(api, [users({ 'glpat-x1y2': 'ana.perez', gho_session: 'luisgomez' }), status('git.acme.com'), status('api.github.com')]);
    const delayed = api.providers.http.fetchOverride;
    api.providers.http.fetchOverride = async (url, init) => {
      await new Promise((r) => setTimeout(r, 100));
      return (delayed as NonNullable<typeof delayed>)(url, init);
    };
    try {
      await api.providers.auth.signIn('github.com');
      await api.providers.auth.signIn('git.acme.com');
      await waitFor(() => api.store.all().every((r) => r.review?.kind === 'loaded'), 'every review state');
      http.requests.length = 0;
      const started = Date.now();
      await api.providers.queue.refresh();
      await waitFor(() => api.store.all().every((r) => r.review?.kind === 'loaded' && !r.review.stale), 'every review state refreshed');
      const ms = Date.now() - started;
      const posts = http.requests.filter((r) => r.method === 'POST').map((r) => new URL(r.url).host).sort();
      console.log(`      review status: ${ms} ms, ${posts.length} requests`);
      assert.deepEqual(posts, ['api.github.com', 'git.acme.com']);
      assert.ok(ms < 1500, `review status took ${ms} ms`);
    } finally {
      http.restore();
      ui.restore();
    }
  });
});
