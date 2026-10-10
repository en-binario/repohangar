// Save as defaults (mr-profiles: Save as defaults; add-profile-editor design D-3): the drawer's values of the six saved
// keys that differ from the profile's effective values, merged into the profile at user or workspace scope, or into
// the per-repository memory. No vscode import.

import { SAVED_KEYS, type RepoMemory, type SavedKey, type SavedValues } from './memory';
import type { ProfileValues } from './profiles';

export type SaveTarget = 'user' | 'workspace' | 'repo';

export const SAVE_TARGETS: readonly SaveTarget[] = ['user', 'workspace', 'repo'];

export interface SaveDefaultsInput {
  target: SaveTarget;
  profile: string;
  /** The repository's name, for the notification (`billing-api`) */
  repo: string;
  /** `<host>/<project path>`, the memory's key */
  repoKey: string;
  /** The drawer's values */
  values: SavedValues;
  /** The profile's effective values (its `extends` chain, `default` and the built-in defaults; no rule, memory or edit) */
  effective: ProfileValues;
  /** The squash policy forced the drawer's squash; it is not saved */
  squashForced: boolean;
  /** `repohangar.mr.profiles` at the target scope as stored, for user and workspace */
  scopeProfiles?: Record<string, unknown>;
  /** The memory of the workspace, for the repository target */
  memory?: RepoMemory;
}

export type SaveDefaultsPlan =
  | { kind: 'nothing'; text: string }
  | { kind: 'settings'; scope: 'user' | 'workspace'; value: Record<string, unknown>; keys: SavedKey[]; text: string }
  | { kind: 'memory'; value: RepoMemory; keys: SavedKey[]; text: string };

/** The drawer's values that differ from the profile, in `SAVED_KEYS` order, without a squash the policy forced. */
export function defaultsDiff(values: SavedValues, effective: ProfileValues, squashForced: boolean): Partial<SavedValues> {
  const diff: Partial<SavedValues> = {};
  for (const key of SAVED_KEYS) {
    if (key === 'squash' && squashForced) continue;
    if (JSON.stringify(values[key]) !== JSON.stringify(effective[key])) (diff as Record<string, unknown>)[key] = values[key];
  }
  return diff;
}

/** What one Save as defaults item writes, and its notification. */
export function planSaveDefaults(input: SaveDefaultsInput): SaveDefaultsPlan {
  const diff = defaultsDiff(input.values, input.effective, input.squashForced);
  const keys = SAVED_KEYS.filter((k) => diff[k] !== undefined);
  if (keys.length === 0) return { kind: 'nothing', text: `Nothing to save: the values match the MR profile "${input.profile}".` };
  const names = keys.join(', ');
  if (input.target === 'repo') {
    const memory = { ...(input.memory ?? {}) };
    memory[input.repoKey] = { ...(memory[input.repoKey] ?? {}), ...diff };
    return { kind: 'memory', value: memory, keys, text: `Saved ${names} for ${input.repo} in this workspace.` };
  }
  const profiles = { ...(input.scopeProfiles ?? {}) };
  const current = profiles[input.profile];
  const own = typeof current === 'object' && current !== null && !Array.isArray(current) ? (current as Record<string, unknown>) : {};
  profiles[input.profile] = { ...own, ...diff };
  return {
    kind: 'settings',
    scope: input.target,
    value: profiles,
    keys,
    text: `Saved ${names} to the MR profile "${input.profile}" (${input.target} settings).`,
  };
}
