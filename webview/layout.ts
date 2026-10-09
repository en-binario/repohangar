// Which group headers and rows the grid shows, in order. Pure; used by the webview and its tests.

import { compareNames, matchesFilter } from '../src/shared/format';
import type { ChipId, GroupingMode, RowData } from '../src/shared/model';

export type GridItem =
  | { kind: 'group'; key: string; name: string; count: number; collapsed: boolean }
  | { kind: 'row'; key: string; row: RowData };

export function rowKey(id: string): string {
  return `row:${id}`;
}

export function groupKey(name: string): string {
  return `group:${name}`;
}

export function layout(
  rows: readonly RowData[],
  grouping: GroupingMode,
  collapsed: readonly string[],
  filter: string,
  chips: readonly ChipId[],
): GridItem[] {
  const shown = rows.filter((r) => matchesFilter(r, filter, chips)).sort((a, b) => compareNames(a.name, b.name));
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
    items.push({ kind: 'group', key: groupKey(name), name, count: members.length, collapsed: isCollapsed });
    if (!isCollapsed) for (const row of members) items.push({ kind: 'row', key: rowKey(row.id), row });
  }
  return items;
}
