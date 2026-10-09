// Per-repository row snapshots with a debounce per repository and coalesced batches (design D-8). No vscode import.

import type { RowData } from '../shared/model';

export interface StoreBatch {
  upserts: RowData[];
  removals: string[];
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export const DEBOUNCE_MS = 150;
export const BATCH_MS = 100;

/** Computes a row from the repository's current state; undefined when the repository is gone. */
export type RowComputer = (id: string) => Promise<RowData | undefined>;

export class RowStore {
  private readonly rows = new Map<string, RowData>();
  private readonly debounces = new Map<string, unknown>();
  private readonly generations = new Map<string, number>();
  private readonly listeners = new Set<(batch: StoreBatch) => void>();
  private pendingUpserts = new Map<string, RowData>();
  private pendingRemovals = new Set<string>();
  private flushHandle: unknown;
  private lastFlush = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly compute: RowComputer,
    private readonly timers: Timers = realTimers,
  ) {}

  all(): RowData[] {
    return [...this.rows.values()];
  }

  get(id: string): RowData | undefined {
    return this.rows.get(id);
  }

  onBatch(listener: (batch: StoreBatch) => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  /** Recomputes the row 150 ms after the last call for that repository. */
  schedule(id: string): void {
    const previous = this.debounces.get(id);
    if (previous !== undefined) this.timers.clearTimeout(previous);
    this.debounces.set(
      id,
      this.timers.setTimeout(() => {
        this.debounces.delete(id);
        void this.recompute(id);
      }, DEBOUNCE_MS),
    );
  }

  /** Recomputes the row now, without the debounce. */
  async recompute(id: string): Promise<void> {
    const generation = (this.generations.get(id) ?? 0) + 1;
    this.generations.set(id, generation);
    let row: RowData | undefined;
    try {
      row = await this.compute(id);
    } catch {
      return;
    }
    // A newer computation or a removal replaced this one.
    if (this.generations.get(id) !== generation) return;
    if (!row) return;
    this.rows.set(id, row);
    this.pendingRemovals.delete(id);
    this.pendingUpserts.set(id, row);
    this.queueFlush();
  }

  remove(id: string): void {
    this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
    const debounce = this.debounces.get(id);
    if (debounce !== undefined) this.timers.clearTimeout(debounce);
    this.debounces.delete(id);
    if (!this.rows.delete(id)) return;
    this.pendingUpserts.delete(id);
    this.pendingRemovals.add(id);
    this.queueFlush();
  }

  dispose(): void {
    for (const handle of this.debounces.values()) this.timers.clearTimeout(handle);
    if (this.flushHandle !== undefined) this.timers.clearTimeout(this.flushHandle);
    this.listeners.clear();
  }

  private queueFlush(): void {
    if (this.flushHandle !== undefined) return;
    const delay = Math.max(0, this.lastFlush + BATCH_MS - this.timers.now());
    this.flushHandle = this.timers.setTimeout(() => this.flush(), delay);
  }

  private flush(): void {
    this.flushHandle = undefined;
    this.lastFlush = this.timers.now();
    const batch: StoreBatch = { upserts: [...this.pendingUpserts.values()], removals: [...this.pendingRemovals] };
    this.pendingUpserts = new Map();
    this.pendingRemovals = new Set();
    if (batch.upserts.length === 0 && batch.removals.length === 0) return;
    for (const listener of this.listeners) listener(batch);
  }
}
