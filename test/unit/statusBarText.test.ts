import { describe, expect, it } from 'vitest';
import { statusBarModel } from '../../src/shared/format';
import type { RowData } from '../../src/shared/model';
import { counts, row } from './rows';

/** n rows, the first `behind` of them behind by 1 and the last `dirty` of them dirty. */
function repos(n: number, behind: number, dirty: number): RowData[] {
  return Array.from({ length: n }, (_, i) =>
    row({
      id: `repo-${i}`,
      name: `svc-${String(i + 1).padStart(2, '0')}`,
      head: { kind: 'branch', name: 'main', upstream: 'origin/main', ahead: 0, behind: i < behind ? 1 : 0 },
      counts: i >= n - dirty ? counts(0, 1, 0, 0) : counts(0, 0, 0, 0),
    }),
  );
}

// status-bar :: Status bar text matrix
const rows: [string, boolean, number, number, number, string | null][] = [
  ['is hidden when the setting is off', false, 14, 3, 2, null],
  ['is hidden without repositories', true, 0, 0, 0, null],
  ['shows one repo', true, 1, 0, 0, '$(git-branch) 1 repo'],
  ['shows the repository count', true, 14, 0, 0, '$(git-branch) 14 repos'],
  ['adds the behind count', true, 14, 3, 0, '$(git-branch) 14 repos  $(arrow-down)3'],
  ['adds the dirty count', true, 14, 0, 2, '$(git-branch) 14 repos  $(circle-filled)2'],
  ['adds both counts', true, 14, 3, 2, '$(git-branch) 14 repos  $(arrow-down)3  $(circle-filled)2'],
];

describe('statusBarModel text', () => {
  it.each(rows)('%s', (_name, enabled, n, behind, dirty, text) => {
    const model = statusBarModel(repos(n, behind, dirty), enabled);
    expect(model.visible).toBe(text !== null);
    if (text !== null) expect(model.text).toBe(text);
  });
});
