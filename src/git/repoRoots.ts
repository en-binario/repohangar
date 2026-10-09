// Repository roots on disk, ported from Git Graph Opener (explorer-open-in-git-graph: Open Git Graph, Repository
// roots; design D-1): the repository that contains a folder, and the scan of the workspace folders. No vscode import.

import { dirname, join, resolve } from 'node:path';
import type { DirectoryPort } from './fsPort';

async function hasGitEntry(folderPath: string, fs: DirectoryPort): Promise<boolean> {
  return (await fs.stat(join(folderPath, '.git'))) !== undefined;
}

/** The nearest ancestor-or-self folder with a `.git` entry (directory or file), or null outside every repository. */
export async function findRepoRoot(folderPath: string, fs: DirectoryPort): Promise<string | null> {
  let current = resolve(folderPath);
  for (;;) {
    if (await hasGitEntry(current, fs)) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * The repository roots in the workspace folders down to `depth` levels below each (`0` checks only the folder
 * itself). The scan does not descend into a repository or a `node_modules` folder and skips unreadable folders.
 */
export async function scanRepositories(workspaceFolderPaths: readonly string[], depth: number, fs: DirectoryPort): Promise<string[]> {
  const roots = new Set<string>();
  for (const workspaceFolderPath of workspaceFolderPaths) {
    await collectRepositories(workspaceFolderPath, depth, roots, fs);
  }
  return [...roots].sort();
}

async function collectRepositories(folderPath: string, remainingDepth: number, roots: Set<string>, fs: DirectoryPort): Promise<void> {
  if (await hasGitEntry(folderPath, fs)) {
    roots.add(folderPath);
    return;
  }
  if (remainingDepth <= 0) return;
  let entries;
  try {
    entries = await fs.readdir(folderPath);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory && entry.name !== 'node_modules') {
      await collectRepositories(join(folderPath, entry.name), remainingDepth - 1, roots, fs);
    }
  }
}

/** The union of root paths, in first-seen order, deduplicated case-insensitively on Windows (design D-3). */
export function mergeRoots(lists: readonly (readonly string[])[], platform: string): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const path of lists.flat()) {
    const key = platform === 'win32' ? path.toLowerCase() : path;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(path);
  }
  return merged;
}
