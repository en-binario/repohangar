// The row order of the grid (dashboard: Sort by column, Grid columns and row order; design D-1). Shared by the extension
// host and the webview; no vscode import, no Node import.

import { branchCell, compareNames, syncCell } from './format';
import type { RowData } from './model';
import { reviewCell } from './review';

export type SortColumn = 'repository' | 'branch' | 'sync' | 'changes' | 'fetched' | 'review';
export type SortDirection = 'asc' | 'desc';

export interface Sort {
  column: SortColumn;
  direction: SortDirection;
}

export const SORT_COLUMNS: readonly SortColumn[] = ['repository', 'branch', 'sync', 'changes', 'fetched', 'review'];
export const SORT_DIRECTIONS: readonly SortDirection[] = ['asc', 'desc'];

export const DEFAULT_SORT: Sort = { column: 'repository', direction: 'asc' };

/** The direction of the first click on a column: the order that puts what needs attention first. */
export const FIRST_DIRECTION: Record<SortColumn, SortDirection> = {
  repository: 'asc',
  branch: 'asc',
  sync: 'desc',
  changes: 'desc',
  fetched: 'desc',
  review: 'desc',
};

export const SORT_LABELS: Record<SortColumn, string> = {
  repository: 'Repository',
  branch: 'Branch',
  sync: 'Sync',
  changes: 'Changes',
  fetched: 'Fetched',
  review: 'MR / PR',
};

export function isSort(value: unknown): value is Sort {
  if (typeof value !== 'object' || value === null) return false;
  const { column, direction } = value as Record<string, unknown>;
  return (SORT_COLUMNS as readonly unknown[]).includes(column) && (SORT_DIRECTIONS as readonly unknown[]).includes(direction);
}

/** The sort after a click on a column header: first direction, then reversed, then the default. */
export function nextSort(current: Sort, clicked: SortColumn): Sort {
  const first = FIRST_DIRECTION[clicked];
  if (current.column !== clicked) return { column: clicked, direction: first };
  if (current.direction === first) return { column: clicked, direction: first === 'asc' ? 'desc' : 'asc' };
  return DEFAULT_SORT;
}

/** The header text of a column: its label, then `▲` or `▼` when it is the sorted one. */
export function headerText(column: SortColumn, sort: Sort): string {
  if (sort.column !== column) return SORT_LABELS[column];
  return `${SORT_LABELS[column]} ${sort.direction === 'asc' ? '▲' : '▼'}`;
}

type Key = string | number | readonly number[];

/** How urgent the MR / PR cell is: a higher value sorts first in the column's first (descending) direction. */
function reviewUrgency(row: RowData, now: number): number {
  const cell = reviewCell(row.review, now);
  switch (cell.kind) {
    case 'review': {
      const pipeline = cell.parts.map((p) => p.text);
      if (pipeline.includes('✗ failed')) return 6;
      if (pipeline.some((t) => t === '⟳ running' || t === '◷ pending' || t === '◷ manual')) return 5;
      if (pipeline.includes('⊘ canceled')) return 4;
      if (pipeline.includes('✓ passed')) return 3;
      return 2;
    }
    case 'pushed':
      return 2;
    case 'signIn':
    case 'unknownHost':
    case 'loading':
      return 1;
    case 'none':
    case 'create':
      return 0;
  }
}

/** The value a row sorts by in a column, from what its cell shows. */
export function sortKey(row: RowData, column: SortColumn, now: number): Key {
  switch (column) {
    case 'repository':
      return row.name.toLowerCase();
    case 'branch':
      return branchCell(row).text.toLowerCase();
    case 'sync': {
      const text = syncCell(row).text;
      if (text === '—') return [0, 0, 0];
      if (text === '⇡ publish') return [0, 0, 1];
      const head = row.head.kind === 'branch' ? row.head : undefined;
      return [head?.behind ?? 0, head?.ahead ?? 0, 0];
    }
    case 'changes': {
      const c = row.counts;
      return [c.conflicts, c.unstaged + c.staged + c.untracked, row.stashes];
    }
    case 'fetched':
      return row.lastFetch === null ? Number.POSITIVE_INFINITY : now - row.lastFetch;
    case 'review':
      return reviewUrgency(row, now);
  }
}

function compareKeys(a: Key, b: Key): number {
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'number' && typeof b === 'number') return a === b ? 0 : a < b ? -1 : 1;
  const x = a as readonly number[];
  const y = b as readonly number[];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const order = compareKeys(x[i] as number, y[i] as number);
    if (order !== 0) return order;
  }
  return x.length - y.length;
}

/** Compares rows by the sort; equal keys fall back to the repository name A→Z in both directions. */
export function compareRows(sort: Sort, now: number): (a: RowData, b: RowData) => number {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return (a, b) =>
    sign * compareKeys(sortKey(a, sort.column, now), sortKey(b, sort.column, now)) ||
    compareNames(a.name, b.name) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
