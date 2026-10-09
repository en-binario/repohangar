// Local state the Git API does not expose, read from files without starting a process (design D-7):
// the operation in progress, the last fetch time, the stash count and the branch names. Also the local Git commands
// the API lacks: `git stash push` and `git check-ref-format` (add-multi-repo-branches design D-3, D-4). No vscode import.

import { resolve } from 'node:path';
import type { Operation } from '../shared/model';
import type { DirectoryPort, FileSystemPort } from './fsPort';
import { runGit } from './process';

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

/**
 * The commit of a full ref name (`refs/remotes/origin/main`), loose in the common git dir or in `packed-refs`, or
 * null. The Git extension's `state.refs` is no longer filled, so the [Create MR] cell reads its target here.
 */
export async function readRef(commonDir: string, ref: string, fs: FileSystemPort): Promise<string | null> {
  const loose = (await fs.readFile(resolve(commonDir, ...ref.split('/'))))?.trim();
  if (loose && /^[0-9a-f]{40,64}$/.test(loose)) return loose;
  const packed = await fs.readFile(resolve(commonDir, 'packed-refs'));
  for (const line of packed?.split('\n') ?? []) {
    const [sha, name] = line.trim().split(' ');
    if (name === ref && sha && /^[0-9a-f]{40,64}$/.test(sha)) return sha;
  }
  return null;
}

/** The ref names below a folder of the common git dir (`refs/heads` → `main`, `feature/x`); none when it is missing. */
async function looseRefs(fs: DirectoryPort, dir: string, prefix = ''): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const names = await Promise.all(
    entries.map((e) => (e.isDirectory ? looseRefs(fs, resolve(dir, e.name), `${prefix}${e.name}/`) : Promise.resolve([`${prefix}${e.name}`]))),
  );
  return names.flat();
}

export interface BranchRefs {
  /** Local branch names */
  local: string[];
  /** Branch names of `remote`, without `<remote>/` and without `HEAD` */
  remote: string[];
}

/**
 * The local branches and the branches of a remote, from the loose refs and `packed-refs` of the common git dir. The
 * Git extension's `state.refs` is no longer filled, and the branch suggestions must not start a process.
 */
export async function readBranchRefs(commonDir: string, remote: string | null, fs: DirectoryPort): Promise<BranchRefs> {
  const local = new Set(await looseRefs(fs, resolve(commonDir, 'refs', 'heads')));
  const remoteNames = new Set(remote ? await looseRefs(fs, resolve(commonDir, 'refs', 'remotes', remote)) : []);
  const packed = await fs.readFile(resolve(commonDir, 'packed-refs'));
  for (const line of packed?.split('\n') ?? []) {
    const name = line.trim().split(' ')[1];
    if (!name || line.startsWith('#') || line.startsWith('^')) continue;
    if (name.startsWith('refs/heads/')) local.add(name.slice('refs/heads/'.length));
    else if (remote && name.startsWith(`refs/remotes/${remote}/`)) remoteNames.add(name.slice(`refs/remotes/${remote}/`.length));
  }
  remoteNames.delete('HEAD');
  const sorted = (names: Set<string>) => [...names].sort();
  return { local: sorted(local), remote: sorted(remoteNames) };
}

/**
 * `git stash push --include-untracked -m <message>`: keeps every change, untracked files included, in a named stash.
 * Run only after the user picked Stash and switch or Stash and pull; the stash is never popped.
 */
export async function stashPush(gitPath: string, root: string, message: string): Promise<void> {
  await runGit(gitPath, ['stash', 'push', '--include-untracked', '-m', message], root);
}

/** Whether `git check-ref-format --branch <name>` accepts the name, run in a repository; no network. */
export async function validBranchName(gitPath: string, root: string, name: string): Promise<boolean> {
  try {
    await runGit(gitPath, ['check-ref-format', '--branch', name], root);
    return true;
  } catch {
    return false;
  }
}
