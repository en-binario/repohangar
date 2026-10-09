import { describe, expect, it } from 'vitest';
import { readLastFetch } from '../../src/git/fastPaths';
import { fetchedCell } from '../../src/shared/format';
import { memFs } from './memFs';

const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);
const s = 1000;
const min = 60 * s;
const h = 60 * min;

type Files = Record<string, { content: string; mtimeMs: number }>;
const fetchHead = (age: number): Files => ({ '/repo/.git/FETCH_HEAD': { content: 'x', mtimeMs: NOW - age } });

// dashboard :: Fetched cell matrix — git dir /repo/.git; R10 is a worktree with its own git dir.
const rows: [string, Files, string, number, string][] = [
  ['shows never without FETCH_HEAD', {}, '/repo/.git', 1, 'never'],
  ['shows now under a minute', fetchHead(30 * s), '/repo/.git', 1, 'now'],
  ['shows minutes rounded down', fetchHead(4 * min + 50 * s), '/repo/.git', 1, '4 min'],
  ['shows 59 min', fetchHead(59 * min), '/repo/.git', 1, '59 min'],
  ['marks exactly the stale age', fetchHead(1 * h), '/repo/.git', 1, '1 h ⚠'],
  ['marks hours past the stale age', fetchHead(2 * h + 10 * min), '/repo/.git', 1, '2 h ⚠'],
  ['does not mark hours under a higher stale age', fetchHead(2 * h + 10 * min), '/repo/.git', 3, '2 h'],
  ['shows days', fetchHead(26 * h), '/repo/.git', 1, '1 d ⚠'],
  ['turns the marker off with 0', fetchHead(26 * h), '/repo/.git', 0, '1 d'],
  [
    'uses the newer FETCH_HEAD of a worktree',
    {
      '/repo/.git/FETCH_HEAD': { content: 'x', mtimeMs: NOW - 4 * min },
      '/repo/.git/worktrees/hotfix/FETCH_HEAD': { content: 'x', mtimeMs: NOW - 3 * h },
    },
    '/repo/.git/worktrees/hotfix',
    1,
    '4 min',
  ],
];

describe('fetchedCell', () => {
  it.each(rows)('%s', async (_name, files, gitDir, staleHours, text) => {
    const lastFetch = await readLastFetch(gitDir, '/repo/.git', memFs({ '/repo/.git/HEAD': 'x', ...files }));
    expect(fetchedCell(lastFetch, NOW, staleHours).text).toBe(text);
  });
});
