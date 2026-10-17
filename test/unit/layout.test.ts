import { describe, expect, it } from 'vitest';
import type { RowData } from '../../src/shared/model';
import { layout, matchingIds, type GridItem } from '../../webview/layout';
import { row } from './rows';

const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);

function repo(group: string, name: string, behind = 0): RowData {
  return row({
    id: `file:///home/dev/code/acme/${group}/${name}`,
    name,
    path: `/home/dev/code/acme/${group}/${name}`,
    group,
    head: { kind: 'branch', name: 'main', upstream: 'origin/main', ahead: 0, behind },
  });
}

const rows = [
  repo('infra', 'infra-charts', 1),
  repo('backend', 'ledger', 0),
  repo('frontend', 'web-shop', 5),
  repo('backend', 'billing-api', 4),
  repo('frontend', 'checkout-ui', 0),
];

const describeItem = (i: GridItem) => (i.kind === 'group' ? `# ${i.name}` : i.row.name);

describe('layout', () => {
  // dashboard :: Groups keep their order under a sort
  it('keeps groups by name and sorts the rows within each group', () => {
    const items = layout(rows, 'parentFolder', [], '', [], { column: 'sync', direction: 'desc' }, NOW);
    expect(items.map(describeItem)).toEqual(['# backend', 'billing-api', 'ledger', '# frontend', 'web-shop', 'checkout-ui', '# infra', 'infra-charts']);
  });

  it('sorts every row with the grouping mode none', () => {
    const items = layout(rows, 'none', [], '', [], { column: 'sync', direction: 'desc' }, NOW);
    expect(items.map(describeItem)).toEqual(['web-shop', 'billing-api', 'infra-charts', 'checkout-ui', 'ledger']);
  });

  it('orders rows by repository name by default', () => {
    const items = layout(rows, 'parentFolder', [], '', []);
    expect(items.map(describeItem)).toEqual(['# backend', 'billing-api', 'ledger', '# frontend', 'checkout-ui', 'web-shop', '# infra', 'infra-charts']);
  });

  it('gives a collapsed group the ids of the rows it counts', () => {
    const items = layout(rows, 'parentFolder', ['frontend'], 'e', [], undefined, NOW);
    const frontend = items.find((i) => i.kind === 'group' && i.name === 'frontend');
    expect(frontend).toMatchObject({ count: 2, collapsed: true, ids: [rows[4]?.id, rows[2]?.id] });
    expect(items.some((i) => i.kind === 'row' && i.row.group === 'frontend')).toBe(false);
  });

  it('lists the matching rows of collapsed groups too', () => {
    expect(matchingIds(rows, 'shop', [])).toEqual([rows[2]?.id]);
  });
});
