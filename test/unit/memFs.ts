import { basename, dirname, resolve } from 'node:path';
import type { DirectoryPort } from '../../src/git/fsPort';

/** An in-memory file system: files map to contents (and an optional mtime); their parent folders exist. */
export function memFs(files: Record<string, string | { content: string; mtimeMs: number }>, dirs: string[] = []): DirectoryPort {
  const fileMap = new Map<string, { content: string; mtimeMs: number }>();
  const dirSet = new Set<string>();
  const addDir = (dir: string) => {
    for (let d = resolve(dir); !dirSet.has(d); d = dirname(d)) {
      dirSet.add(d);
      if (d === dirname(d)) break;
    }
  };
  for (const d of dirs) addDir(d);
  for (const [path, value] of Object.entries(files)) {
    const abs = resolve(path);
    fileMap.set(abs, typeof value === 'string' ? { content: value, mtimeMs: 0 } : value);
    addDir(dirname(abs));
  }
  return {
    async readFile(path) {
      return fileMap.get(resolve(path))?.content;
    },
    async stat(path) {
      const abs = resolve(path);
      const file = fileMap.get(abs);
      if (file) return { mtimeMs: file.mtimeMs, isDirectory: false };
      if (dirSet.has(abs)) return { mtimeMs: 0, isDirectory: true };
      return undefined;
    },
    async readdir(path) {
      const abs = resolve(path);
      if (!dirSet.has(abs)) throw new Error(`ENOENT: no such directory, scandir '${abs}'`);
      const children = (paths: Iterable<string>, isDirectory: boolean) =>
        [...paths].filter((p) => p !== abs && dirname(p) === abs).map((p) => ({ name: basename(p), isDirectory }));
      return [...children(dirSet, true), ...children(fileMap.keys(), false)];
    },
  };
}
