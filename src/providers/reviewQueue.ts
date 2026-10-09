// When review requests are sent (hosting-providers: Provider refresh triggers, Review request failures; design D-5):
// a queue per host flushed 2 s after its first entry, nothing while the window is unfocused, a back-off after
// failures, and a timer while a pipeline runs. No vscode import.

import type { Timers } from '../state/store';

export const QUEUE_DELAY_MS = 2_000;
export const FOCUS_THRESHOLD_MS = 60_000;
export const BACKOFF_START_MS = 60_000;
export const BACKOFF_MAX_MS = 30 * 60_000;

export type LoadOutcome = { ok: true } | { ok: false; untilMs?: number };

export interface ReviewQueuePort {
  timers: Timers;
  focused(): boolean;
  /** The host of a repository's review request, or undefined when it gets none */
  hostOf(id: string): string | undefined;
  /** Every repository that gets a review request */
  all(): string[];
  /** Ms since the repository's review state was loaded, or undefined when it never was */
  age(id: string): number | undefined;
  /** A listed review has a running or pending pipeline */
  activePipelines(): boolean;
  /** `repohangar.providers.refreshMinutes` */
  refreshMinutes(): number;
  /** Sends one request for these repositories of the host */
  load(host: string, ids: string[]): Promise<LoadOutcome>;
}

interface HostQueue {
  pending: Set<string>;
  timer: unknown;
  inFlight: boolean;
  failures: number;
  /** No request before this epoch ms */
  until: number;
}

export class ReviewQueue {
  private readonly hosts = new Map<string, HostQueue>();
  private periodic: unknown;
  private disposed = false;

  constructor(private readonly port: ReviewQueuePort) {}

  private host(name: string): HostQueue {
    let queue = this.hosts.get(name);
    if (!queue) {
      queue = { pending: new Set(), timer: undefined, inFlight: false, failures: 0, until: 0 };
      this.hosts.set(name, queue);
    }
    return queue;
  }

  /** A branch or head SHA changed, or RepoHangar pushed the repository: one request 2 s after the first entry. */
  queue(id: string): void {
    const name = this.port.hostOf(id);
    if (name === undefined) return;
    const queue = this.host(name);
    queue.pending.add(id);
    this.schedule(name, queue, QUEUE_DELAY_MS);
  }

  /** `repohangar.refresh`: every repository at once, with the back-off reset. */
  refresh(): Promise<void> {
    const byHost = new Map<string, string[]>();
    for (const id of this.port.all()) {
      const name = this.port.hostOf(id);
      if (name === undefined) continue;
      byHost.set(name, [...(byHost.get(name) ?? []), id]);
    }
    const loads: Promise<void>[] = [];
    for (const [name, ids] of byHost) {
      const queue = this.host(name);
      queue.failures = 0;
      queue.until = 0;
      for (const id of ids) queue.pending.add(id);
      loads.push(this.flush(name, queue));
    }
    return Promise.all(loads).then(() => undefined);
  }

  /** Loads these repositories at once (after a sign-in, or when a host's credential was first found). */
  loadNow(ids: readonly string[]): Promise<void> {
    const hosts = new Set<string>();
    for (const id of ids) {
      const name = this.port.hostOf(id);
      if (name === undefined) continue;
      this.host(name).pending.add(id);
      hosts.add(name);
    }
    return Promise.all([...hosts].map((name) => this.flush(name, this.host(name)))).then(() => undefined);
  }

  /** Clears the back-off of a host (after a successful sign-in). */
  resetBackoff(name: string): void {
    const queue = this.hosts.get(name);
    if (!queue) return;
    queue.failures = 0;
    queue.until = 0;
  }

  /** The window gained or lost focus. */
  windowFocusChanged(focused: boolean): void {
    if (!focused) {
      for (const queue of this.hosts.values()) this.clearTimer(queue);
      this.stopPeriodic();
      return;
    }
    for (const id of this.port.all()) {
      const age = this.port.age(id);
      if (age !== undefined && age > FOCUS_THRESHOLD_MS) {
        const name = this.port.hostOf(id);
        if (name !== undefined) this.host(name).pending.add(id);
      }
    }
    for (const [name, queue] of this.hosts) if (queue.pending.size > 0) this.schedule(name, queue, QUEUE_DELAY_MS);
    this.pipelinesChanged();
  }

  /** Starts or stops the timer of running pipelines. */
  pipelinesChanged(): void {
    if (this.disposed) return;
    const active = this.port.focused() && this.port.activePipelines();
    if (!active) return this.stopPeriodic();
    if (this.periodic !== undefined) return;
    this.periodic = this.port.timers.setTimeout(() => {
      this.periodic = undefined;
      void this.refreshPeriodic();
    }, this.port.refreshMinutes() * 60_000);
  }

  private async refreshPeriodic(): Promise<void> {
    if (!this.port.focused() || !this.port.activePipelines()) return;
    for (const id of this.port.all()) {
      const name = this.port.hostOf(id);
      if (name !== undefined) this.host(name).pending.add(id);
    }
    await Promise.all([...this.hosts.entries()].map(([name, queue]) => (queue.pending.size ? this.flush(name, queue) : undefined)));
    this.pipelinesChanged();
  }

  /** Whether the last request to the host failed. */
  failing(name: string): boolean {
    return (this.hosts.get(name)?.failures ?? 0) > 0;
  }

  private schedule(name: string, queue: HostQueue, delay: number): void {
    if (!this.port.focused() || queue.timer !== undefined || queue.inFlight || this.disposed) return;
    const wait = Math.max(delay, queue.until - this.port.timers.now());
    queue.timer = this.port.timers.setTimeout(() => {
      queue.timer = undefined;
      void this.flush(name, queue);
    }, wait);
  }

  private async flush(name: string, queue: HostQueue): Promise<void> {
    this.clearTimer(queue);
    if (!this.port.focused() || queue.inFlight || queue.pending.size === 0) return;
    if (this.port.timers.now() < queue.until) return this.schedule(name, queue, 0);
    const ids = [...queue.pending];
    queue.pending.clear();
    queue.inFlight = true;
    let outcome: LoadOutcome;
    try {
      outcome = await this.port.load(name, ids);
    } catch {
      outcome = { ok: false };
    }
    queue.inFlight = false;
    if (outcome.ok) {
      queue.failures = 0;
      queue.until = 0;
    } else {
      queue.failures++;
      const backoff = Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * 2 ** (queue.failures - 1));
      queue.until = Math.max(outcome.untilMs ?? 0, this.port.timers.now() + backoff);
    }
    if (queue.pending.size > 0) this.schedule(name, queue, QUEUE_DELAY_MS);
    this.pipelinesChanged();
  }

  private clearTimer(queue: HostQueue): void {
    if (queue.timer !== undefined) this.port.timers.clearTimeout(queue.timer);
    queue.timer = undefined;
  }

  private stopPeriodic(): void {
    if (this.periodic !== undefined) this.port.timers.clearTimeout(this.periodic);
    this.periodic = undefined;
  }

  dispose(): void {
    this.disposed = true;
    for (const queue of this.hosts.values()) this.clearTimer(queue);
    this.stopPeriodic();
  }
}
