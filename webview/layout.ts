// Which group headers and rows the grid shows, in order. Pure; used by the webview and its tests.

import { compareNames, matchesFilter } from '../src/shared/format';
import type { ChipId, GroupingMode, RowData } from '../src/shared/model';
import { compareRows, DEFAULT_SORT, type Sort } from '../src/shared/sort';

export type GridItem =
  /** `ids`: the rows the header counts, also while the group is collapsed (dashboard: Group selection) */
  | { kind: 'group'; key: string; name: string; count: number; collapsed: boolean; ids: string[] }
  | { kind: 'row'; key: string; row: RowData };

export function rowKey(id: string): string {
  return `row:${id}`;
}

export function groupKey(name: string): string {
  return `group:${name}`;
}

/** The rows that match the filter text and every active chip, whether or not their group is collapsed. */
export function matchingIds(rows: readonly RowData[], filter: string, chips: readonly ChipId[]): string[] {
  return rows.filter((r) => matchesFilter(r, filter, chips)).map((r) => r.id);
}

/** Groups by name; the rows of each group (or every row with `none`) in the order of `sort`. */
export function layout(
  rows: readonly RowData[],
  grouping: GroupingMode,
  collapsed: readonly string[],
  filter: string,
  chips: readonly ChipId[],
  sort: Sort = DEFAULT_SORT,
  now = Date.now(),
): GridItem[] {
  const shown = rows.filter((r) => matchesFilter(r, filter, chips)).sort(compareRows(sort, now));
  if (grouping === 'none') return shown.map((row) => ({ kind: 'row', key: rowKey(row.id), row }));

  const groups = new Map<string, RowData[]>();
  for (const row of shown) {
    const name = row.group ?? '';
    const list = groups.get(name) ?? [];
    list.push(row);
    groups.set(name, list);
  }
  const items: GridItem[] = [];
  for (const name of [...groups.keys()].sort(compareNames)) {
    const members = groups.get(name) as RowData[];
    const isCollapsed = collapsed.includes(name);
    const ids = members.map((r) => r.id);
    items.push({ kind: 'group', key: groupKey(name), name, count: members.length, collapsed: isCollapsed, ids });
    if (!isCollapsed) for (const row of members) items.push({ kind: 'row', key: rowKey(row.id), row });
  }
  return items;
}
