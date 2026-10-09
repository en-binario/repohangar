// The Create MR drawer (mr-creation: Create MR drawer, W4; design D-7): every field pre-filled from the resolved
// profile, the grid still usable on the left. The host resolves again when the profile or target changes.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { DrawerData, DrawerEdits } from '../src/shared/drawer';
import type { ViewMessage } from '../src/shared/protocol';

interface Props {
  data: DrawerData;
  users: string[];
  post(message: ViewMessage): void;
  onClose(): void;
}

type ListKey = 'reviewers' | 'assignees' | 'labels';

export function Drawer({ data, users, post, onClose }: Props) {
  const [edits, setEdits] = useState<DrawerEdits>({});
  const [profile, setProfile] = useState(data.profile);
  const titleRef = useRef<HTMLInputElement>(null);

  // A new drawer (another repository) starts without edits; a re-resolved one keeps them (the host sends them back).
  useEffect(() => {
    setProfile(data.profile);
  }, [data.profile]);
  useEffect(() => {
    setEdits({});
    titleRef.current?.focus();
  }, [data.id]);

  const value = <K extends keyof DrawerEdits>(key: K): NonNullable<DrawerEdits[K]> =>
    (edits[key] ?? (data as unknown as Record<string, unknown>)[key]) as NonNullable<DrawerEdits[K]>;
  const edit = (patch: DrawerEdits) => setEdits((e) => ({ ...e, ...patch }));

  const create = () => post({ type: 'drawerCreate', id: data.id, profile, edits });
  const close = () => {
    post({ type: 'drawerClose' });
    onClose();
  };
  const changeProfile = (next: string) => {
    setProfile(next);
    post({ type: 'drawerChange', id: data.id, profile: next, edits });
  };
  const changeTarget = (target: string) => {
    const next = { ...edits, target };
    setEdits(next);
    post({ type: 'drawerChange', id: data.id, profile, edits: next });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      create();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  const noun = data.provider === 'gitlab' ? 'merge request' : 'pull request';
  return (
    <aside class="drawer" role="dialog" aria-label={data.heading} onKeyDown={onKeyDown} data-drawer={data.id}>
      <header class="drawer-header">
        <h2>{data.heading}</h2>
        <button type="button" class="drawer-close" aria-label="Close" title="Close" onClick={close}>
          ✕
        </button>
      </header>
      {data.error && (
        <p class="drawer-error" role="alert">
          {data.error}
        </p>
      )}
      <label class="field">
        <span>Profile</span>
        <select value={profile} onChange={(e) => changeProfile((e.currentTarget as HTMLSelectElement).value)} data-field="profile">
          {data.profiles.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {data.ruleNote && <span class="note">{data.ruleNote}</span>}
      </label>
      <div class="field">
        <span>Source</span>
        <span data-field="source">{data.source}</span>
      </div>
      <label class="field">
        <span>Target</span>
        <select value={value('target')} onChange={(e) => changeTarget((e.currentTarget as HTMLSelectElement).value)} data-field="target">
          {data.targets.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span class="note">{data.aheadNote}</span>
      </label>
      <label class="field">
        <span>Title</span>
        <input ref={titleRef} type="text" value={value('title')} data-field="title" onInput={(e) => edit({ title: (e.currentTarget as HTMLInputElement).value })} />
      </label>
      <label class="field stacked">
        <span>Description</span>
        <textarea
          rows={8}
          value={value('description')}
          data-field="description"
          onInput={(e) => edit({ description: (e.currentTarget as HTMLTextAreaElement).value })}
        />
      </label>
      {(['reviewers', 'assignees', 'labels'] as ListKey[]).map((key) => (
        <Chips
          key={key}
          name={key}
          values={value(key)}
          suggestions={key === 'labels' ? [] : users}
          onChange={(values) => edit({ [key]: values })}
          onSearch={(text) => key !== 'labels' && post({ type: 'drawerSearchUsers', id: data.id, text })}
        />
      ))}
      <div class="checks">
        <label>
          <input type="checkbox" checked={value('squash')} data-field="squash" onChange={(e) => edit({ squash: (e.currentTarget as HTMLInputElement).checked })} /> Squash commits
        </label>
        <label>
          <input
            type="checkbox"
            checked={value('deleteSourceBranch')}
            data-field="deleteSourceBranch"
            onChange={(e) => edit({ deleteSourceBranch: (e.currentTarget as HTMLInputElement).checked })}
          />{' '}
          Delete source branch
        </label>
        <label>
          <input type="checkbox" checked={value('draft')} data-field="draft" onChange={(e) => edit({ draft: (e.currentTarget as HTMLInputElement).checked })} /> Draft
        </label>
      </div>
      {data.notes.map((note) => (
        <p class="note" key={note} data-note>
          {note}
        </p>
      ))}
      {data.warnings.map((warning) => (
        <p class="warning" key={warning}>
          ⚠ {warning}
        </p>
      ))}
      <footer class="drawer-footer">
        <button type="button" onClick={close} data-button="cancel">
          Cancel
        </button>
        <button type="button" class="primary" onClick={create} data-button="create" title={`Create the ${noun} (Ctrl+Enter)`}>
          Create ⌃⏎
        </button>
      </footer>
    </aside>
  );
}

function Chips(props: { name: ListKey; values: string[]; suggestions: string[]; onChange(values: string[]): void; onSearch(text: string): void }) {
  const [text, setText] = useState('');
  const label = props.name.charAt(0).toUpperCase() + props.name.slice(1);
  const add = (value: string) => {
    const v = value.trim();
    if (v && !props.values.includes(v)) props.onChange([...props.values, v]);
    setText('');
  };
  const listId = `suggest-${props.name}`;
  return (
    <div class="field chips-field" data-chips={props.name}>
      <span>{label}</span>
      <span class="chip-list">
        {props.values.map((v) => (
          <span class="chip-value" key={v}>
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => props.onChange(props.values.filter((x) => x !== v))}>
              ✕
            </button>
          </span>
        ))}
        <input
          type="text"
          value={text}
          placeholder="+ add…"
          aria-label={`Add to ${props.name}`}
          list={props.suggestions.length ? listId : undefined}
          onInput={(e) => {
            const next = (e.currentTarget as HTMLInputElement).value;
            setText(next);
            props.onSearch(next);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              e.stopPropagation();
              add(text);
            }
          }}
        />
        {props.suggestions.length > 0 && (
          <datalist id={listId}>
            {props.suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </span>
    </div>
  );
}
