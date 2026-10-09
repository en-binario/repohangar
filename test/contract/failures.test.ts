// hosting-providers :: Failure matrix (R1–R5), Project not readable.

import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Http } from '../../src/providers/http';
import { ProviderFactory } from '../../src/providers/provider';
import { reviewInfo, storeKey, type HostState, type StoredReview } from '../../src/providers/reviewInfo';
import { ReviewLoader } from '../../src/providers/reviewLoader';
import { ReviewQueue } from '../../src/providers/reviewQueue';
import type { RowData } from '../../src/shared/model';
import { reviewCell } from '../../src/shared/review';
import { row } from '../unit/rows';
import { contractServer } from './helpers';
import { statusAnswer } from './graphql';

const { server, requests } = contractServer();
const URL_GQL = 'https://git.acme.com/api/graphql';

function repo(name: string): RowData {
  return row({
    id: `file:///acme/${name}`,
    name,
    provider: 'gitlab',
    headSha: 'c3d4e5f',
    hosted: { host: 'git.acme.com', projectPath: `payments/${name}`, webUrl: `https://git.acme.com/payments/${name}` },
    head: { kind: 'branch', name: 'feature/ABC-12-notes', upstream: 'origin/feature/ABC-12-notes', ahead: 0, behind: 0 },
  });
}

function world(initial: Record<string, StoredReview> = {}) {
  const rows = new Map([repo('billing-api'), repo('ledger')].map((r) => [r.id, r]));
  const stored = new Map(Object.entries(initial));
  let hostState: HostState = 'credential';
  const rejected: string[] = [];
  const loader = new ReviewLoader({
    row: (id) => rows.get(id),
    provider: (kind, host, origin) => new ProviderFactory(new Http()).get(kind, host, origin),
    credential: async () => (hostState === 'credential' ? { token: 'glpat-x1y2', apiHost: 'git.acme.com' } : undefined),
    rejected: async (host) => {
      rejected.push(host);
      hostState = 'none';
    },
    selection: () => ({}),
    saveSelection: async () => undefined,
    store: (id, branch, state) => void stored.set(storeKey(id, branch), state),
    now: () => Date.now(),
    log: () => undefined,
  });
  const queue = new ReviewQueue({
    timers: { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as never), now: () => Date.now() },
    focused: () => true,
    hostOf: () => 'git.acme.com',
    all: () => [...rows.keys()],
    age: () => undefined,
    activePipelines: () => false,
    refreshMinutes: () => 3,
    load: (host, ids) => loader.load(host, ids),
  });
  const cell = (name: string) =>
    reviewCell(
      reviewInfo(rows.get(`file:///acme/${name}`) as RowData, {
        hostState: () => hostState,
        stored: (id, branch) => stored.get(storeKey(id, branch)),
        sessionStart: 0,
        hostFailing: (host) => queue.failing(host),
      }),
      Date.now(),
    );
  return { queue, cell, rejected };
}

const cached = { [storeKey('file:///acme/billing-api', 'feature/ABC-12-notes')]: { review: null, headSha: 'c3d4e5f', fetchedAt: 1 } };

afterEach(() => vi.useRealTimers());

describe('Failure matrix', () => {
  it('R1 shows Sign in after a 401 and sends nothing until the user signs in', async () => {
    server.use(http.post(URL_GQL, () => HttpResponse.json({ message: '401 Unauthorized' }, { status: 401 })));
    const w = world(cached);
    await w.queue.refresh();
    expect(w.rejected).toEqual(['git.acme.com']);
    expect(w.cell('billing-api').text).toBe('Sign in');
    w.queue.queue('file:///acme/billing-api');
    await new Promise((r) => setTimeout(r, 2_100));
    expect(requests).toHaveLength(1);
  }, 10_000);

  it.each([
    ['R2 a 403 with no requests left waits for the reset 600 s ahead', { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '' }, 403, 600_000],
    ['R3 a 429 with Retry-After: 120 waits 120 s', { 'Retry-After': '120' }, 429, 120_000],
  ])('%s and keeps the cached values not refreshed', async (_name, given, status, wait) => {
    const headers = given as Record<string, string>;
    vi.useFakeTimers({ now: 1_000_000, toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const reset = String(Math.floor((Date.now() + 600_000) / 1000));
    server.use(
      http.post(URL_GQL, () =>
        HttpResponse.json({ message: 'limit' }, { status, headers: { ...headers, ...(headers['X-RateLimit-Reset'] === '' ? { 'X-RateLimit-Reset': reset } : {}) } }),
      ),
    );
    const w = world(cached);
    await w.queue.refresh();
    expect(w.cell('billing-api')).toMatchObject({ text: '—', stale: true });
    w.queue.queue('file:///acme/billing-api');
    await vi.advanceTimersByTimeAsync(wait - 1_000);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(requests).toHaveLength(2);
  });

  it.each([
    ['a 502', () => new HttpResponse('Bad Gateway', { status: 502 })],
    ['a network error', () => HttpResponse.error()],
  ])('R4 keeps the cached values not refreshed after %s and waits at least 1 min', async (_name, answer) => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    server.use(http.post(URL_GQL, answer));
    const w = world(cached);
    await w.queue.refresh();
    expect(w.cell('billing-api')).toMatchObject({ text: '—', stale: true });
    w.queue.queue('file:///acme/billing-api');
    await vi.advanceTimersByTimeAsync(59_000);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(requests).toHaveLength(2);
  });

  it('R5 waits at least 4 min after the third failure in a row', async () => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    server.use(http.post(URL_GQL, () => new HttpResponse('Bad Gateway', { status: 502 })));
    const w = world(cached);
    await w.queue.refresh();
    for (const wait of [61_000, 121_000]) {
      w.queue.queue('file:///acme/billing-api');
      await vi.advanceTimersByTimeAsync(wait);
    }
    expect(requests).toHaveLength(3);
    w.queue.queue('file:///acme/billing-api');
    // The third failure was at 180 s, so nothing goes out before 420 s.
    await vi.advanceTimersByTimeAsync(235_000);
    expect(requests).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(requests).toHaveLength(4);
    expect(w.cell('billing-api').stale).toBe(true);
  });
});

describe('Project not readable', () => {
  it('shows a dash with the tooltip for a null alias and the review for the others', async () => {
    server.use(http.post(URL_GQL, async ({ request }) => statusAnswer('gitlab', ((await request.json()) as { query: string }).query, (alias) => (alias === 'r0' ? null : [{ iid: '88', webUrl: 'https://git.acme.com/payments/ledger/-/merge_requests/88', title: 'Ledger' }]))));
    const w = world();
    await w.queue.refresh();
    expect(w.cell('billing-api')).toMatchObject({
      text: '—',
      tooltip: 'payments/billing-api was not found on git.acme.com, or your account cannot read it.',
    });
    expect(w.cell('ledger').text).toBe('!88');
  });
});
