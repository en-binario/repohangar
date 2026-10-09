import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobRunner, type CancellationLike, type Job } from '../../src/jobs/runner';
import type { RowJob } from '../../src/shared/model';

const timers = {
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

function runner(concurrency = 6, timeoutSeconds = 60) {
  const jobs: [string, RowJob][] = [];
  const r = new JobRunner({ concurrency: () => concurrency, timeoutSeconds: () => timeoutSeconds, setJob: (id, job) => jobs.push([id, job]), timers });
  return { r, jobs };
}

/** A fetch that takes `ms` and counts how many run at once. */
function fetches(ms: number) {
  let running = 0;
  const state = { calls: 0, max: 0 };
  const job: Job = (ctx) =>
    ctx.network(
      async () => {
        state.calls++;
        running++;
        state.max = Math.max(state.max, running);
        await new Promise((r) => setTimeout(r, ms));
        running--;
      },
      { timeout: true },
    ).then(() => ({ state: 'ok' as const }));
  return { state, job };
}

function cancellation() {
  const listeners: (() => void)[] = [];
  const token: CancellationLike & { cancel(): void } = {
    isCancellationRequested: false,
    onCancellationRequested: (l) => {
      listeners.push(l);
      return { dispose: () => undefined };
    },
    cancel() {
      (this as { isCancellationRequested: boolean }).isCancellationRequested = true;
      for (const l of listeners) l();
    },
  };
  return token;
}

const ids = Array.from({ length: 14 }, (_, i) => `repo-${i + 1}`);

describe('JobRunner', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('never runs more than the concurrency at once and gives each repository a result', async () => {
    const { r } = runner(6);
    const { state, job } = fetches(1000);
    const run = r.runBatch('fetch', ids, () => job);
    await vi.advanceTimersByTimeAsync(5000);
    const outcome = await run;
    expect(state.max).toBe(6);
    expect(state.calls).toBe(14);
    expect(outcome.kind === 'done' && outcome.results).toHaveLength(14);
  });

  it('makes no call for a second request on a repository with a job', async () => {
    const { r } = runner();
    const { state, job } = fetches(1000);
    const first = r.run('ledger', 'fetch', job);
    await vi.advanceTimersByTimeAsync(10);
    expect(await r.run('ledger', 'fetch', job)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await first)?.result).toEqual({ state: 'ok' });
    expect(state.calls).toBe(1);
  });

  it('records a timeout after the configured seconds and frees the slot', async () => {
    const { r, jobs } = runner(1, 5);
    const hanging: Job = (ctx) => ctx.network(() => new Promise<void>(() => undefined), { timeout: true }).then(() => ({ state: 'ok' as const }));
    const { state, job } = fetches(100);
    const run = r.runBatch('fetch', ['ledger', 'web-shop'], (id) => (id === 'ledger' ? hanging : job));
    await vi.advanceTimersByTimeAsync(4999);
    expect(state.calls).toBe(0);
    await vi.advanceTimersByTimeAsync(200);
    const outcome = await run;
    expect(outcome.kind === 'done' && outcome.results).toEqual([{ state: 'failed', detail: 'timed out after 5 s' }, { state: 'ok' }]);
    expect(jobs.filter(([id]) => id === 'ledger').map(([, j]) => j)).toEqual([
      { action: 'fetch', state: 'running' },
      { action: 'fetch', state: 'failed', detail: 'timed out after 5 s' },
    ]);
  });

  it('lets running jobs finish and skips the repositories not started when canceled', async () => {
    const { r } = runner(6);
    const { state, job } = fetches(1000);
    const token = cancellation();
    const run = r.runBatch('fetch', ids, () => job, { token });
    // 6 finish at 1 s and 6 more start; cancel while they run.
    await vi.advanceTimersByTimeAsync(1500);
    token.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    const outcome = await run;
    expect(state.calls).toBe(12);
    const results = outcome.kind === 'done' ? outcome.results : [];
    expect(results.filter((x) => x.state === 'ok')).toHaveLength(12);
    expect(results.slice(12)).toEqual([
      { state: 'skipped', detail: 'canceled' },
      { state: 'skipped', detail: 'canceled' },
    ]);
  });

  it('starts no fetch for a Fetch all on the same repositories within 10 s', async () => {
    const { r } = runner();
    const { state, job } = fetches(100);
    const first = r.runBatch('fetch', ids, () => job);
    // 14 fetches of 100 ms, 6 at a time.
    await vi.advanceTimersByTimeAsync(300);
    await first;
    await vi.advanceTimersByTimeAsync(6000);
    expect(await r.runBatch('fetch', [...ids].reverse(), () => job)).toEqual({ kind: 'recent', seconds: 6 });
    expect(state.calls).toBe(14);
    // Another set, or 10 s later, fetches again.
    const other = r.runBatch('fetch', ids.slice(1), () => job);
    await vi.advanceTimersByTimeAsync(300);
    expect((await other).kind).toBe('done');
    await vi.advanceTimersByTimeAsync(10_000);
    const later = r.runBatch('fetch', ids.slice(1), () => job);
    await vi.advanceTimersByTimeAsync(300);
    expect((await later).kind).toBe('done');
  });

  it('shows the action a job switches to, such as Publish', async () => {
    const { r, jobs } = runner();
    await r.run('auth-service', 'push', (ctx) => ctx.network(async () => undefined, { action: 'publish' }).then(() => ({ state: 'ok' as const })));
    expect(jobs.map(([, j]) => j)).toEqual([
      { action: 'publish', state: 'running' },
      { action: 'publish', state: 'ok' },
    ]);
  });

  it('records a failed job with the first line of Git error output', async () => {
    const { r } = runner();
    const error = Object.assign(new Error('Failed to execute git'), { stderr: 'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.\n' });
    const result = await r.run('infra-charts', 'fetch', (ctx) => ctx.network(() => Promise.reject(error)).then(() => ({ state: 'ok' as const })));
    expect(result).toEqual({ action: 'fetch', result: { state: 'failed', detail: 'Permission denied (publickey)' } });
  });
});
