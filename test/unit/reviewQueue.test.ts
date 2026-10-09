// hosting-providers :: Refresh trigger matrix (R1–R10), and the back-off of the Failure matrix (R2–R5).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewQueue, type LoadOutcome } from '../../src/providers/reviewQueue';

const SEC = 1000;
const MIN = 60 * SEC;

interface Setup {
  repos?: Record<string, string>;
  ages?: Record<string, number>;
  pipelines?: boolean;
  outcome?: (host: string) => LoadOutcome;
}

function setup(options: Setup = {}) {
  const repos = options.repos ?? { 'billing-api': 'git.acme.com', ledger: 'git.acme.com', 'web-shop': 'github.com' };
  const state = { focused: true, pipelines: options.pipelines ?? false, ages: { ...(options.ages ?? {}) } };
  const loads: { host: string; ids: string[]; at: number }[] = [];
  const queue = new ReviewQueue({
    timers: { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as never), now: () => Date.now() },
    focused: () => state.focused,
    hostOf: (id) => repos[id],
    all: () => Object.keys(repos),
    age: (id) => state.ages[id],
    activePipelines: () => state.pipelines,
    refreshMinutes: () => 3,
    load: async (host, ids) => {
      loads.push({ host, ids: [...ids].sort(), at: Date.now() });
      return options.outcome?.(host) ?? { ok: true };
    },
  });
  return { queue, loads, state };
}

beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
afterEach(() => vi.useRealTimers());

describe('Refresh trigger matrix', () => {
  it('R1 sends one request 2 s after a commit changes the head SHA', async () => {
    const { queue, loads } = setup();
    queue.queue('billing-api');
    await vi.advanceTimersByTimeAsync(1999);
    expect(loads).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(loads).toEqual([{ host: 'git.acme.com', ids: ['billing-api'], at: 1_002_000 }]);
  });

  it('R2 sends commits in two repositories 1 s apart in one request', async () => {
    const { queue, loads } = setup();
    queue.queue('billing-api');
    await vi.advanceTimersByTimeAsync(1000);
    queue.queue('ledger');
    await vi.advanceTimersByTimeAsync(5000);
    expect(loads).toEqual([{ host: 'git.acme.com', ids: ['billing-api', 'ledger'], at: 1_002_000 }]);
  });

  it('R3 sends nothing while unfocused, then one request after the window gains focus', async () => {
    const { queue, loads, state } = setup();
    state.focused = false;
    queue.windowFocusChanged(false);
    queue.queue('billing-api');
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(loads).toHaveLength(0);
    state.focused = true;
    queue.windowFocusChanged(true);
    await vi.advanceTimersByTimeAsync(2 * SEC);
    expect(loads.map((l) => l.ids)).toEqual([['billing-api']]);
  });

  it('R4 sends one request 2 s after RepoHangar pushes the repository', async () => {
    const { queue, loads } = setup();
    queue.queue('billing-api');
    await vi.advanceTimersByTimeAsync(2 * SEC);
    expect(loads).toEqual([{ host: 'git.acme.com', ids: ['billing-api'], at: 1_002_000 }]);
  });

  it('R5 sends nothing when the window gains focus and the states are 45 s old', async () => {
    const { queue, loads } = setup({ ages: { 'billing-api': 45 * SEC, ledger: 45 * SEC, 'web-shop': 45 * SEC } });
    queue.windowFocusChanged(true);
    await vi.advanceTimersByTimeAsync(10 * SEC);
    expect(loads).toHaveLength(0);
  });

  it('R6 sends one request per host for the repositories older than 60 s when the window gains focus', async () => {
    const { queue, loads } = setup({ ages: { 'billing-api': 75 * SEC, ledger: 30 * SEC, 'web-shop': 75 * SEC } });
    queue.windowFocusChanged(true);
    await vi.advanceTimersByTimeAsync(2 * SEC);
    expect(loads.map((l) => [l.host, l.ids])).toEqual([
      ['git.acme.com', ['billing-api']],
      ['github.com', ['web-shop']],
    ]);
  });

  it('R7 sends one request per host every 3 min while a pipeline runs and the window is focused', async () => {
    const { queue, loads } = setup({ pipelines: true });
    queue.pipelinesChanged();
    await vi.advanceTimersByTimeAsync(3 * MIN);
    expect(loads.map((l) => l.host)).toEqual(['git.acme.com', 'github.com']);
    await vi.advanceTimersByTimeAsync(3 * MIN);
    expect(loads).toHaveLength(4);
  });

  it('R8 runs no timer when no pipeline runs', async () => {
    const { queue, loads } = setup({ pipelines: false });
    queue.pipelinesChanged();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(loads).toHaveLength(0);
  });

  it('R9 runs no timer while the window is unfocused, even with a running pipeline', async () => {
    const { queue, loads, state } = setup({ pipelines: true });
    queue.pipelinesChanged();
    state.focused = false;
    queue.windowFocusChanged(false);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(loads).toHaveLength(0);
  });

  it('R10 sends one request per host at once on repohangar.refresh', async () => {
    const { queue, loads } = setup();
    await queue.refresh();
    expect(loads.map((l) => [l.host, l.ids, l.at])).toEqual([
      ['git.acme.com', ['billing-api', 'ledger'], 1_000_000],
      ['github.com', ['web-shop'], 1_000_000],
    ]);
  });
});

