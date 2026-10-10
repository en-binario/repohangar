// The per-repository memory (mr-profiles: Per-repository memory; add-profile-editor design D-3, D-4): the values saved
// with **For this repo only**, kept in `workspaceState` `repohangar.mr.repoMemory` keyed by `<host>/<project path>`,
// applied after the rule's `set`. No vscode import: the store takes the memento through a port.

import { BUILT_IN, explicitValues, type ProfileValues } from './profiles';

export const MEMORY_KEY = 'repohangar.mr.repoMemory';

/** The keys Save as defaults saves (mr-profiles: Save as defaults), in the order the notifications name them. */
export const SAVED_KEYS = ['reviewers', 'assignees', 'labels', 'squash', 'deleteSourceBranch', 'draft'] as const;
export type SavedKey = (typeof SAVED_KEYS)[number];
export type SavedValues = Pick<ProfileValues, SavedKey>;

/** `<host>/<project path>` → the saved values of that repository */
export type RepoMemory = Record<string, Partial<SavedValues>>;

/** The memory as stored, keeping only saved keys with a valid value and entries that keep one. */
export function readMemory(raw: unknown): RepoMemory {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: RepoMemory = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const values = savedOnly(explicitValues(value).values);
    if (Object.keys(values).length > 0) out[key] = values;
  }
  return out;
}

export function savedOnly(values: Partial<ProfileValues>): Partial<SavedValues> {
  const out: Partial<SavedValues> = {};
  for (const key of SAVED_KEYS) if (values[key] !== undefined) (out as Record<string, unknown>)[key] = values[key];
  return out;
}

export interface MemoryMemento {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

/** The memory of the open workspace, with a change event for the profile editor's list. */
export class RepoMemoryStore {
  private readonly listeners = new Set<() => void>();

  constructor(private readonly memento: MemoryMemento) {}

  all(): RepoMemory {
    return readMemory(this.memento.get(MEMORY_KEY));
  }

  get(key: string): Partial<SavedValues> | undefined {
    return this.all()[key];
  }

  async replace(memory: RepoMemory): Promise<void> {
    await this.memento.update(MEMORY_KEY, memory);
    for (const listener of this.listeners) listener();
  }

  /** Forget: removes the repository's entry. */
  async forget(key: string): Promise<void> {
    const memory = this.all();
    if (!(key in memory)) return;
    delete memory[key];
    await this.replace(memory);
  }

  onDidChange(listener: () => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }
}

export interface MemoryLine {
  /** `git.acme.com/payments/billing-api` */
  key: string;
  /** `billing-api → reviewers +carla.ruiz · squash on` */
  text: string;
}

/**
 * The profile editor's lines: the repository, then each saved key against `base` (the `default` profile's values):
 * a list as the values it adds (`+carla.ruiz`) and removes (`−ana.perez`), a box as `on` or `off`.
 */
export function memoryLines(memory: RepoMemory, base: ProfileValues = BUILT_IN): MemoryLine[] {
  return Object.keys(memory)
    .sort()
    .map((key) => {
      const values = memory[key] as Partial<SavedValues>;
      const parts = SAVED_KEYS.flatMap((k) => {
        const value = values[k];
        if (value === undefined) return [];
        if (typeof value === 'boolean') return [`${k} ${value ? 'on' : 'off'}`];
        const was = base[k] as string[];
        const changes = [...value.filter((v) => !was.includes(v)).map((v) => `+${v}`), ...was.filter((v) => !value.includes(v)).map((v) => `−${v}`)];
        return [`${k} ${changes.length ? changes.join(' ') : value.join(', ') || 'none'}`];
      });
      return { key, text: `${key.split('/').pop() ?? key} → ${parts.join(' · ')}` };
    });
}
