// Runs Git jobs: a pool of `repohangar.concurrency` slots for network steps, one job per repository, a timeout per
// fetch, cancellation of a batch and the Fetch all idempotence window (design D-4). No vscode import.

import { gitErrorMessage } from '../git/errors';
import type { BatchAction, JobAction, JobResult, RowJob } from '../shared/model';
import type { Timers } from '../state/store';

export interface CancellationLike {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

export interface JobContext {
  /**
   * Runs a network step in a pool slot and marks the row running. With `timeout`, the step fails after
   * `repohangar.fetchTimeoutSeconds`; with `action`, the row shows that action from now on (Push that publishes).
   * Rejects with `CanceledError` when the batch is canceled before a slot is free.
   */
  network<T>(step: () => Promise<T>, options?: { timeout?: boolean; action?: JobAction }): Promise<T>;
}

export type Job = (ctx: JobContext) => Promise<JobResult>;

export class TimeoutError extends Error {
  constructor(readonly seconds: number) {
    super(`timed out after ${seconds} s`);
  }
}

export class CanceledError extends Error {
  constructor() {
    super('canceled');
  }
}

export interface RunnerOptions {
  concurrency(): number;
  timeoutSeconds(): number;
  /** Shows a job in the repository's row. */
  setJob(id: string, job: RowJob): void;
  timers?: Timers;
}

/** A finished job: its result and the action the row showed (`publish` for a Push that published). */
export interface FinishedJob {
  action: JobAction;
  result: JobResult;
}

export type BatchRun =
  | { kind: 'recent'; seconds: number }
  | { kind: 'done'; elapsedMs: number; results: JobResult[] };

/** A Fetch all on the same repositories within this time of the last one starts no fetch. */
export const RECENT_FETCH_MS = 10_000;

interface Waiter {
  token: CancellationLike | undefined;
  resolve(): void;
  reject(error: Error): void;
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export class JobRunner {
  private readonly locked = new Set<string>();
  private readonly waiters: Waiter[] = [];
  private active = 0;
  private lastFetch: { ids: Set<string>; at: number } | undefined;
  private readonly timers: Timers;

  constructor(private readonly options: RunnerOptions) {
    this.timers = options.timers ?? realTimers;
  }

  isBusy(id: string): boolean {
    return this.locked.has(id);
  }

  /** Runs one job on one repository; undefined, without running anything, when the repository has a job already. */
  async run(id: string, action: JobAction, job: Job): Promise<FinishedJob | undefined> {
    if (this.locked.has(id)) return undefined;
    this.locked.add(id);
    return this.execute(id, action, job, undefined);
  }

  /** Runs a job on each repository, reporting progress; a repository that has a job already gets `skipped: busy`. */
  async runBatch(
    action: BatchAction,
    ids: readonly string[],
    jobFor: (id: string) => Job,
    options: { token?: CancellationLike; onProgress?(done: number, total: number): void } = {},
  ): Promise<BatchRun> {
    const { token, onProgress } = options;
    const start = this.timers.now();
    if (action === 'fetch' && this.lastFetch && start - this.lastFetch.at < RECENT_FETCH_MS && sameSet(this.lastFetch.ids, ids)) {
      return { kind: 'recent', seconds: Math.floor((start - this.lastFetch.at) / 1000) };
    }
    const subscription = token?.onCancellationRequested(() => this.rejectWaiters(token));
    let done = 0;
    onProgress?.(0, ids.length);
    const results = await Promise.all(
      ids.map(async (id) => {
        let result: JobResult;
        if (this.locked.has(id)) {
          result = { state: 'skipped', detail: 'busy' };
        } else {
          this.locked.add(id);
          result = (await this.execute(id, action, jobFor(id), token)).result;
        }
        onProgress?.(++done, ids.length);
        return result;
      }),
    );
    subscription?.dispose();
    const end = this.timers.now();
    if (action === 'fetch' && !token?.isCancellationRequested) this.lastFetch = { ids: new Set(ids), at: end };
    return { kind: 'done', elapsedMs: end - start, results };
  }

  private async execute(id: string, action: JobAction, job: Job, token: CancellationLike | undefined): Promise<FinishedJob> {
    let shown = action;
    const ctx: JobContext = {
      network: async (step, options = {}) => {
        await this.acquire(token);
        try {
          shown = options.action ?? shown;
          this.options.setJob(id, { action: shown, state: 'running' });
          const running = step();
          return options.timeout ? await this.withTimeout(running) : await running;
        } finally {
          this.release();
        }
      },
    };
    let result: JobResult;
    try {
      result = await job(ctx);
    } catch (error) {
      result =
        error instanceof CanceledError
          ? { state: 'skipped', detail: 'canceled' }
          : { state: 'failed', detail: error instanceof TimeoutError ? error.message : gitErrorMessage(error) };
    } finally {
      this.locked.delete(id);
    }
    this.options.setJob(id, { action: shown, ...result });
    return { action: shown, result };
  }

  private withTimeout<T>(running: Promise<T>): Promise<T> {
    const seconds = this.options.timeoutSeconds();
    // A late failure after the timeout changes nothing.
    running.catch(() => undefined);
    let handle: unknown;
    const timer = new Promise<never>((_, reject) => {
      handle = this.timers.setTimeout(() => reject(new TimeoutError(seconds)), seconds * 1000);
    });
    return Promise.race([running, timer]).finally(() => this.timers.clearTimeout(handle));
  }

  private acquire(token: CancellationLike | undefined): Promise<void> {
    if (token?.isCancellationRequested) return Promise.reject(new CanceledError());
    if (this.active < this.options.concurrency()) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => this.waiters.push({ token, resolve, reject }));
  }

  private release(): void {
    this.active--;
    while (this.waiters.length > 0 && this.active < this.options.concurrency()) {
      const next = this.waiters.shift() as Waiter;
      this.active++;
      next.resolve();
    }
  }

  private rejectWaiters(token: CancellationLike): void {
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const waiter = this.waiters[i] as Waiter;
      if (waiter.token !== token) continue;
      this.waiters.splice(i, 1);
      waiter.reject(new CanceledError());
    }
  }
}

function sameSet(a: ReadonlySet<string>, b: readonly string[]): boolean {
  const other = new Set(b);
  return a.size === other.size && [...a].every((id) => other.has(id));
}
