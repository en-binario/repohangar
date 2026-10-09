// mr-creation :: the target commit of the [Create MR] cell (Create button matrix), read from the git dir without a
// git process.

import { describe, expect, it, vi } from 'vitest';
import { readRef } from '../../src/git/fastPaths';
import { memFs } from './memFs';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(() => {
    throw new Error('no git process may start');
  }),
}));

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

const rows: [string, Record<string, string>, string | null][] = [
  ['reads a loose ref', { '/repo/.git/refs/remotes/origin/main': `${A}\n` }, A],
  ['reads a packed ref', { '/repo/.git/packed-refs': `# pack-refs with: peeled\n${B} refs/remotes/origin/main\n^${A}\n` }, B],
  ['prefers the loose ref to the packed one', { '/repo/.git/refs/remotes/origin/main': A, '/repo/.git/packed-refs': `${B} refs/remotes/origin/main\n` }, A],
  ['ignores another ref of packed-refs', { '/repo/.git/packed-refs': `${B} refs/remotes/origin/mainline\n` }, null],
  ['returns null without the ref', { '/repo/.git/HEAD': 'ref: refs/heads/main' }, null],
];

describe('readRef', () => {
  it.each(rows)('%s', async (_name, files, expected) => {
    const { execFile } = await import('node:child_process');
    await expect(readRef('/repo/.git', 'refs/remotes/origin/main', memFs(files))).resolves.toBe(expected);
    expect(execFile).not.toHaveBeenCalled();
  });
});
