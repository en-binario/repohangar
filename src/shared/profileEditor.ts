// The MR profile editor's model and messages (mr-profiles: Profile editor content, Save profiles and rules;
// add-profile-editor design D-2). Shared by the extension host and the editor webview; no vscode import.

import type { MemoryLine } from '../mr/memory';
import { BUILT_IN, explicitValues, mergeScopes, PROFILE_KEYS, type ProfileKey, type ProfileValues } from '../mr/profiles';

export type EditorScope = 'user' | 'workspace';

/** The keys a profile sets itself, and its `extends`; never an inherited value. */
export type ExplicitKeys = Partial<ProfileValues> & { extends?: string };

export interface EditorRule {
  /** The rule's place in the setting as the editor received it; its `set` and other keys are kept from there */
  from?: number;
  repo?: string;
  branch?: string;
  profile: string;
  /** Shown as a summary; not edited */
  set?: Partial<ProfileValues>;
}

export interface ScopeData {
  profiles: Record<string, ExplicitKeys>;
  rules: EditorRule[];
}

export interface ProfilesState {
  /** The scope the switch starts on */
  scope: EditorScope;
  user: ScopeData;
  /** Null without an open folder or workspace */
  workspace: ScopeData | null;
  memory: MemoryLine[];
}

export const PROFILE_NAME_MESSAGE = 'Use letters, digits, ".", "_" or "-" (up to 40).';
const PROFILE_NAME = /^[A-Za-z0-9._-]{1,40}$/;

/** The input message for a new profile's name, or undefined when the name can be added. */
export function validateProfileName(name: string, existing: readonly string[]): string | undefined {
  if (!PROFILE_NAME.test(name)) return PROFILE_NAME_MESSAGE;
  if (existing.includes(name)) return `A profile named "${name}" already exists.`;
  return undefined;
}

/** `default` first, then by name. */
export function profileNames(profiles: Record<string, unknown>): string[] {
  return Object.keys(profiles).sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b, 'en')));
}

/** A new profile without keys, unsaved: it takes every value from `default` and the built-in defaults. */
export function addProfile(scope: ScopeData, name: string): ScopeData {
  return { ...scope, profiles: { ...scope.profiles, [name]: {} } };
}

/** A setting's profiles as the editor shows them: the known keys with a valid value, and `extends`. */
export function explicitKeysOf(raw: unknown): ExplicitKeys {
  const { values, extends: ext } = explicitValues(raw);
  return { ...values, ...(ext === undefined ? {} : { extends: ext }) };
}

/** `repohangar.mr.profiles` and `repohangar.mr.rules` of one scope, as `inspect()` returns them. */
export function scopeData(rawProfiles: unknown, rawRules: unknown): ScopeData {
  const profiles: Record<string, ExplicitKeys> = {};
  if (typeof rawProfiles === 'object' && rawProfiles !== null && !Array.isArray(rawProfiles)) {
    for (const [name, raw] of Object.entries(rawProfiles as Record<string, unknown>)) profiles[name] = explicitKeysOf(raw);
  }
  const rules = Array.isArray(rawRules)
    ? rawRules.map((entry, from): EditorRule => {
        const r = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
        const set = r.set === undefined ? undefined : explicitValues(r.set).values;
        return {
          from,
          profile: typeof r.profile === 'string' ? r.profile : '',
          ...(typeof r.repo === 'string' ? { repo: r.repo } : {}),
          ...(typeof r.branch === 'string' ? { branch: r.branch } : {}),
          ...(set === undefined ? {} : { set }),
        };
      })
    : [];
  return { profiles, rules };
}

export interface ProfileView {
  explicit: ExplicitKeys;
  effective: ProfileValues;
  /** For every key the profile does not set: the profile it comes from, or `built-in defaults` */
  inheritedFrom: Partial<Record<ProfileKey, string>>;
}

/**
 * One profile at a scope: its own keys, then (Workspace only) the user profile of the same name, its `extends` chain,
 * `default` and the built-in defaults — the order of `resolveProfile`. The User scope shows the user settings alone.
 */
