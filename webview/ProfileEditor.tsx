// The MR profile editor (mr-profiles: Profile editor content, Save profiles and rules, Settings changed outside the
// editor, Per-repository memory; W9; add-profile-editor design D-2): the view edits only the keys each profile sets and
// the rule list; the host writes them on Save.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { MemoryLine } from '../src/mr/memory';
import type { OpenAfterCreate, ProfileKey, ProfileValues } from '../src/mr/profiles';
import {
  addProfile,
  hasChanges,
  profileNames,
  profileView,
  ruleText,
  scopeChanges,
  setSummary,
  validateProfileName,
  type EditorRule,
  type EditorScope,
  type ExplicitKeys,
  type ProfilesHostMessage,
  type ProfilesState,
  type ProfilesViewMessage,
  type ScopeData,
} from '../src/shared/profileEditor';
import { Chips, type ListKey } from './Drawer';

export interface ProfilesApi {
  postMessage(message: ProfilesViewMessage): void;
}

type Scopes = Pick<ProfilesState, 'user' | 'workspace'>;

interface Doc {
  /** What the host sent */
  original: Scopes;
  /** With the unsaved edits */
  draft: Scopes;
}

const SCOPES: readonly EditorScope[] = ['user', 'workspace'];

const AFTER_CREATE: readonly [OpenAfterCreate, string][] = [
  ['notify', 'Notify'],
  ['browser', 'Open in browser'],
  ['none', 'Nothing'],
];

const BOXES: readonly [ProfileKey, string][] = [
  ['squash', 'Squash'],
  ['deleteSourceBranch', 'Delete source branch'],
  ['draft', 'Draft'],
  ['pushIfNeeded', 'Push branch if needed'],
];

function changed(doc: Doc, scope: EditorScope): boolean {
  const original = doc.original[scope];
  const draft = doc.draft[scope];
  return !!original && !!draft && hasChanges(scopeChanges(original, draft));
}

