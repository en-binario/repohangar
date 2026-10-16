// The add field of Reviewers and Assignees with its user list (mr-creation: Find users in the Reviewers and Assignees
// fields; add-user-picker design D-4): an ARIA combobox whose list shows the host's answer for the current text.

import { useEffect, useState } from 'preact/hooks';
import { entryText, pickerList, searchText, userName, type UserAnswer, type UserField } from '../src/mr/users';

export interface UserSearchProps {
  /** The latest answer for this field */
  answer: UserAnswer | undefined;
  /** Posts a search; called only for text that searches */
  onSearch(text: string): void;
}

export function UserPicker(props: { name: UserField; values: string[]; onAdd(value: string): void } & UserSearchProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const list = pickerList(text, props.values, props.answer);
  const entries = list.kind === 'entries' ? list.entries : [];
  const shown = open && list.kind !== 'none';
  const listId = `users-${props.name}`;
  // A new answer starts on its first entry.
  const entryKey = entries.map((e) => e.username).join(' ');
  useEffect(() => setActive(0), [entryKey]);

  const add = (value: string) => {
    const v = userName(value);
    if (v) props.onAdd(v);
    setText('');
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && shown && entries.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + entries.length) % entries.length);
    } else if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      const highlighted = shown ? entries[active] : undefined;
      add(highlighted ? highlighted.username : text);
    } else if (e.key === 'Escape' && shown) {
      // Esc closes the list only; with the list closed it reaches the drawer, which closes.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <span class="user-picker">
      <input
        type="text"
        value={text}
        placeholder="+ add…"
        role="combobox"
        aria-label={`Add to ${props.name}`}
        aria-autocomplete="list"
        aria-expanded={shown && entries.length > 0}
        aria-controls={listId}
        aria-activedescendant={shown && entries.length > 0 ? `${listId}-${active}` : undefined}
        onInput={(e) => {
          const next = (e.currentTarget as HTMLInputElement).value;
          setText(next);
          setOpen(true);
          if (searchText(next) !== undefined) props.onSearch(next);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {shown && (
        <div class="user-list" data-users={props.name}>
          {list.kind === 'status' && (
            <div class="user-status" role="status">
              {list.text}
            </div>
          )}
          <ul id={listId} role="listbox" aria-label={`Users for ${props.name}`} hidden={entries.length === 0}>
            {entries.map((entry, i) => (
              <li
                key={entry.username}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                class={i === active ? 'active' : undefined}
                title={entryText(entry)}
                // Before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(entry.username);
                }}
              >
                {entry.name && <span class="user-name">{entry.name} </span>}
                <span class="user-login">@{entry.username}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
