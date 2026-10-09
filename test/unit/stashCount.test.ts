import { describe, expect, it, vi } from 'vitest';
import { readStashCount } from '../../src/git/fastPaths';
import { memFs } from './memFs';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(() => {
    throw new Error('no git process may start');
  }),
}));

const line = (n: number) => `0000 ${n}abc Dev <dev@acme.com> 1700000000 +0000\tWIP on main: ${n}\n`;

// dashboard :: Stash count matrix
const rows: [string, Record<string, string>, number][] = [
  ['counts the lines of the stash reflog', { '/repo/.git/logs/refs/stash': line(1) + line(2) + line(3), '/repo/.git/refs/stash': 'abc' }, 3],
  ['counts 1 for a loose stash ref without a reflog', { '/repo/.git/refs/stash': 'abc\n' }, 1],
  ['counts 1 for a packed stash ref without a reflog', { '/repo/.git/packed-refs': '# pack-refs with: peeled\nabc123 refs/heads/main\ndef456 refs/stash\n' }, 1],
  ['counts 0 without a reflog or a stash ref', { '/repo/.git/HEAD': 'ref: refs/heads/main' }, 0],
];

describe('readStashCount', () => {
  it.each(rows)('%s', async (_name, files, expected) => {
    const { execFile } = await import('node:child_process');
    await expect(readStashCount('/repo/.git', memFs(files))).resolves.toBe(expected);
    expect(execFile).not.toHaveBeenCalled();
  });
});