describe('Failure back-off', () => {
  it('waits for the rate-limit reset before the next request (R2)', async () => {
    let first = true;
    const { queue, loads } = setup({
      outcome: () => {
        if (!first) return { ok: true };
        first = false;
        return { ok: false, untilMs: Date.now() + 600 * SEC };
      },
    });
    await queue.refresh();
    queue.queue('billing-api');
    await vi.advanceTimersByTimeAsync(599 * SEC);
    expect(loads.filter((l) => l.host === 'git.acme.com')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1 * SEC);
    expect(loads.filter((l) => l.host === 'git.acme.com')).toHaveLength(2);
  });

  it('honors Retry-After: 120 (R3)', async () => {
    let calls = 0;
    const { queue, loads } = setup({ outcome: () => (calls++ === 0 ? { ok: false, untilMs: Date.now() + 120 * SEC } : { ok: true }) });
    queue.queue('billing-api');
    await vi.advanceTimersByTimeAsync(2 * SEC);
    queue.queue('billing-api');
    await vi.advanceTimersByTimeAsync(119 * SEC);
    expect(loads).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2 * SEC);
    expect(loads).toHaveLength(2);
  });

  it('waits 1 min after a first failure and 4 min after the third (R4, R5)', async () => {
    const { queue, loads } = setup({ outcome: () => ({ ok: false }) });
    const failOnce = async () => {
      queue.queue('billing-api');
      await vi.advanceTimersByTimeAsync(31 * MIN);
    };
    queue.queue('billing-api');
    await vi.advanceTimersByTimeAsync(2 * SEC);
    const first = loads.length;
    queue.queue('billing-api');
    await vi.advanceTimersByTimeAsync(59 * SEC);
    expect(loads.length).toBe(first);
    await vi.advanceTimersByTimeAsync(2 * SEC);
    expect(loads.length).toBe(first + 1);
    // Third failure in a row: the next request waits at least 4 min.
    const before = loads.length;
    queue.queue('billing-api');
    await vi.advanceTimersByTimeAsync(2 * MIN + 2 * SEC);
    expect(loads.length).toBe(before + 1);
    queue.queue('billing-api');
    await vi.advanceTimersByTimeAsync(4 * MIN - 5 * SEC);
    expect(loads.length).toBe(before + 1);
    await vi.advanceTimersByTimeAsync(10 * SEC);
    expect(loads.length).toBe(before + 2);
    expect(queue.failing('git.acme.com')).toBe(true);
    await failOnce();
  });

  it('resets the back-off on repohangar.refresh', async () => {
    let fail = true;
    const { queue, loads } = setup({ outcome: () => (fail ? { ok: false } : { ok: true }) });
    queue.queue('billing-api');
    await vi.advanceTimersByTimeAsync(2 * SEC);
    fail = false;
    await queue.refresh();
    expect(loads.filter((l) => l.host === 'git.acme.com')).toHaveLength(2);
    expect(queue.failing('git.acme.com')).toBe(false);
  });
});
