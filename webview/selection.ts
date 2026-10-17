// The group and select-all checkboxes and the Shift+click range (dashboard: Group selection, Select all matching rows
// from the column header, Range selection with Shift+click; design D-3, D-5). Pure; used by the webview and its tests.

import type { GridItem } from './layout';

/** `empty`: the checkbox covers no row and is disabled. */
export type SelectionState = 'none' | 'some' | 'all' | 'empty';

export function selectionState(covered: readonly string[], selected: readonly string[]): SelectionState {
  if (covered.length === 0) return 'empty';
  const set = new Set(selected);
  const count = covered.filter((id) => set.has(id)).length;
  return count === 0 ? 'none' : count === covered.length ? 'all' : 'some';
}

/** The selection after a click on a checkbox that covers `covered`: all of them, or none of them when all were. */
export function applyToggle(covered: readonly string[], selected: readonly string[]): string[] {
  const state = selectionState(covered, selected);
  if (state === 'empty') return [...selected];
  if (state === 'all') {
    const drop = new Set(covered);
    return selected.filter((id) => !drop.has(id));
  }
  return [...new Set([...selected, ...covered])];
}

/** The rows shown in the grid from `anchor` through `clicked`, in grid order; null when either is not shown. */
export function rangeIds(items: readonly GridItem[], anchor: string, clicked: string): string[] | null {
  const shown = items.flatMap((i) => (i.kind === 'row' ? [i.row.id] : []));
  const from = shown.indexOf(anchor);
  const to = shown.indexOf(clicked);
  if (from < 0 || to < 0) return null;
  return shown.slice(Math.min(from, to), Math.max(from, to) + 1);
}

export interface ShiftClick {
  selected: string[];
  anchor: string;
}

/**
 * A click on a row's checkbox. Without Shift, or when the anchor is missing or not shown, it toggles the row and makes
 * it the anchor; with Shift it adds the range from the anchor and keeps the anchor.
 */
export function checkboxClick(
  items: readonly GridItem[],
  selected: readonly string[],
  anchor: string | null,
  clicked: string,
  shift: boolean,
): ShiftClick {
  const range = shift && anchor !== null ? rangeIds(items, anchor, clicked) : null;
  if (range && anchor !== null) return { selected: [...new Set([...selected, ...range])], anchor };
  const next = selected.includes(clicked) ? selected.filter((id) => id !== clicked) : [...selected, clicked];
  return { selected: next, anchor: clicked };
}
