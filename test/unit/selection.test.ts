import { describe, expect, it } from 'vitest';
import type { RowData } from '../../src/shared/model';
import { layout, matchingIds, type GridItem } from '../../webview/layout';
import { applyToggle, checkboxClick, selectionState, type SelectionState } from '../../webview/selection';
import { row } from './rows';

function repo(group: string, name: string): RowData {
  return row({ id: `file:///home/dev/code/acme/${group}/${name}`, name, path: `/home/dev/code/acme/${group}/${name}`, group });
}

const id = (group: string, name: string) => `file:///home/dev/code/acme/${group}/${name}`;
const b = (name: string) => id('backend', name);

function header(items: GridItem[], name: string): Extract<GridItem, { kind: 'group' }> {
  const item = items.find((i) => i.kind === 'group' && i.name === name);
  if (item?.kind !== 'group') throw new Error(`no header ${name}`);
  return item;
}

describe('group checkbox', () => {
  const backend = ['auth-service', 'billing-api', 'ledger', 'notifications', 'payments-api'].map((n) => repo('backend', n));
  const all = backend.map((r) => r.id);

  // dashboard :: Group checkbox matrix
  const cases: [string, string, boolean, number, string[], SelectionState, string[], SelectionState][] = [
    ['selects the whole group when none is selected', '', false, 5, [], 'none', all, 'all'],
    ['selects the whole group when some are selected', '', false, 5, [b('ledger'), b('auth-service')], 'some', all, 'all'],
    ['clears the whole group when all are selected', '', false, 5, all, 'all', [], 'none'],
    ['selects the rows of a collapsed group', '', true, 5, [], 'none', all, 'all'],
    ['selects only the rows the filter shows and keeps a hidden selected row', 'api', false, 2, [b('ledger')], 'none', [b('ledger'), b('billing-api'), b('payments-api')], 'all'],
    ['clears only the rows the filter shows and keeps a hidden selected row', 'api', false, 2, [b('ledger'), b('billing-api'), b('payments-api')], 'all', [b('ledger')], 'none'],
  ];

  it.each(cases)('%s', (_name, filter, collapsed, count, before, stateBefore, after, stateAfter) => {
    const items = layout(backend, 'parentFolder', collapsed ? ['backend'] : [], filter, []);
    const group = header(items, 'backend');
    expect(group.count).toBe(count);
    expect(group.collapsed).toBe(collapsed);
    expect(selectionState(group.ids, before)).toBe(stateBefore);
    const next = applyToggle(group.ids, before);
    expect([...next].sort()).toEqual([...after].sort());
    expect(selectionState(group.ids, next)).toBe(stateAfter);
  });
});

describe('select-all checkbox', () => {
  const others = ['auth-service', 'ledger', 'notifications', 'payments-api', 'scratch'].map((n) => repo('backend', n));
  const billing = [repo('backend', 'billing-api'), repo('frontend', 'billing-ui')];
  const infra = Array.from({ length: 7 }, (_, i) => repo('infra', `infra-chart-${i + 1}`));
  const rows = [...others, ...billing, ...infra];
  const all = rows.map((r) => r.id);
  const billIds = billing.map((r) => r.id);
  const ledger = b('ledger');
  const five = all.slice(0, 5);

  // dashboard :: Select-all checkbox matrix
  const cases: [string, string, string[], SelectionState, string[]][] = [
    ['selects every matching row when none is selected', '', [], 'none', all],
    ['selects every matching row when some are selected', '', five, 'some', all],
    ['clears every matching row when all are selected', '', all, 'all', []],
    ['selects the matching rows and keeps a hidden selected row', 'bill', [ledger], 'none', [ledger, ...billIds]],
    ['clears the matching rows and keeps a hidden selected row', 'bill', [ledger, ...billIds], 'all', [ledger]],
    ['is disabled and changes nothing when no row matches', 'zzz', [ledger, b('scratch'), b('auth-service')], 'empty', [ledger, b('scratch'), b('auth-service')]],
    ['includes the rows of a collapsed group', '', [], 'none', all],
  ];

  it('has 14 repositories', () => expect(rows).toHaveLength(14));

  it.each(cases)('%s', (_name, filter, before, state, after) => {
    const covered = matchingIds(rows, filter, []);
    expect(selectionState(covered, before)).toBe(state);
    expect([...applyToggle(covered, before)].sort()).toEqual([...after].sort());
  });

  it('covers the 7 rows of the collapsed group infra', () => {
    const items = layout(rows, 'parentFolder', ['infra'], '', []);
    expect(items.some((i) => i.kind === 'row' && i.row.group === 'infra')).toBe(false);
    expect(matchingIds(rows, '', [])).toEqual(expect.arrayContaining(infra.map((r) => r.id)));
  });
});

describe('Shift+click range', () => {
  const backend = ['auth-service', 'billing-api', 'ledger', 'notifications'].map((n) => repo('backend', n));
  const infra = Array.from({ length: 7 }, (_, i) => repo('infra', `infra-chart-${i + 1}`));
  const tools = [repo('tools', 'scratch')];
  const rows = [...backend, ...infra, ...tools];
  const grid = layout(rows, 'parentFolder', ['infra'], '', []);
  const filtered = layout(rows, 'parentFolder', ['infra'], 'api', []);
  const scratch = id('tools', 'scratch');

  // dashboard :: Range selection matrix
  const cases: [string, GridItem[], string | null, string, string[], string[], string][] = [
    ['toggles only the clicked row without an anchor', grid, null, b('ledger'), [], [b('ledger')], b('ledger')],
    ['selects the rows from the anchor down to the clicked row', grid, b('billing-api'), b('notifications'), [b('billing-api')], [b('billing-api'), b('ledger'), b('notifications')], b('billing-api')],
    ['selects the rows from the clicked row down to the anchor', grid, b('notifications'), b('auth-service'), [b('notifications')], [b('auth-service'), b('billing-api'), b('ledger'), b('notifications')], b('notifications')],
    ['skips the rows of a collapsed group', grid, b('billing-api'), scratch, [b('billing-api')], [b('billing-api'), b('ledger'), b('notifications'), scratch], b('billing-api')],
    ['never clears an already selected row', grid, b('billing-api'), b('notifications'), [b('billing-api'), b('notifications')], [b('billing-api'), b('ledger'), b('notifications')], b('billing-api')],
    ['uses an anchor that was deselected', grid, b('billing-api'), b('ledger'), [], [b('billing-api'), b('ledger')], b('billing-api')],
    ['toggles only the clicked row when the anchor is hidden', filtered, b('ledger'), b('billing-api'), [b('ledger')], [b('billing-api'), b('ledger')], b('billing-api')],
  ];

  it.each(cases)('%s', (_name, items, anchor, clicked, before, after, anchorAfter) => {
    const result = checkboxClick(items, before, anchor, clicked, true);
    expect([...result.selected].sort()).toEqual([...after].sort());
    expect(result.anchor).toBe(anchorAfter);
  });

  it('makes a plain click the anchor', () => {
    expect(checkboxClick(grid, [], b('notifications'), b('ledger'), false)).toEqual({ selected: [b('ledger')], anchor: b('ledger') });
  });
});
