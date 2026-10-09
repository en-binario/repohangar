// explorer-open-in-git-graph :: Repository scanner matrix (R1–R6), the repository root of a folder, and every case of
// Git Graph Opener's repositories.test.ts.

import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DirectoryPort } from '../../src/git/fsPort';
import { findRepoRoot, mergeRoots, scanRepositories } from '../../src/git/repoRoots';
import { memFs } from './memFs';

const W = resolve('/ws');
const at = (...parts: string[]) => join(W, ...parts);

/** A workspace from entries below `/ws`: `x/` is a folder, anything else a file. */
function workspace(entries: string[]): DirectoryPort {
  const files: Record<string, string> = {};
  const dirs = [W];
  for (const entry of entries) {
    if (entry.endsWith('/')) dirs.push(at(entry));
    else files[at(entry)] = '';
  }
  return memFs(files, dirs);
}

describe('Repository scanner matrix', () => {
  it.each([
    // # | entries | depth | roots | why
    ['R1 a folder with a .git entry at or above the scan depth is a root and not descended', ['svc/.git/', 'svc/inner/.git/', 'team/svc/.git/'], 2, [at('svc'), at('team', 'svc')]],
    ['R2 a folder without .git below the scan depth is descended', ['team/svc/.git/'], 2, [at('team', 'svc')]],
    ['R3 a folder without .git at the scan depth is not descended', ['team/svc/.git/'], 1, []],
    ['R4 a folder deeper than the scan depth is never reached', ['a/b/c/deep/.git/'], 3, []],
    ['R5 node_modules is neither a root nor descended', ['node_modules/.git/', 'node_modules/dependency/.git/'], 3, []],
  ] as [string, string[], number, string[]][])('%s', async (_name, entries, depth, roots) => {
    expect(await scanRepositories([W], depth, workspace(entries))).toEqual(roots);
  });

  it('R6 an unreadable folder is skipped silently', async () => {
    const base = workspace(['locked/svc/.git/', 'open/svc/.git/']);
    const fs: DirectoryPort = {
      ...base,
      readdir: async (path) => {
        if (path === at('locked')) throw new Error('EACCES: permission denied');
        return base.readdir(path);
      },
    };
    expect(await scanRepositories([W], 3, fs)).toEqual([at('open', 'svc')]);
  });
});

describe('findRepoRoot', () => {
  it('returns the folder itself when it holds a .git directory', async () => {
    expect(await findRepoRoot(W, workspace(['.git/']))).toBe(W);
  });

  it('returns the folder itself when .git is a file, as in a worktree', async () => {
    expect(await findRepoRoot(W, workspace(['.git']))).toBe(W);
  });

  it('walks up from a nested subfolder to the repository root', async () => {
    expect(await findRepoRoot(at('src', 'main'), workspace(['.git/', 'src/main/']))).toBe(W);
  });

  it('returns null for a folder outside every repository', async () => {
    expect(await findRepoRoot(at('docs'), workspace(['docs/']))).toBeNull();
  });
});

describe('scanRepositories', () => {
  it('detects nested service repositories', async () => {
    const fs = workspace(['mr-api-sp-filenet/.git/', 'mr-api-sp-orders/.git/', 'notes/']);
    expect(await scanRepositories([W], 3, fs)).toEqual([at('mr-api-sp-filenet'), at('mr-api-sp-orders')]);
  });

  it('with depth 0 only considers the workspace folder itself', async () => {
    expect(await scanRepositories([W], 0, workspace(['.git/']))).toEqual([W]);
    expect(await scanRepositories([W], 0, workspace(['service/.git/']))).toEqual([]);
  });

  it('does not descend into a detected repository', async () => {
    expect(await scanRepositories([W], 3, workspace(['outer/.git/', 'outer/nested/.git/']))).toEqual([at('outer')]);
  });

  it('skips node_modules', async () => {
    expect(await scanRepositories([W], 3, workspace(['node_modules/dependency/.git/']))).toEqual([]);
  });

  it('ignores repositories deeper than the configured depth', async () => {
    const fs = workspace(['a/b/c/deep/.git/']);
    expect(await scanRepositories([W], 3, fs)).toEqual([]);
    expect(await scanRepositories([W], 4, fs)).toEqual([at('a', 'b', 'c', 'deep')]);
  });

  it('reports a repository once when workspace folders are nested', async () => {
    expect(await scanRepositories([W, at('service')], 3, workspace(['service/.git/']))).toEqual([at('service')]);
  });

  it('tolerates a workspace folder that cannot be read', async () => {
    expect(await scanRepositories([resolve('/missing-workspace-folder')], 3, workspace([]))).toEqual([]);
  });
});

describe('mergeRoots', () => {
  it('deduplicates case-insensitively on Windows and keeps the first spelling', () => {
    expect(mergeRoots([['C:\\ws\\Ledger'], ['c:\\ws\\ledger', 'c:\\ws\\web-shop']], 'win32')).toEqual(['C:\\ws\\Ledger', 'c:\\ws\\web-shop']);
  });

  it('keeps paths that differ in case on Linux', () => {
    expect(mergeRoots([['/ws/Ledger'], ['/ws/ledger']], 'linux')).toEqual(['/ws/Ledger', '/ws/ledger']);
  });
});
