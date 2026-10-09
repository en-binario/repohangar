// batch-operations :: Branch suggestions — the branch names of a repository, read from its local refs without a git
// process.

import { describe, expect, it, vi } from 'vitest';
import { readBranchRefs } from '../../src/git/fastPaths';
import { memFs } from './memFs';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(() => {
    throw new Error('no git process may start');
  }),
}));

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

describe('readBranchRefs', () => {
  it('reads loose and packed branches of the repository and of the chosen remote only', async () => {
    const fs = memFs({
      '/repo/.git/refs/heads/main': A,
      '/repo/.git/refs/heads/feature/ABC-12-notes': A,
      '/repo/.git/refs/remotes/origin/HEAD': 'ref: refs/remotes/origin/main',
      '/repo/.git/refs/remotes/origin/main': A,
      '/repo/.git/refs/remotes/upstream/release': A,
      '/repo/.git/packed-refs': [
        '# pack-refs with: peeled fully-peeled sorted',
        `${B} refs/heads/fix/login-timeout`,
        `${B} refs/remotes/origin/feature/ABC-12-invoice-pdf`,
        `${B} refs/remotes/upstream/other`,
        `${B} refs/tags/v1.0.0`,
        `^${A}`,
      ].join('\n'),
    });
    const { execFile } = await import('node:child_process');
    await expect(readBranchRefs('/repo/.git', 'origin', fs)).resolves.toEqual({
      local: ['feature/ABC-12-notes', 'fix/login-timeout', 'main'],
      remote: ['feature/ABC-12-invoice-pdf', 'main'],
    });
    expect(execFile).not.toHaveBeenCalled();
  });

  it('lists no remote branch without a remote, and nothing in a repository without refs', async () => {
    await expect(readBranchRefs('/repo/.git', null, memFs({ '/repo/.git/refs/heads/main': A }))).resolves.toEqual({ local: ['main'], remote: [] });
    await expect(readBranchRefs('/repo/.git', 'origin', memFs({ '/repo/.git/HEAD': 'ref: refs/heads/main' }))).resolves.toEqual({
      local: [],
      remote: [],
    });
  });
});
