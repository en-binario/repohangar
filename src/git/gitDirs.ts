// Finds a repository's git dir and common git dir from the `.git` entry and `commondir`, without a process
// (design D-7). No vscode import.

import { isAbsolute, resolve } from 'node:path';
import type { FileSystemPort } from './fsPort';

export interface GitDirs {
  /** The repository's own git dir (per worktree) */
  gitDir: string;
  /** The git dir shared by all worktrees: refs, stash, packed-refs */
  commonDir: string;
}

/** Runs `git rev-parse --absolute-git-dir --git-common-dir` in the repository root and returns its output. */
export type GitDirsFallback = (root: string) => Promise<string>;

function absolute(base: string, path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(base, path);
}

async function fromFiles(root: string, fs: FileSystemPort): Promise<GitDirs | undefined> {
  const dotGit = resolve(root, '.git');
  const entry = await fs.stat(dotGit);
  if (!entry) return undefined;
  let gitDir: string;
  if (entry.isDirectory) {
    gitDir = dotGit;
  } else {
    const content = await fs.readFile(dotGit);
    const match = /^gitdir:\s*(.+?)\s*$/m.exec(content ?? '');
    if (!match?.[1]) return undefined;
    gitDir = absolute(root, match[1]);
  }
  if (!(await fs.stat(gitDir))?.isDirectory) return undefined;
  const commondir = (await fs.readFile(resolve(gitDir, 'commondir')))?.trim();
  return { gitDir, commonDir: commondir ? absolute(gitDir, commondir) : gitDir };
}

export async function resolveGitDirs(
  root: string,
  fs: FileSystemPort,
  fallback: GitDirsFallback,
): Promise<GitDirs | undefined> {
  const dirs = await fromFiles(root, fs);
  if (dirs) return dirs;
  try {
    const [gitDir, commonDir] = (await fallback(root)).split(/\r?\n/).map((l) => l.trim());
    if (!gitDir) return undefined;
    return { gitDir: absolute(root, gitDir), commonDir: absolute(root, commonDir || gitDir) };
  } catch {
    return undefined;
  }
}
