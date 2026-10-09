// The file system operations the pure Git modules need, so unit tests can use an in-memory map. No vscode import.

import { readFile, stat } from 'node:fs/promises';

export interface FileStat {
  mtimeMs: number;
  isDirectory: boolean;
}

export interface FileSystemPort {
  /** File contents as UTF-8, or undefined when the file does not exist or cannot be read */
  readFile(path: string): Promise<string | undefined>;
  /** undefined when the path does not exist */
  stat(path: string): Promise<FileStat | undefined>;
}

export const nodeFileSystem: FileSystemPort = {
  async readFile(path) {
    try {
      return await readFile(path, 'utf8');
    } catch {
      return undefined;
    }
  },
  async stat(path) {
    try {
      const s = await stat(path);
      return { mtimeMs: s.mtimeMs, isDirectory: s.isDirectory() };
    } catch {
      return undefined;
    }
  },
};
