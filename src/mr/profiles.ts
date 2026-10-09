// MR profiles (mr-profiles: MR profile settings, Resolution order, Squash policy; design D-1, D-2): the built-in
// defaults, user and workspace scopes merged per profile and key, `extends` chains, and the order in which the values
// of one merge request are resolved. No vscode import.

export type OpenAfterCreate = 'notify' | 'browser' | 'none';

export interface ProfileValues {
  target: string;
  reviewers: string[];
  assignees: string[];
  labels: string[];
  squash: boolean;
  deleteSourceBranch: boolean;
  draft: boolean;
  title: string;
  description: string;
  pushIfNeeded: boolean;
  openAfterCreate: OpenAfterCreate;
}

export type ProfileKey = keyof ProfileValues;

export const BUILT_IN: Readonly<ProfileValues> = {
  target: '{defaultBranch}',
  reviewers: [],
  assignees: ['@me'],
  labels: [],
  squash: false,
  deleteSourceBranch: true,
  draft: false,
  title: '{type}: {ticket} {branchTitle}',
  description: 'template:default',
  pushIfNeeded: true,
  openAfterCreate: 'notify',
};

export const PROFILE_KEYS = Object.keys(BUILT_IN) as ProfileKey[];

export type RawProfiles = Record<string, unknown>;

/** The values a profile sets itself, plus its `extends`, keeping only known keys with the right type. */
export interface ExplicitProfile {
  values: Partial<ProfileValues>;
  extends?: string;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** The known keys of a raw profile object with a valid value; every other key is ignored. */
export function explicitValues(raw: unknown): ExplicitProfile {
  const values: Partial<ProfileValues> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { values };
  const record = raw as Record<string, unknown>;
  for (const key of PROFILE_KEYS) {
    const value = record[key];
    if (value === undefined) continue;
    const builtIn = BUILT_IN[key];
    if (Array.isArray(builtIn)) {
      if (isStringArray(value)) (values as Record<string, unknown>)[key] = value;
    } else if (typeof builtIn === typeof value) {
      if (key === 'openAfterCreate' && value !== 'notify' && value !== 'browser' && value !== 'none') continue;
      (values as Record<string, unknown>)[key] = value;
    }
  }
  return { values, ...(typeof record.extends === 'string' ? { extends: record.extends } : {}) };
}

/**
 * The profiles of both scopes, merged per profile and key: a key the workspace scope sets wins, the user scope gives the
 * others (design D-2; VS Code's own `get()` would drop the user's keys of a profile the workspace also defines).
 */
export function mergeScopes(user: RawProfiles | undefined, workspace: RawProfiles | undefined): Map<string, ExplicitProfile> {
  const names = new Set([...Object.keys(user ?? {}), ...Object.keys(workspace ?? {})]);
  const out = new Map<string, ExplicitProfile>();
  for (const name of names) {
    const u = explicitValues(user?.[name]);
    const w = explicitValues(workspace?.[name]);
    const ext = w.extends ?? u.extends;
    out.set(name, { values: { ...u.values, ...w.values }, ...(ext === undefined ? {} : { extends: ext }) });
  }
  return out;
}

export type ProfileResult = { ok: true; values: ProfileValues; explicit: Set<ProfileKey> } | { ok: false; error: string };

/**
 * The values of a profile: its own keys, then the profile it `extends` (to any depth), then `default`, then the
 * built-in defaults. `explicit` lists the keys some profile set (not the built-in defaults).
 */
export function resolveProfile(profiles: Map<string, ExplicitProfile>, name: string): ProfileResult {
  const chain: ExplicitProfile[] = [];
  const seen: string[] = [];
  let current: string | undefined = name;
  while (current !== undefined) {
    if (seen.includes(current)) {
      const through = seen[seen.indexOf(current) + 1] ?? current;
      return { ok: false, error: `MR profile "${current}" extends itself through "${through}".` };
    }
    seen.push(current);
    const profile = profiles.get(current);
    if (!profile) {
      if (current === name && name === 'default') break;
      const parent = seen[seen.length - 2] ?? name;
      if (current === name) return { ok: false, error: `MR profile "${name}" does not exist.` };
      return { ok: false, error: `MR profile "${parent}" extends "${current}", which does not exist.` };
    }
    chain.push(profile);
    current = profile.extends;
  }
  // A profile without `extends` (other than default) still takes the keys it leaves out from `default`.
  const fallback = name !== 'default' && !seen.includes('default') ? profiles.get('default') : undefined;
  const layers = [BUILT_IN, ...(fallback ? [fallback.values] : []), ...chain.reverse().map((p) => p.values)];
  const values = Object.assign({}, ...layers) as ProfileValues;
  const explicit = new Set<ProfileKey>();
  for (const layer of layers.slice(1)) for (const key of Object.keys(layer) as ProfileKey[]) explicit.add(key);
  return { ok: true, values: clone(values), explicit };
}

function clone(values: ProfileValues): ProfileValues {
  return { ...values, reviewers: [...values.reviewers], assignees: [...values.assignees], labels: [...values.labels] };
}

export interface ResolutionInput {
  profiles: Map<string, ExplicitProfile>;
  /** The profile the rules chose, `default` when none matched */
  profile: string;
  /** The rule's `set` */
  set?: Partial<ProfileValues>;
  /** Values edited in the drawer or the quick input, for this merge request only */
  edits?: Partial<ProfileValues>;
}

/**
 * The resolution order (mr-profiles: Resolution order): built-in, `default`, the chosen profile with its `extends`
 * chain, the rule's `set`, then the edits. The squash policy comes last, with `applySquashPolicy`.
 */
export function resolveValues(input: ResolutionInput): ProfileResult {
  const base = resolveProfile(input.profiles, input.profile);
  if (!base.ok) return base;
  const values = { ...base.values, ...(input.set ?? {}), ...(input.edits ?? {}) };
  const explicit = new Set(base.explicit);
  for (const key of Object.keys({ ...(input.set ?? {}), ...(input.edits ?? {}) }) as ProfileKey[]) explicit.add(key);
  return { ok: true, values: clone(values), explicit };
}

/** GitLab `squash_option`, or undefined for GitHub and when the project information cannot be read. */
export type SquashOption = 'never' | 'always' | 'default_on' | 'default_off';

/** mr-profiles: Squash policy — `never` forces false, `always` forces true, with the note shown in the drawer. */
export function applySquashPolicy(squash: boolean, option: SquashOption | undefined, projectPath: string): { squash: boolean; note?: string } {
  if (option === 'never') return { squash: false, note: `Squash is turned off for ${projectPath}.` };
  if (option === 'always') return { squash: true, note: `${projectPath} requires squash.` };
  return { squash };
}
