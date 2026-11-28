// provider-auth :: Redirect to another host, Trace logging of a request; plus the credential, ETag and rate-limit
// handling of the HTTP layer (hosting-providers design D-1).

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_AGENT, Http, HttpError } from '../../src/providers/http';
import { contractServer } from './helpers';

const TOKEN = 'glpat-x1y2z3secret';
const credential = { token: TOKEN, apiHost: 'git.acme.com' };
const { server, requests } = contractServer();

describe('HTTP layer', () => {
  it('does not follow a redirect to another host with the credential', async () => {
    server.use(
      http.post('https://git.acme.com/api/graphql', () => new HttpResponse(null, { status: 302, headers: { Location: 'https://sso.acme.com/login' } })),
      http.get('https://sso.acme.com/login', () => HttpResponse.text('login page')),
    );
    const client = new Http();
    const error = await client.request({ method: 'POST', url: 'https://git.acme.com/api/graphql', credential, body: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).kind).toBe('redirect');
    expect(requests.map((r) => r.url)).toEqual(['https://git.acme.com/api/graphql']);
  });

  it('logs no token and no Authorization header at the trace level', async () => {
    server.use(http.post('https://git.acme.com/api/graphql', () => HttpResponse.json({ data: {} })));
    const lines: string[] = [];
    const client = new Http({ trace: (line) => lines.push(line) });
    await client.request({ method: 'POST', url: 'https://git.acme.com/api/graphql', credential, body: { query: '{}' } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^POST https:\/\/git\.acme\.com\/api\/graphql → 200 in \d+ ms$/);
    for (const line of lines) {
      expect(line).not.toContain(TOKEN);
      expect(line.toLowerCase()).not.toContain('authorization');
    }
    expect(requests[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('sends the credential only to the host it belongs to', async () => {
    server.use(http.get('https://other.acme.com/api/v4/version', () => HttpResponse.json({ version: '17.10.0' })));
    await new Http().request({ url: 'https://other.acme.com/api/v4/version', credential });
    expect(requests[0]?.headers.authorization).toBeUndefined();
  });

  it('sends If-None-Match and returns the cached answer on 304', async () => {
    let calls = 0;
    server.use(
      http.get('https://git.acme.com/api/v4/projects/1/merge_requests', ({ request }) => {
        calls++;
        if (request.headers.get('if-none-match') === '"a1b2"') return new HttpResponse(null, { status: 304 });
        return HttpResponse.json([{ iid: 142 }], { headers: { ETag: '"a1b2"' } });
      }),
    );
    const client = new Http();
    const url = 'https://git.acme.com/api/v4/projects/1/merge_requests';
    const first = await client.request({ url, credential, etag: true });
    const second = await client.request({ url, credential, etag: true });
    expect(calls).toBe(2);
    expect(requests[1]?.headers['if-none-match']).toBe('"a1b2"');
    expect(second.status).toBe(304);
    expect(second.json).toEqual(first.json);
  });

  it.each([
    ['429 with Retry-After: 120', 429, { 'Retry-After': '120' }, 1_000_000 + 120_000],
    ['403 with no requests left and a reset time', 403, { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1600' }, 1_600_000],
  ])('turns %s into a rate-limit error', async (_name, status, headers, until) => {
    server.use(http.post('https://api.github.com/graphql', () => HttpResponse.json({ message: 'limit' }, { status, headers })));
    const client = new Http({ now: () => 1_000_000 });
    const error = (await client.request({ method: 'POST', url: 'https://api.github.com/graphql', body: {} }).catch((e) => e)) as HttpError;
    expect(error.kind).toBe('rateLimited');
    expect(error.untilMs).toBe(until);
  });

  it('reports a timeout after the given time', async () => {
    server.use(http.get('https://git.acme.com/api/v4/version', async () => new Promise<Response>(() => undefined)));
    const error = (await new Http().request({ url: 'https://git.acme.com/api/v4/version', timeoutMs: 50 }).catch((e) => e)) as HttpError;
    expect(error.kind).toBe('timeout');
  });

  it('sends an identifying User-Agent header by default and supports a versioned override', async () => {
    server.use(http.get('https://api.github.com/user', () => HttpResponse.json({ login: 'ana.perez' })));
    await new Http().request({ url: 'https://api.github.com/user' });
    await new Http({ userAgent: 'RepoHangar/0.1.0 (+https://repohangar.enbinario.com)' }).request({ url: 'https://api.github.com/user' });
    expect(requests[0]?.headers['user-agent']).toBe(DEFAULT_USER_AGENT);
    expect(requests[1]?.headers['user-agent']).toBe('RepoHangar/0.1.0 (+https://repohangar.enbinario.com)');
  });
});
