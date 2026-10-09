// hosting-providers :: Probe matrix (R1–R6), Probe sends no credentials.

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { Http } from '../../src/providers/http';
import { Prober, type ProbedProvider, type ProbeStore } from '../../src/providers/probe';
import { contractServer } from './helpers';

const { server, requests } = contractServer();
const ORIGIN = 'https://git.acme.com';

function store(initial: Record<string, ProbedProvider> = {}) {
  const values = new Map(Object.entries(initial));
  const s: ProbeStore = { get: (host) => values.get(host), set: async (host, p) => void values.set(host, p) };
  return { store: s, values };
}

const hang = () => new Promise<Response>(() => undefined);

describe('Probe matrix', () => {
  it('R1 sends nothing for a host with a stored result', async () => {
    const { store: s, values } = store({ 'git.acme.com': 'gitlab' });
    expect(await new Prober(new Http(), s).probe('git.acme.com', ORIGIN)).toBe('gitlab');
    expect(requests).toEqual([]);
    expect(values.get('git.acme.com')).toBe('gitlab');
  });

  it('R2 identifies GitLab from a 200 version answer and stores it', async () => {
    server.use(http.get(`${ORIGIN}/api/v4/version`, () => HttpResponse.json({ version: '17.10.0' })));
    const { store: s, values } = store();
    expect(await new Prober(new Http(), s).probe('git.acme.com', ORIGIN)).toBe('gitlab');
    expect(requests.map((r) => r.url)).toEqual([`${ORIGIN}/api/v4/version`]);
    expect(values.get('git.acme.com')).toBe('gitlab');
  });

  it('R3 identifies GitLab from a 401 version answer', async () => {
    server.use(http.get(`${ORIGIN}/api/v4/version`, () => HttpResponse.json({ message: '401 Unauthorized' }, { status: 401 })));
    const { store: s, values } = store();
    expect(await new Prober(new Http(), s).probe('git.acme.com', ORIGIN)).toBe('gitlab');
    expect(requests).toHaveLength(1);
    expect(values.get('git.acme.com')).toBe('gitlab');
  });

  it('R4 identifies GitHub Enterprise from the meta answer', async () => {
    server.use(
      http.get(`${ORIGIN}/api/v4/version`, () => new HttpResponse('Not Found', { status: 404 })),
      http.get(`${ORIGIN}/api/v3/meta`, () => HttpResponse.json({ installed_version: '3.14.2' })),
    );
    const { store: s, values } = store();
    expect(await new Prober(new Http(), s).probe('git.acme.com', ORIGIN)).toBe('github');
    expect(values.get('git.acme.com')).toBe('github');
  });

  it('R5 leaves a host that answers 404 twice unknown and stores nothing', async () => {
    server.use(
      http.get(`${ORIGIN}/api/v4/version`, () => new HttpResponse('Not Found', { status: 404 })),
      http.get(`${ORIGIN}/api/v3/meta`, () => new HttpResponse('Not Found', { status: 404 })),
    );
    const { store: s, values } = store();
    const prober = new Prober(new Http(), s);
    expect(await prober.probe('git.acme.com', ORIGIN)).toBeUndefined();
    expect(values.size).toBe(0);
    // Probed again only after repohangar.refresh.
    expect(await prober.probe('git.acme.com', ORIGIN)).toBeUndefined();
    expect(requests).toHaveLength(2);
    prober.forget();
    await prober.probe('git.acme.com', ORIGIN);
    expect(requests).toHaveLength(4);
  });

  it('R6 leaves a host that does not answer within 5 s unknown', async () => {
    server.use(http.get(`${ORIGIN}/api/v4/version`, hang), http.get(`${ORIGIN}/api/v3/meta`, hang));
    const { store: s, values } = store();
    const started = Date.now();
    expect(await new Prober(new Http(), s).probe('git.acme.com', ORIGIN)).toBeUndefined();
    expect(Date.now() - started).toBeGreaterThanOrEqual(9_900);
    expect(values.size).toBe(0);
  }, 15_000);
});

describe('Probe credentials', () => {
  it('sends no Authorization and no PRIVATE-TOKEN header', async () => {
    server.use(http.get(`${ORIGIN}/api/v4/version`, () => HttpResponse.json({ version: '17.10.0' })));
    await new Prober(new Http(), store().store).probe('git.acme.com', ORIGIN);
    expect(requests[0]?.headers.authorization).toBeUndefined();
    expect(requests[0]?.headers['private-token']).toBeUndefined();
  });
});
