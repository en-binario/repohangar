// Group assignment (repo-registry: Repository groups). No vscode import.

import type { GroupingMode } from '../shared/model';

export const OTHER_GROUP = 'Other';

export interface FolderRef {
  name: string;
  /** Absolute path */
  path: string;
}

export type GroupsSetting = Readonly<Record<string, unknown>>;

function toSlashes(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

function segments(path: string): string[] {
  return toSlashes(path).split('/').filter((s) => s.length > 0);
}

/** Converts a glob (`**`, `*`, `?`) to a regular expression over a whole `/`-separated path. */
export function globToRegExp(glob: string, caseInsensitive: boolean): RegExp {
  let out = '';
  const g = toSlashes(glob);
  for (let i = 0; i < g.length; i++) {
    const c = g[i] as string;
    if (c === '*') {
      if (g[i + 1] === '*') {
        i++;
        if (g[i + 1] === '/') {
          i++;
          out += '(?:.*/)?';
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`, caseInsensitive ? 'i' : '');
}

function contains(folder: string, child: string, caseInsensitive: boolean): boolean {
  const f = segments(folder);
  const c = segments(child);
  if (f.length > c.length) return false;
  return f.every((s, i) => (caseInsensitive ? s.toLowerCase() === (c[i] as string).toLowerCase() : s === c[i]));
}

/**
 * The group of a repository root under a grouping mode, or null for `none`.
 * `platform` decides case sensitivity: case-insensitive on Windows only.
 */
export function assignGroup(
  mode: GroupingMode,
  rootPath: string,
  workspaceFolders: readonly FolderRef[],
  groups: GroupsSetting,
  platform: string,
): string | null {
  const caseInsensitive = platform === 'win32';
  switch (mode) {
    case 'none':
      return null;
    case 'parentFolder': {
      const parts = segments(rootPath);
      return parts.length >= 2 ? (parts[parts.length - 2] as string) : OTHER_GROUP;
    }
    case 'workspaceFolder': {
      const matches = workspaceFolders.filter((f) => contains(f.path, rootPath, caseInsensitive));
      // The innermost folder wins when workspace folders are nested.
      matches.sort((a, b) => segments(b.path).length - segments(a.path).length);
      return matches[0]?.name ?? OTHER_GROUP;
    }
    case 'custom': {
      const path = toSlashes(rootPath);
      for (const [name, globs] of Object.entries(groups)) {
        if (!Array.isArray(globs)) continue;
        for (const glob of globs) {
          if (typeof glob === 'string' && globToRegExp(glob, caseInsensitive).test(path)) return name;
        }
      }
      return OTHER_GROUP;
    }
  }
}