export function profileView(data: Pick<ProfilesState, 'user' | 'workspace'>, scope: EditorScope, name: string): ProfileView {
  const user = data.user.profiles;
  const workspace = scope === 'workspace' ? (data.workspace?.profiles ?? {}) : {};
  const merged = mergeScopes(user, workspace);
  const explicit = (scope === 'workspace' ? workspace : user)[name] ?? {};
  const layers: { label: string; values: Partial<ProfileValues> }[] = [];
  if (scope === 'workspace' && user[name] !== undefined) layers.push({ label: `${name} (user settings)`, values: explicitValues(user[name]).values });
  const seen = new Set([name]);
  for (let next = merged.get(name)?.extends; next !== undefined && !seen.has(next); next = merged.get(next)?.extends) {
    seen.add(next);
    const profile = merged.get(next);
    if (!profile) break;
    layers.push({ label: next, values: profile.values });
  }
  const fallback = seen.has('default') ? undefined : merged.get('default');
  if (fallback) layers.push({ label: 'default', values: fallback.values });
  layers.push({ label: 'built-in defaults', values: BUILT_IN });
  const effective = {} as Record<ProfileKey, unknown>;
  const inheritedFrom: Partial<Record<ProfileKey, string>> = {};
  const own = explicitValues(explicit).values;
  for (const key of PROFILE_KEYS) {
    if (own[key] !== undefined) {
      effective[key] = own[key];
      continue;
    }
    const layer = layers.find((l) => l.values[key] !== undefined) as (typeof layers)[number];
    effective[key] = layer.values[key];
    inheritedFrom[key] = layer.label;
  }
  return { explicit, effective: effective as unknown as ProfileValues, inheritedFrom };
}

/** `2 git.acme.com/payments/** → default` */
export function ruleText(rule: EditorRule, index: number): string {
  const glob = [rule.repo, rule.branch].filter((g) => g !== undefined && g !== '').join(' ') || '**';
  return `${index + 1} ${glob} → ${rule.profile || '(no profile)'}`;
}

/** `set reviewers carla.ruiz · squash on`, or empty without a `set`. */
export function setSummary(set: Partial<ProfileValues> | undefined): string {
  const parts = PROFILE_KEYS.flatMap((key) => {
    const value = set?.[key];
    if (value === undefined) return [];
    if (typeof value === 'boolean') return [`${key} ${value ? 'on' : 'off'}`];
    if (Array.isArray(value)) return [`${key} ${value.join(', ') || 'none'}`];
    return [`${key} ${value}`];
  });
  return parts.length ? `set ${parts.join(' · ')}` : '';
}

export interface ScopeChanges {
  /** Profiles added or edited, with all their explicit keys */
  changed: Record<string, ExplicitKeys>;
  deleted: string[];
  /** The whole rule list when it changed, else null */
  rules: EditorRule[] | null;
}

/** What Save writes for one scope: nothing for a draft equal to what the editor received (Save is disabled then). */
export function scopeChanges(original: ScopeData, draft: ScopeData): ScopeChanges {
  const changed: Record<string, ExplicitKeys> = {};
  for (const [name, keys] of Object.entries(draft.profiles)) {
    if (!same(original.profiles[name], keys)) changed[name] = keys;
  }
  const deleted = Object.keys(original.profiles).filter((name) => !(name in draft.profiles));
  return { changed, deleted, rules: same(original.rules, draft.rules) ? null : draft.rules };
}

export function hasChanges(changes: ScopeChanges): boolean {
  return Object.keys(changes.changed).length > 0 || changes.deleted.length > 0 || changes.rules !== null;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
  );
}

/**
 * The new `repohangar.mr.profiles` of a scope (design D-2): the latest stored value, with the edited profiles' known
 * keys replaced (a key the editor does not know is kept) and the deleted ones removed.
 */
export function profilesValue(latest: unknown, changes: Pick<ScopeChanges, 'changed' | 'deleted'>): Record<string, unknown> {
  const out: Record<string, unknown> = typeof latest === 'object' && latest !== null && !Array.isArray(latest) ? { ...(latest as Record<string, unknown>) } : {};
  for (const name of changes.deleted) delete out[name];
  for (const [name, keys] of Object.entries(changes.changed)) out[name] = { ...unknownKeys(out[name]), ...keys };
  return out;
}

function unknownKeys(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([k]) => k !== 'extends' && !(PROFILE_KEYS as string[]).includes(k)));
}

