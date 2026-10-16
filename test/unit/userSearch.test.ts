// mr-creation :: User search list matrix (R1–R10) and Answer for older text: the host's search (UserSearch, with fake
// timers and a fake provider) feeding the list the view shows (pickerList).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../src/providers/http';
import type { UserMatch } from '../../src/providers/provider';
import { UserSearch } from '../../src/mr/userSearch';
import { entryText, pickerList, searchText, type UserAnswer, type UserField } from '../../src/mr/users';

const JHON: UserMatch[] = [
  { username: 'jtapiap', name: 'Jhon Wilber Tapia Pinto' },
  { username: 'jruiz', name: 'Jhon Ruiz' },
];

type Answer = UserMatch[] | Error | 'pending';

/** The drawer for `billing-api` on git.acme.com: what the provider answers per search text, and what reaches the view. */
function drawer(options: { credential?: boolean; answers?: Record<string, Answer> } = {}) {
  const requests: string[] = [];
  const pending = new Map<string, (users: UserMatch[]) => void>();
  const search = new UserSearch({
    repo: (id) =>
      id === 'billing'
        ? {
            host: 'git.acme.com',
            projectPath: 'payments/billing-api',
            search: (_path, text) => {
              requests.push(text);
              const answer = options.answers?.[text] ?? [];
              if (answer === 'pending') return new Promise<UserMatch[]>((resolve) => pending.set(text, resolve));
              return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
            },
          }
        : undefined,
    credential: async () => (options.credential === false ? undefined : { token: 'glpat-x1y2', apiHost: 'git.acme.com' }),
    log: () => undefined,
  });
  const answers: Partial<Record<UserField, UserAnswer>> = {};
  const text: Record<string, string> = { reviewers: '', assignees: '', labels: '' };
  return {
    requests,
    /** Types in a field as the view does: Labels and text that does not search post nothing. */
    type(field: UserField | 'labels', value: string) {
      text[field] = value;
      if (field !== 'labels' && searchText(value) !== undefined) {
        search.search(`drawer:${field}`, 'billing', field, value, (answer) => (answers[answer.field] = answer));
      }
    },
    resolve(searched: string, users: UserMatch[]) {
      pending.get(searched)?.(users);
    },
    /** The lines of the list under a field */
    list(field: UserField | 'labels', chips: string[] = []): string[] {
      if (field === 'labels') return [];
      const list = pickerList(text[field] ?? '', chips, answers[field]);
      return list.kind === 'none' ? [] : list.kind === 'status' ? [list.text] : list.entries.map(entryText);
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function wait(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('User search list matrix', () => {
  it('R1 sends no request and shows no list in Labels', async () => {
    const d = drawer({ answers: { jhon: JHON } });
    d.type('labels', 'jhon');
    await wait(300);
    expect(d.requests).toEqual([]);
    expect(d.list('labels')).toEqual([]);
  });

  it('R2 sends no request for a lone @', async () => {
    const d = drawer({ answers: { jhon: JHON } });
    d.type('reviewers', '@');
    await wait(300);
    expect(d.requests).toEqual([]);
    expect(d.list('reviewers')).toEqual([]);
  });

  it('R3 sends no request for a GitHub team', async () => {
    const d = drawer();
    d.type('reviewers', 'team:sre');
    await wait(300);
    expect(d.requests).toEqual([]);
    expect(d.list('reviewers')).toEqual([]);
  });

  it('R4 asks to sign in when the host has no credential, without a request', async () => {
    const d = drawer({ credential: false, answers: { jhon: JHON } });
    d.type('reviewers', 'jhon');
    await wait(300);
    expect(d.requests).toEqual([]);
    expect(d.list('reviewers')).toEqual(['Sign in to git.acme.com to search users.']);
  });

  it('R5 sends one request 300 ms after the last key and shows Searching… until the answer', async () => {
    const d = drawer({ answers: { jhon: 'pending' } });
    d.type('reviewers', 'jh');
    await wait(200);
    d.type('reviewers', 'jhon');
    await wait(299);
    expect(d.requests).toEqual([]);
    await wait(1);
    expect(d.requests).toEqual(['jhon']);
    expect(d.list('reviewers')).toEqual(['Searching…']);
  });

  it('R6 searches without the leading @ and lists name and username', async () => {
    const d = drawer({ answers: { jhon: JHON } });
    d.type('reviewers', '@jhon');
    await wait(300);
    expect(d.requests).toEqual(['jhon']);
    expect(d.list('reviewers')).toEqual(['Jhon Wilber Tapia Pinto @jtapiap', 'Jhon Ruiz @jruiz']);
  });

  it('R7 leaves out a user already in the field', async () => {
    const d = drawer({ answers: { jhon: JHON } });
    d.type('reviewers', 'jhon');
    await wait(300);
    expect(d.requests).toHaveLength(1);
    expect(d.list('reviewers', ['jtapiap'])).toEqual(['Jhon Ruiz @jruiz']);
  });

  it('R8 shows the answer under Assignees only', async () => {
    const d = drawer({ answers: { jhon: JHON } });
    d.type('assignees', 'jhon');
    await wait(300);
    expect(d.requests).toHaveLength(1);
    expect(d.list('assignees')).toEqual(['Jhon Wilber Tapia Pinto @jtapiap', 'Jhon Ruiz @jruiz']);
    expect(d.list('reviewers')).toEqual([]);
  });

  it('R9 says that no user matches', async () => {
    const d = drawer({ answers: { zz: [] } });
    d.type('reviewers', 'zz');
    await wait(300);
    expect(d.requests).toEqual(['zz']);
    expect(d.list('reviewers')).toEqual(['No users on git.acme.com match "zz".']);
  });

  it('R10 shows the provider message when the search fails', async () => {
    const d = drawer({ answers: { jhon: new HttpError('status', '403 Forbidden', 403) } });
    d.type('reviewers', 'jhon');
    await wait(300);
    expect(d.requests).toHaveLength(1);
    expect(d.list('reviewers')).toEqual(['User search failed: 403 Forbidden.']);
  });
});

describe('Answer for older text', () => {
  it('shows Searching… while only the answer for older text arrived, then the newer entries', async () => {
    const d = drawer({ answers: { jho: 'pending', jhon: 'pending' } });
    d.type('reviewers', 'jho');
    await wait(300);
    d.type('reviewers', 'jhon');
    await wait(300);
    expect(d.requests).toEqual(['jho', 'jhon']);
    d.resolve('jho', [{ username: 'jhonatan', name: 'Jhonatan Díaz' }]);
    await wait(0);
    expect(d.list('reviewers')).toEqual(['Searching…']);
    d.resolve('jhon', JHON);
    await wait(0);
    expect(d.list('reviewers')).toEqual(['Jhon Wilber Tapia Pinto @jtapiap', 'Jhon Ruiz @jruiz']);
  });

  it('keeps the newer entries when the answer for older text arrives last', async () => {
    const d = drawer({ answers: { jho: 'pending', jhon: 'pending' } });
    d.type('reviewers', 'jho');
    await wait(300);
    d.type('reviewers', 'jhon');
    await wait(300);
    d.resolve('jhon', JHON);
    await wait(0);
    d.resolve('jho', [{ username: 'jhonatan', name: 'Jhonatan Díaz' }]);
    await wait(0);
    expect(d.list('reviewers')).toEqual(['Jhon Wilber Tapia Pinto @jtapiap', 'Jhon Ruiz @jruiz']);
  });
});
