import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { resolveGitDirs } from '../../src/git/gitDirs';
import { memFs } from './memFs';

const noFallback = vi.fn(async () => {
  throw new Error('fallback must not run');
});

describe('resolveGitDirs', () => {
  it('uses the .git directory of a plain repository', async () => {
    const fs = memFs({ '/code/billing-api/.git/HEAD': 'ref: refs/heads/main' });
    await expect(resolveGitDirs('/code/billing-api', fs, noFallback)).resolves.toEqual({
      gitDir: resolve('/code/billing-api/.git'),
      commonDir: resolve('/code/billing-api/.git'),
    });
  });

  it('follows the .git file and commondir of a worktree', async () => {
    const fs = memFs({
      '/code/billing-api/.git/HEAD': 'ref: refs/heads/main',
      '/code/billing-api-hotfix/.git': 'gitdir: /code/billing-api/.git/worktrees/billing-api-hotfix\n',
      '/code/billing-api/.git/worktrees/billing-api-hotfix/commondir': '../..\n',
    });
    await expect(resolveGitDirs('/code/billing-api-hotfix', fs, noFallback)).resolves.toEqual({
      gitDir: resolve('/code/billing-api/.git/worktrees/billing-api-hotfix'),
      commonDir: resolve('/code/billing-api/.git'),
    });
  });

  it('follows a relative gitdir of a submodule', async () => {
    const fs = memFs({
      '/code/platform/vendor/shared-proto/.git': 'gitdir: ../../.git/modules/shared-proto',
      '/code/platform/.git/modules/shared-proto/HEAD': 'ref: refs/heads/main',
    });
    await expect(resolveGitDirs('/code/platform/vendor/shared-proto', fs, noFallback)).resolves.toEqual({
      gitDir: resolve('/code/platform/.git/modules/shared-proto'),
      commonDir: resolve('/code/platform/.git/modules/shared-proto'),
    });
  });

  it('calls the git fallback once for an unparsable .git file', async () => {
    const fs = memFs({ '/code/odd/.git': 'not a gitdir line' });
    const fallback = vi.fn(async () => '/code/odd-git\n/code/odd-git\n');
    await expect(resolveGitDirs('/code/odd', fs, fallback)).resolves.toEqual({
      gitDir: resolve('/code/odd-git'),
      commonDir: resolve('/code/odd-git'),
    });
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