/** The new `repohangar.mr.rules`: each rule from the one it was (its `set` and other keys kept), in the new order. */
export function rulesValue(source: unknown, rules: readonly EditorRule[]): Record<string, unknown>[] {
  const before = Array.isArray(source) ? source : [];
  return rules.map((rule) => {
    const raw = rule.from === undefined ? undefined : before[rule.from];
    const out: Record<string, unknown> = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
    delete out.repo;
    delete out.branch;
    if (rule.repo) out.repo = rule.repo;
    if (rule.branch) out.branch = rule.branch;
    out.profile = rule.profile;
    return out;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Messages

export type ProfilesHostMessage =
  /** Everything the editor shows; a new state discards unsaved edits */
  | { type: 'profilesState'; state: ProfilesState }
  /** The settings changed outside the editor while it has unsaved edits */
  | { type: 'profilesBanner' }
  | { type: 'profilesMemory'; memory: MemoryLine[] }
  /** The rendered title template (`→ feat: ABC-12 Add notes`) */
  | { type: 'profilesPreview'; template: string; text: string }
  /** Delete was confirmed; the view removes the profile from its draft */
  | { type: 'profilesDeleteConfirmed'; scope: EditorScope; name: string };

export type ProfilesViewMessage =
  | { type: 'ready' }
  | { type: 'profilesDirty'; dirty: boolean }
  | ({ type: 'profilesSave'; scope: EditorScope } & ScopeChanges)
  /** Reload in the banner */
  | { type: 'profilesReload' }
  | { type: 'profilesPreview'; template: string }
  | { type: 'profilesDelete'; scope: EditorScope; name: string }
  | { type: 'profilesForget'; key: string }
  | { type: 'profilesOpenSettings'; scope: EditorScope };

const MAX_STRING = 4096;
const MAX_ITEMS = 1000;

function isString(value: unknown, allowEmpty = false): value is string {
  return typeof value === 'string' && value.length <= MAX_STRING && (allowEmpty || value.length > 0);
}

function isScope(value: unknown): value is EditorScope {
  return value === 'user' || value === 'workspace';
}

/** True for an object of known profile keys with valid values and an optional string `extends`. */
function isExplicit(value: unknown): value is ExplicitKeys {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const parsed = explicitKeysOf(record);
  return Object.keys(record).length === Object.keys(parsed).length && same(parsed, record);
}

function isRule(value: unknown): value is EditorRule {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  const known = ['from', 'repo', 'branch', 'profile', 'set'];
  if (Object.keys(r).some((k) => !known.includes(k))) return false;
  if (r.from !== undefined && !(typeof r.from === 'number' && Number.isInteger(r.from) && r.from >= 0)) return false;
  if (r.repo !== undefined && !isString(r.repo, true)) return false;
  if (r.branch !== undefined && !isString(r.branch, true)) return false;
  if (r.set !== undefined && !isExplicit(r.set)) return false;
  // A rule the editor received without a profile keeps its place; a new one needs one.
  return isString(r.profile, r.from !== undefined);
}

const SHAPES: Record<ProfilesViewMessage['type'], Record<string, (value: unknown) => boolean>> = {
  ready: {},
  profilesDirty: { dirty: (v) => typeof v === 'boolean' },
  profilesSave: {
    scope: isScope,
    changed: (v) =>
      typeof v === 'object' &&
      v !== null &&
      !Array.isArray(v) &&
      Object.entries(v).length <= MAX_ITEMS &&
      Object.entries(v).every(([name, keys]) => PROFILE_NAME.test(name) && isExplicit(keys)),
    deleted: (v) => Array.isArray(v) && v.length <= MAX_ITEMS && v.every((n) => isString(n)),
    rules: (v) => v === null || (Array.isArray(v) && v.length <= MAX_ITEMS && v.every(isRule)),
  },
  profilesReload: {},
  profilesPreview: { template: (v) => isString(v, true) },
  profilesDelete: { scope: isScope, name: (v) => isString(v) },
  profilesForget: { key: (v) => isString(v) },
  profilesOpenSettings: { scope: isScope },
};

/** Returns the message when it matches the protocol exactly (no missing, extra or mistyped fields), else undefined. */
export function parseProfilesMessage(message: unknown): ProfilesViewMessage | undefined {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) return undefined;
  const record = message as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(SHAPES, type)) return undefined;
  const shape = SHAPES[type as ProfilesViewMessage['type']];
  const keys = Object.keys(record).filter((k) => k !== 'type');
  if (keys.length !== Object.keys(shape).length) return undefined;
  for (const key of keys) {
    const valid = shape[key];
    if (!valid || !valid(record[key])) return undefined;
  }
  return record as unknown as ProfilesViewMessage;
}
