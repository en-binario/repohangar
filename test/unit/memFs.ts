import { dirname, resolve } from 'node:path';
import type { FileSystemPort } from '../../src/git/fsPort';

/** An in-memory file system: files map to contents (and an optional mtime); their parent folders exist. */
export function memFs(files: Record<string, string | { content: string; mtimeMs: number }>, dirs: string[] = []): FileSystemPort {
  const fileMap = new Map<string, { content: string; mtimeMs: number }>();
  const dirSet = new Set<string>(dirs.map((d) => resolve(d)));
  for (const [path, value] of Object.entries(files)) {
    const abs = resolve(path);
    fileMap.set(abs, typeof value === 'string' ? { content: value, mtimeMs: 0 } : value);
    for (let d = dirname(abs); d !== dirname(d); d = dirname(d)) dirSet.add(d);
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
  };
}
