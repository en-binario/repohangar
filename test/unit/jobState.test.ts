import { describe, expect, it } from 'vitest';
import { shownSyncCell } from '../../src/shared/format';
import type { RowJob } from '../../src/shared/model';
import { row } from './rows';

const behindTwo = { kind: 'branch', name: 'main', upstream: 'origin/main', ahead: 0, behind: 2 } as const;

// git-operations :: Job state matrix
const cases: [string, RowJob, string, string | undefined][] = [
  ['R1 shows a running fetch', { action: 'fetch', state: 'running' }, '⟳ fetching', undefined],
  ['R2 shows a running pull', { action: 'pull', state: 'running' }, '⟳ pulling', undefined],
  ['R3 leaves the cell to the sync state after a fetch', { action: 'fetch', state: 'ok' }, '↓2', undefined],
  ['R4 shows the reason of a skipped pull', { action: 'pull', state: 'skipped', detail: 'detached HEAD' }, '↷ detached HEAD', undefined],
  ['R5 shows a failed fetch with the message as tooltip',
    { action: 'fetch', state: 'failed', detail: 'Permission denied (publickey)' }, '✗ fetch failed', 'Permission denied (publickey)'],
  ['R6 shows the reason of a skipped push', { action: 'push', state: 'skipped', detail: 'behind (↓2)' }, '↷ behind (↓2)', undefined],
];

describe('shownSyncCell', () => {
  it.each(cases)('%s', (_name, job, text, tooltip) => {
    const cell = shownSyncCell(row({ head: behindTwo, job }));
    expect(cell.text).toBe(text);
    expect(cell.tooltip).toBe(tooltip);
  });
});
