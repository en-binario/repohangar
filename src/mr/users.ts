// Reviewers and assignees before they are sent (mr-creation: Reviewers and assignees; design D-4): `@me`, the author
// removed from the reviewers, `team:<slug>` entries, and the notices about what was not applied. No vscode import.
// Also the user search's text, answer and list (mr-creation: Find users in the Reviewers and Assignees fields).

import type { UserMatch } from '../providers/provider';

export interface Notice {
  text: string;
  button?: 'Open Settings' | 'Sign In…';
}

export interface PreparedUsers {
  reviewers: string[];
  teams: string[];
  assignees: string[];
  notices: Notice[];
}

/** A username as the APIs expect it: `@jtapia` → `jtapia`; `@me` is kept. */
export function userName(entry: string): string {
  const name = entry.trim();
  return name !== '@me' && name.startsWith('@') ? name.slice(1) : name;
}

/**
 * The text a user search sends (mr-creation: Find users in the Reviewers and Assignees fields): trimmed, one leading
 * `@` dropped; `undefined` when nothing is left or the text names a GitHub team.
 */
export function searchText(text: string): string | undefined {
  const trimmed = text.trim();
  const name = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return name.length === 0 || name.startsWith('team:') ? undefined : name;
}

/** Replaces `@me`, removes the author from the reviewers and splits off `team:<slug>` (GitHub only). */
export function prepareUsers(
  provider: 'gitlab' | 'github',
  host: string,
  reviewers: readonly string[],
  assignees: readonly string[],
  me: string,
): PreparedUsers {
  const notices: Notice[] = [];
  const replace = (entry: string) => {
    const name = userName(entry);
    return name === '@me' ? me : name;
  };
  const unique = (names: string[]) => [...new Set(names.filter((n) => n.length > 0))];
  const people: string[] = [];
  const teams: string[] = [];
  for (const entry of reviewers.map(replace)) {
    if (entry.startsWith('team:')) {
      if (provider === 'github') teams.push(entry.slice('team:'.length));
      else notices.push({ text: `${entry} is a GitHub team and was not added on ${host}.` });
    } else if (entry !== me) {
      people.push(entry);
    }
  }
  return { reviewers: unique(people), teams: unique(teams), assignees: unique(assignees.map(replace)), notices };
}

/** `GitLab Free allows one reviewer: ana.perez added, luis.gomez not added.` */
export function limitNotice(kind: 'reviewer' | 'assignee', added: readonly string[], notAdded: readonly string[]): Notice {
  return { text: `GitLab Free allows one ${kind}: ${added.join(', ') || 'none'} added, ${notAdded.join(', ')} not added.` };
}

export function notFoundNotice(kind: 'Reviewer' | 'Assignee', name: string, host: string): Notice {
  return { text: `${kind} ${name} not found on ${host}.`, button: 'Open Settings' };
}

/** Whether a GitLab error is about the number of reviewers or assignees (design D-4). */
export function isLimitError(status: number | undefined, message: string): boolean {
  if (status !== 400 && status !== 422) return false;
  return /(reviewer|assignee)/i.test(message) && /(one|1|single|multiple|more than)/i.test(message);
}

/** The fields that search users; Labels never do. */
export const USER_FIELDS = ['reviewers', 'assignees'] as const;
export type UserField = (typeof USER_FIELDS)[number];

/** The host's answer to one search: `text` is the search text it was requested for (add-user-picker design D-2). */
export interface UserAnswer {
  field: UserField;
  text: string;
  state: 'users' | 'signedOut' | 'failed';
  users: UserMatch[];
  host: string;
  /** The provider's error message when `state` is `failed`, else empty */
  message: string;
}

export interface PickerEntry {
  username: string;
  name: string;
}

/** What the list under a user field shows: nothing, one status line, or the entries to pick from. */
export type PickerList = { kind: 'none' } | { kind: 'status'; text: string } | { kind: 'entries'; entries: PickerEntry[] };

/**
 * The list for the field text, the chips already in the field and the latest answer for that field. An answer for
 * other text is not shown: the view posted a search for the current text, so it is still running.
 */
export function pickerList(fieldText: string, chips: readonly string[], answer: UserAnswer | undefined): PickerList {
  const text = searchText(fieldText);
  if (text === undefined) return { kind: 'none' };
  if (!answer || answer.text !== text) return { kind: 'status', text: 'Searching…' };
  if (answer.state === 'signedOut') return { kind: 'status', text: `Sign in to ${answer.host} to search users.` };
  if (answer.state === 'failed') return { kind: 'status', text: `User search failed: ${answer.message.replace(/\.$/, '')}.` };
  const chosen = new Set(chips.map((c) => userName(c).toLowerCase()));
  const entries = answer.users.filter((u) => !chosen.has(u.username.toLowerCase())).slice(0, 10);
  if (entries.length === 0) return { kind: 'status', text: `No users on ${answer.host} match "${text}".` };
  return { kind: 'entries', entries };
}

/** `Jhon Tapia @jtapia`, or `@jruiz` without a name. */
export function entryText(entry: PickerEntry): string {
  return entry.name ? `${entry.name} @${entry.username}` : `@${entry.username}`;
}
