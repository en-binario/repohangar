// The file system operations the pure Git modules need, so unit tests can use an in-memory map. No vscode import.

import { readdir, readFile, stat } from 'node:fs/promises';

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

export interface DirectoryEntry {
  name: string;
  isDirectory: boolean;
}

/** A file system that can also list a folder, for the repository root scan. */
export interface DirectoryPort extends FileSystemPort {
  /** The entries of a folder; throws when the folder does not exist or cannot be read */
  readdir(path: string): Promise<DirectoryEntry[]>;
}

export const nodeFileSystem: DirectoryPort = {
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
  async readdir(path) {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
  },
};
