// The result list of the last batch: what the result panel shows, the results its fix buttons and Retry failed
// replace, and the parameters Retry failed runs again with (batch-operations: Batch result panel, Retry failed; design
// D-1, D-6). No vscode import.

import { batchCounts, finishedTitle, orderLines, resultLine, type BatchPanel, type ResultLine } from '../shared/batchResult';
import type { BatchAction, BatchParams, JobResult } from '../shared/model';

export interface ResultEntry extends LineExtras {
  id: string;
  name: string;
  result: JobResult;
}

/** What a merge request line adds: its own detail and Open ↗ (mr-creation: Merge request result panel). */
export interface LineExtras {
  detail?: string;
  review?: boolean;
}

/** What the merge request panel adds: its title, the related-links line, Copy all links and every line's extras. */
export interface PanelView {
  title?: string;
  note?: string;
  links?: boolean;
  lines?: ReadonlyMap<string, LineExtras>;
}

export interface LineUpdate {
  line: ResultLine;
  counts: string;
  canRetry: boolean;
}

interface Current {
  action: BatchAction;
  params: BatchParams;
  title: string;
  note?: string;
  links?: boolean;
  /** In the panel's order */
  ids: string[];
  entries: Map<string, ResultEntry & { running: boolean }>;
}

export class BatchResults {
  private current: Current | undefined;

  get action(): BatchAction | undefined {
    return this.current?.action;
  }

  get params(): BatchParams {
    return this.current?.params ?? {};
  }

  /** Replaces the list with a finished batch, its lines ordered failed, skipped, then ok. */
  start(action: BatchAction, params: BatchParams, elapsedMs: number, entries: readonly ResultEntry[], view: PanelView = {}): BatchPanel {
    const lines = orderLines(entries.map((e) => resultLine(action, params.branch, e.id, e.name, e.result, e)));
    this.current = {
      action,
      params,
      title: view.title ?? finishedTitle(action, params.branch, elapsedMs),
      ids: lines.map((l) => l.id),
      entries: new Map(entries.map((e) => [e.id, { ...e, running: false }])),
    };
    this.apply(view);
    return this.panel() as BatchPanel;
  }

  /** Takes a new related-links line, Copy all links and line extras, as after Retry failed. */
  apply(view: PanelView): void {
    const current = this.current;
    if (!current) return;
    if (view.note !== undefined || view.lines) current.note = view.note;
    if (view.links !== undefined) current.links = view.links;
    for (const [id, extras] of view.lines ?? []) {
      const entry = current.entries.get(id);
      if (!entry) continue;
      entry.detail = extras.detail;
      entry.review = extras.review;
    }
  }

  /** The repositories of the list, in the panel's order. */
  ids(): string[] {
    return [...(this.current?.ids ?? [])];
  }

  clear(): void {
    this.current = undefined;
  }

  panel(): BatchPanel | undefined {
    const current = this.current;
    if (!current) return undefined;
    return {
      kind: current.action,
      title: current.title,
      counts: this.counts(current),
      lines: current.ids.map((id) => this.line(current, id)),
      canRetry: this.failedIds().length > 0,
      ...(current.note === undefined ? {} : { note: current.note }),
      ...(current.links === undefined ? {} : { links: current.links }),
    };
  }

  has(id: string): boolean {
    return this.current?.entries.has(id) ?? false;
  }

  /** The line of a repository, or undefined when it is not in the list. */
  lineOf(id: string): ResultLine | undefined {
    return this.current?.entries.has(id) ? this.line(this.current, id) : undefined;
  }

  failedIds(): string[] {
    const current = this.current;
    return current ? current.ids.filter((id) => current.entries.get(id)?.result.state === 'failed') : [];
  }

  /** Marks a line as running while a fix button or Retry failed acts on its repository. */
  setRunning(id: string, running: boolean): LineUpdate | undefined {
    const entry = this.current?.entries.get(id);
    if (!entry) return undefined;
    entry.running = running;
    return this.update(id);
  }

  /** Replaces the result of a repository and returns its new line. */
  replace(id: string, result: JobResult): LineUpdate | undefined {
    const entry = this.current?.entries.get(id);
    if (!entry) return undefined;
    entry.result = result;
    entry.running = false;
    return this.update(id);
  }

  private update(id: string): LineUpdate | undefined {
    const current = this.current;
    if (!current) return undefined;
    return { line: this.line(current, id), counts: this.counts(current), canRetry: this.failedIds().length > 0 };
  }

  private line(current: Current, id: string): ResultLine {
    const entry = current.entries.get(id) as ResultEntry & { running: boolean };
    const line = resultLine(current.action, current.params.branch, entry.id, entry.name, entry.result, entry);
    return entry.running ? { ...line, running: true } : line;
  }

  private counts(current: Current): string {
    return batchCounts(current.action, [...current.entries.values()].map((e) => e.result));
  }
}
