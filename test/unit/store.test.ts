import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RowStore, type StoreBatch } from '../../src/state/store';
import { row } from './rows';

describe('RowStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const timers = {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    now: () => Date.now(),
  };

  it('recomputes a repository once for 5 changes within 150 ms', async () => {
    const compute = vi.fn(async (id: string) => row({ id }));
    const store = new RowStore(compute, timers);
    for (let i = 0; i < 5; i++) {
      store.schedule('a');
      await vi.advanceTimersByTimeAsync(20);
    }
    await vi.advanceTimersByTimeAsync(150);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('emits one batch for 3 repositories changed within 100 ms', async () => {
    const store = new RowStore(async (id) => row({ id }), timers);
    const batches: StoreBatch[] = [];
    store.onBatch((b) => batches.push(b));
    await store.recompute('a');
    await vi.advanceTimersByTimeAsync(30);
    await store.recompute('b');
    await store.recompute('c');
    await vi.advanceTimersByTimeAsync(200);
    // The first row flushes at once; the next two arrive within 100 ms of it and share one batch.
    expect(batches.map((b) => b.upserts.map((r) => r.id))).toEqual([['a'], ['b', 'c']]);
  });

  it('never emits two batches less than 100 ms apart', async () => {
    const store = new RowStore(async (id) => row({ id }), timers);
    const times: number[] = [];
    store.onBatch(() => times.push(Date.now()));
    for (let i = 0; i < 10; i++) {
      await store.recompute(`r${i}`);
      await vi.advanceTimersByTimeAsync(25);
    }
    await vi.advanceTimersByTimeAsync(200);
    for (let i = 1; i < times.length; i++) expect((times[i] as number) - (times[i - 1] as number)).toBeGreaterThanOrEqual(100);
  });

  it('drops a computation that finishes after the repository was removed', async () => {
    let release: () => void = () => undefined;
    const store = new RowStore(
      (id) => new Promise((resolve) => (release = () => resolve(row({ id })))),
      timers,
    );
    const pending = store.recompute('a');
    store.remove('a');
    release();
    await pending;
    expect(store.get('a')).toBeUndefined();
  });

  it('reports removals', async () => {
    const store = new RowStore(async (id) => row({ id }), timers);
    const batches: StoreBatch[] = [];
    store.onBatch((b) => batches.push(b));
    await store.recompute('a');
    await vi.advanceTimersByTimeAsync(150);
    store.remove('a');
    await vi.advanceTimersByTimeAsync(150);
    expect(batches.at(-1)).toEqual({ upserts: [], removals: ['a'] });
  });
});