export function ProfilesApp({ api }: { api: ProfilesApi }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [memory, setMemory] = useState<MemoryLine[]>([]);
  const [scope, setScope] = useState<EditorScope>('user');
  const [selected, setSelected] = useState<Record<EditorScope, string | null>>({ user: 'default', workspace: 'default' });
  const [banner, setBanner] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState<string | undefined>(undefined);
  const [ruleOpen, setRuleOpen] = useState<number | null>(null);
  /** The scope of the Save whose new state the host sends next; the other scope keeps its edits */
  const savingScope = useRef<EditorScope | null>(null);
  const lastDirty = useRef(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent<ProfilesHostMessage>) => {
      const message = event.data;
      if (message.type === 'profilesState') {
        const next: Scopes = { user: message.state.user, workspace: message.state.workspace };
        const saved = savingScope.current;
        savingScope.current = null;
        setDoc((prev) => {
          if (!prev || !saved) return { original: next, draft: next };
          const other: EditorScope = saved === 'user' ? 'workspace' : 'user';
          if (!changed(prev, other)) return { original: next, draft: next };
          return { original: { ...next, [other]: prev.original[other] }, draft: { ...next, [other]: prev.draft[other] } };
        });
        setMemory(message.state.memory);
        setBanner(false);
        if (!message.state.workspace) setScope('user');
      } else if (message.type === 'profilesBanner') {
        setBanner(true);
      } else if (message.type === 'profilesMemory') {
        setMemory(message.memory);
      } else if (message.type === 'profilesPreview') {
        setPreviews((p) => ({ ...p, [message.template]: message.text }));
      } else if (message.type === 'profilesDeleteConfirmed') {
        setDoc((prev) => {
          const data = prev?.draft[message.scope];
          if (!prev || !data) return prev;
          const { [message.name]: _deleted, ...profiles } = data.profiles;
          return { ...prev, draft: { ...prev.draft, [message.scope]: { ...data, profiles } } };
        });
      }
    };
    window.addEventListener('message', onMessage);
    api.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, [api]);

  const dirty = !!doc && SCOPES.some((s) => changed(doc, s));
  useEffect(() => {
    if (dirty === lastDirty.current) return;
    lastDirty.current = dirty;
    api.postMessage({ type: 'profilesDirty', dirty });
  }, [api, dirty]);

  const current = doc?.draft[scope] ?? null;
  const names = current ? profileNames(current.profiles) : [];
  const chosen = selected[scope];
  const name = chosen !== null && names.includes(chosen) ? chosen : (names[0] ?? null);
  const view = doc && name !== null ? profileView(doc.draft, scope, name) : null;
  const title = view?.effective.title;

  useEffect(() => {
    if (title !== undefined && previews[title] === undefined) api.postMessage({ type: 'profilesPreview', template: title });
  }, [api, title, previews]);

  if (!doc || !current) return <div class="empty">Loading MR profiles…</div>;

  const updateScope = (patch: Partial<ScopeData>) =>
    setDoc((prev) => (prev && prev.draft[scope] ? { ...prev, draft: { ...prev.draft, [scope]: { ...(prev.draft[scope] as ScopeData), ...patch } } } : prev));
  const setKeys = (profile: string, keys: ExplicitKeys) => updateScope({ profiles: { ...current.profiles, [profile]: keys } });
  const setKey = <K extends ProfileKey>(key: K, value: ProfileValues[K]) => {
    if (name !== null && view) setKeys(name, { ...view.explicit, [key]: value });
  };
  const resetKey = (key: ProfileKey) => {
    if (name === null || !view) return;
    const { [key]: _reset, ...rest } = view.explicit;
    setKeys(name, rest);
  };
  const setRules = (rules: EditorRule[]) => updateScope({ rules });

  const addNew = () => {
    const typed = newName ?? '';
    const message = validateProfileName(typed, names);
    setNewMessage(message);
    if (message) return;
    updateScope(addProfile(current, typed));
    setSelected((s) => ({ ...s, [scope]: typed }));
    setNewName(null);
  };

  const save = () => {
    const original = doc.original[scope];
    if (!original) return;
    const changes = scopeChanges(original, current);
    if (!hasChanges(changes)) return;
    savingScope.current = scope;
    api.postMessage({ type: 'profilesSave', scope, ...changes });
  };

  const allNames = profileNames({ default: {}, ...doc.draft.user.profiles, ...(doc.draft.workspace?.profiles ?? {}) });
  const moveRule = (i: number, by: number) => {
    const rules = [...current.rules];
    const [rule] = rules.splice(i, 1);
    if (!rule) return;
    rules.splice(i + by, 0, rule);
    setRules(rules);
    setRuleOpen(null);
  };
  const editRule = (i: number, patch: Partial<EditorRule>) => setRules(current.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  /** A field the profile does not set shows the inherited value, dimmed, with where it comes from. */
  const fieldProps = (key: ProfileKey) => {
    const from = view?.inheritedFrom[key];
    return { class: from ? 'pfield inherited' : 'pfield', 'data-pfield': key, ...(from ? { title: `Inherited from ${from}` } : {}) };
  };
  const reset = (key: ProfileKey) =>
    view?.explicit[key] !== undefined && (
      <button type="button" class="reset" aria-label={`Use the inherited ${key}`} title="Use the inherited value" onClick={() => resetKey(key)}>
        ↺
      </button>
    );

  return (
    <div class="profiles-editor" data-scope={scope}>
      {banner && (
        <div class="banner" role="alert">
          <span>MR profiles changed in settings.json.</span>
          <button type="button" data-button="reload" onClick={() => api.postMessage({ type: 'profilesReload' })}>
            Reload
          </button>
          <button type="button" data-button="keepEditing" onClick={() => setBanner(false)}>
            Keep editing
          </button>
        </div>
      )}
      <header class="profiles-header">
        <h1>MR Profiles</h1>
        <div class="scope-switch" role="group" aria-label="Scope">
          {SCOPES.map((s) => (
            <button
              type="button"
              key={s}
              data-scope={s}
              class={s === scope ? 'scope active' : 'scope'}
              aria-pressed={s === scope}
              disabled={s === 'workspace' && !doc.draft.workspace}
              onClick={() => {
                setScope(s);
                setMenuFor(null);
                setRuleOpen(null);
                setNewName(null);
              }}
            >
              {s === 'user' ? 'User' : 'Workspace'}
            </button>
          ))}
        </div>
      </header>

      <div class="profiles-columns">
        <div class="profiles-side">
          <section aria-label="Profiles">
            <h2>Profiles</h2>
            <ul class="profile-list">
              {names.map((n) => (
                <li key={n} data-profile={n} class={n === name ? 'selected' : undefined}>
                  <button type="button" class="profile-name" aria-current={n === name} onClick={() => setSelected((s) => ({ ...s, [scope]: n }))}>
                    {n === 'default' ? `★ ${n}` : n}
                  </button>
                  <button type="button" class="profile-actions" aria-label={`Actions for ${n}`} aria-haspopup="menu" onClick={() => setMenuFor(menuFor === n ? null : n)}>
                    ⋯
                  </button>
                  {menuFor === n && (
                    <div class="profile-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        data-action="delete"
                        disabled={n === 'default'}
                        title={n === 'default' ? 'The default profile cannot be deleted.' : undefined}
                        onClick={() => {
                          setMenuFor(null);
                          api.postMessage({ type: 'profilesDelete', scope, name: n });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {newName === null ? (
              <button
                type="button"
                data-button="newProfile"
                onClick={() => {
                  setNewName('');
                  setNewMessage(undefined);
                }}
              >
                New profile
              </button>
            ) : (
              <div class="new-profile">
                <input
                  type="text"
                  aria-label="New profile name"
                  value={newName}
                  ref={(e) => e?.focus()}
                  onInput={(e) => setNewName((e.currentTarget as HTMLInputElement).value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addNew();
                    else if (e.key === 'Escape') setNewName(null);
                  }}
                />
                <button type="button" data-button="addProfile" onClick={addNew}>
                  Add
                </button>
                {newMessage && (
                  <p class="input-message" role="alert">
                    {newMessage}
                  </p>
                )}
              </div>
            )}
          </section>

          <section aria-label="Rules">
            <h2>Rules</h2>
            <ol class="rule-list">
              {current.rules.map((rule, i) => (
                <li key={`${rule.from ?? 'new'}-${i}`} data-rule={i}>
                  <button type="button" class="rule-line" aria-expanded={ruleOpen === i} onClick={() => setRuleOpen(ruleOpen === i ? null : i)}>
                    {ruleText(rule, i)}
                  </button>
                  {rule.set && <span class="note">{setSummary(rule.set)}</span>}
                  <span class="rule-buttons">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveRule(i, -1)}>
                      ↑
                    </button>
                    <button type="button" aria-label="Move down" disabled={i === current.rules.length - 1} onClick={() => moveRule(i, 1)}>
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label="Delete rule"
                      onClick={() => {
                        setRules(current.rules.filter((_, j) => j !== i));
                        setRuleOpen(null);
                      }}
                    >
                      ✕
                    </button>
                  </span>
                  {ruleOpen === i && (
                    <div class="rule-edit">
                      <label>
                        <span>Repository</span>
                        <input
                          type="text"
                          value={rule.repo ?? ''}
                          placeholder="git.acme.com/payments/**"
                          onInput={(e) => editRule(i, { repo: (e.currentTarget as HTMLInputElement).value })}
                        />
                      </label>
                      <label>
                        <span>Branch</span>
                        <input type="text" value={rule.branch ?? ''} placeholder="hotfix/**" onInput={(e) => editRule(i, { branch: (e.currentTarget as HTMLInputElement).value })} />
                      </label>
                      <label>
                        <span>Profile</span>
                        <select value={rule.profile} onChange={(e) => editRule(i, { profile: (e.currentTarget as HTMLSelectElement).value })}>
                          {[...new Set([...allNames, ...(rule.profile ? [rule.profile] : [])])].map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <button
              type="button"
              data-button="newRule"
              onClick={() => {
                setRules([...current.rules, { profile: 'default' }]);
                setRuleOpen(current.rules.length);
              }}
            >
              New rule
            </button>
          </section>

          <section aria-label="Repository memory">
            <h2>Saved for one repository</h2>
            {memory.length === 0 ? (
              <p class="note">Nothing saved with “For this repo only” in this workspace.</p>
            ) : (
              <ul class="memory-list">
                {memory.map((line) => (
                  <li key={line.key} data-memory={line.key}>
                    <span class="memory-line" title={line.key}>
                      {line.text}
                    </span>
                    <button type="button" data-button="forget" onClick={() => api.postMessage({ type: 'profilesForget', key: line.key })}>
                      Forget
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section class="profile-fields" aria-label={name === null ? 'No profile' : `Profile ${name}`}>
          {view === null || name === null ? (
            <p class="note">No profile is defined at this scope.</p>
          ) : (
            <>
              <h2>{name === 'default' ? `★ ${name}` : name}</h2>
              <label {...fieldProps('target')}>
                <span>Target branch</span>
                <input type="text" value={view.effective.target} data-field="target" onInput={(e) => setKey('target', (e.currentTarget as HTMLInputElement).value)} />
                {reset('target')}
              </label>
              <label {...fieldProps('title')}>
                <span>Title template</span>
                <input type="text" value={view.effective.title} data-field="title" onInput={(e) => setKey('title', (e.currentTarget as HTMLInputElement).value)} />
                {reset('title')}
                <span class="preview" data-preview>
                  {previews[view.effective.title] === undefined ? '' : `→ ${previews[view.effective.title]}`}
                </span>
              </label>
              <div {...fieldProps('description')}>
                <span>Description</span>
                <select
                  value={view.effective.description === 'template:default' ? 'template' : 'custom'}
                  data-field="description"
                  aria-label="Description"
                  onChange={(e) => setKey('description', (e.currentTarget as HTMLSelectElement).value === 'template' ? 'template:default' : '')}
                >
                  <option value="template">Repo template, else built-in</option>
                  <option value="custom">Custom…</option>
                </select>
                {reset('description')}
                {view.effective.description !== 'template:default' && (
                  <textarea
                    rows={6}
                    value={view.effective.description}
                    aria-label="Custom description"
                    onInput={(e) => setKey('description', (e.currentTarget as HTMLTextAreaElement).value)}
                  />
                )}
              </div>
              {(['reviewers', 'assignees', 'labels'] as ListKey[]).map((key) => (
                <div key={key} {...fieldProps(key)}>
                  <Chips name={key} values={view.effective[key]} suggestions={[]} onChange={(values) => setKey(key, values)} onSearch={() => undefined} />
                  {reset(key)}
                </div>
              ))}
              <div class="checks">
                {BOXES.map(([key, label]) => (
                  <label key={key} {...fieldProps(key)}>
                    <input
                      type="checkbox"
                      checked={view.effective[key] as boolean}
                      data-field={key}
                      onChange={(e) => setKey(key, (e.currentTarget as HTMLInputElement).checked)}
                    />{' '}
                    {label}
                    {reset(key)}
                  </label>
                ))}
              </div>
              <label {...fieldProps('openAfterCreate')}>
                <span>After create</span>
                <select
                  value={view.effective.openAfterCreate}
                  data-field="openAfterCreate"
                  onChange={(e) => setKey('openAfterCreate', (e.currentTarget as HTMLSelectElement).value as OpenAfterCreate)}
                >
                  {AFTER_CREATE.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {reset('openAfterCreate')}
              </label>
            </>
          )}
        </section>
      </div>

      <footer class="profiles-footer">
        <button type="button" data-button="openSettings" onClick={() => api.postMessage({ type: 'profilesOpenSettings', scope })}>
          Open settings.json
        </button>
        <button type="button" class="primary" data-button="save" disabled={!changed(doc, scope)} onClick={save}>
          Save
        </button>
      </footer>
    </div>
  );
}
