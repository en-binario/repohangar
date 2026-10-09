// Local state the Git API does not expose, read from files without starting a process (design D-7):
// the operation in progress, the last fetch time and the stash count. No vscode import.

import { resolve } from 'node:path';
import type { Operation } from '../shared/model';
import type { FileSystemPort } from './fsPort';

async function readNumber(fs: FileSystemPort, path: string): Promise<number | undefined> {
  const text = (await fs.readFile(path))?.trim();
  if (!text || !/^\d+$/.test(text)) return undefined;
  return Number(text);
}

async function rebase(fs: FileSystemPort, dir: string, stepFile: string, totalFile: string): Promise<Operation | null> {
  if (!(await fs.stat(dir))?.isDirectory) return null;
  const step = await readNumber(fs, resolve(dir, stepFile));
  const total = await readNumber(fs, resolve(dir, totalFile));
  return step !== undefined && total !== undefined ? { kind: 'rebase', step, total } : { kind: 'rebase' };
}

/** The operation in progress, from the markers in the repository's own git dir: rebase, merge, cherry-pick, revert. */
export async function readOperation(gitDir: string, fs: FileSystemPort): Promise<Operation | null> {
  const merging = await rebase(fs, resolve(gitDir, 'rebase-merge'), 'msgnum', 'end');
  if (merging) return merging;
  const applying = await rebase(fs, resolve(gitDir, 'rebase-apply'), 'next', 'last');
  if (applying) return applying;
  if (await fs.stat(resolve(gitDir, 'MERGE_HEAD'))) return { kind: 'merge' };
  if (await fs.stat(resolve(gitDir, 'CHERRY_PICK_HEAD'))) return { kind: 'cherry-pick' };
  if (await fs.stat(resolve(gitDir, 'REVERT_HEAD'))) return { kind: 'revert' };
  return null;
}

/** Epoch ms of the newer FETCH_HEAD of the git dir and the common git dir, or null when neither exists. */
export async function readLastFetch(gitDir: string, commonDir: string, fs: FileSystemPort): Promise<number | null> {
  const dirs = gitDir === commonDir ? [gitDir] : [gitDir, commonDir];
  let newest: number | null = null;
  for (const dir of dirs) {
    const s = await fs.stat(resolve(dir, 'FETCH_HEAD'));
    if (s && (newest === null || s.mtimeMs > newest)) newest = s.mtimeMs;
  }
  return newest;
}

/**
 * Lines of `logs/refs/stash` in the common git dir; 1 when that reflog is missing but `refs/stash` exists (loose or
 * in `packed-refs`); else 0.
 */
export async function readStashCount(commonDir: string, fs: FileSystemPort): Promise<number> {
  const reflog = await fs.readFile(resolve(commonDir, 'logs', 'refs', 'stash'));
  if (reflog !== undefined) return reflog.split('\n').filter((line) => line.trim().length > 0).length;
  if (await fs.stat(resolve(commonDir, 'refs', 'stash'))) return 1;
  const packed = await fs.readFile(resolve(commonDir, 'packed-refs'));
  if (packed?.split('\n').some((line) => /^[0-9a-f]+ refs\/stash\s*$/.test(line))) return 1;
  return 0;
}

/**
 * The default branch of a remote from `refs/remotes/<remote>/HEAD` in the common git dir (`ref: refs/remotes/origin/main`
 * → `main`), or null when it is missing. Used as the target of the compare page (hosting-providers: Compare page).
 */
export async function readRemoteHead(commonDir: string, remote: string, fs: FileSystemPort): Promise<string | null> {
  const text = (await fs.readFile(resolve(commonDir, 'refs', 'remotes', remote, 'HEAD')))?.trim();
  const prefix = `ref: refs/remotes/${remote}/`;
  return text?.startsWith(prefix) ? text.slice(prefix.length) : null;
}
