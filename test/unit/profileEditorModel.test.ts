// mr-profiles :: New profile name matrix (R1–R4), and the editing model of the profile editor (design D-2): explicit
// and inherited values, what Save writes, and the messages from the editor webview.
// mr-profiles :: Search users in default matrix (R1–R4).

import { describe, expect, it } from 'vitest';
import {
  addProfile,
  hasChanges,
  parseProfilesMessage,
  PROFILE_NAME_MESSAGE,
  profileNames,
  profilesValue,
  profileView,
  ruleText,
  rulesValue,
  scopeChanges,
  scopeData,
  searchDefault,
  setSummary,
  validateProfileName,
  type ScopeData,
} from '../../src/shared/profileEditor';

describe('New profile name matrix', () => {
  const scope: ScopeData = { profiles: { default: {} }, rules: [] };
  const existing = Object.keys(scope.profiles);

  it('R1 adds hotfix to the list, unsaved', () => {
    expect(validateProfileName('hotfix', existing)).toBeUndefined();
    const draft = addProfile(scope, 'hotfix');
    expect(profileNames(draft.profiles)).toEqual(['default', 'hotfix']);
    expect(scopeChanges(scope, draft)).toEqual({ changed: { hotfix: {} }, deleted: [], rules: null });
  });

  it.each<[string, string, string]>([
    ['R2 a name the scope already has', 'default', 'A profile named "default" already exists.'],
    ['R3 a name with a space', 'hot fix', PROFILE_NAME_MESSAGE],
    ['R4 an empty name', '', PROFILE_NAME_MESSAGE],
  ])('%s', (_name, typed, message) => {
    expect(validateProfileName(typed, existing)).toBe(message);
  });

  it('shows the input message of R3 and R4 as written in the spec', () => {
    expect(PROFILE_NAME_MESSAGE).toBe('Use letters, digits, ".", "_" or "-" (up to 40).');
  });

  it('accepts 40 characters and refuses 41', () => {
    expect(validateProfileName('a'.repeat(40), existing)).toBeUndefined();
    expect(validateProfileName('a'.repeat(41), existing)).toBe(PROFILE_NAME_MESSAGE);
  });
});

describe('Explicit and inherited values', () => {
  const user = scopeData({ default: { reviewers: ['ana.perez'], squash: true }, hotfix: { extends: 'base', labels: ['hotfix'] }, base: { draft: true } }, []);

  it('lists default first, then by name', () => {
    expect(profileNames({ zeta: {}, default: {}, alpha: {} })).toEqual(['default', 'alpha', 'zeta']);
  });

  it('keeps the keys a profile sets and names where the others come from', () => {
    const view = profileView({ user, workspace: null }, 'user', 'hotfix');
    expect(view.explicit).toEqual({ extends: 'base', labels: ['hotfix'] });
    expect(view.effective).toMatchObject({ labels: ['hotfix'], draft: true, reviewers: ['ana.perez'], squash: true, target: '{defaultBranch}' });
    expect(view.inheritedFrom).toMatchObject({ draft: 'base', reviewers: 'default', squash: 'default', target: 'built-in defaults' });
    expect(view.inheritedFrom.labels).toBeUndefined();
  });

  it('shows a new profile with every value inherited', () => {
    const view = profileView({ user: addProfile(user, 'docs'), workspace: null }, 'user', 'docs');
    expect(view.explicit).toEqual({});
    expect(view.inheritedFrom.reviewers).toBe('default');
    expect(view.inheritedFrom.title).toBe('built-in defaults');
  });

  it('takes the user profile of the same name under a workspace profile', () => {
    const workspace = scopeData({ default: { reviewers: ['carla.ruiz'] } }, []);
    const view = profileView({ user, workspace }, 'workspace', 'default');
    expect(view.explicit).toEqual({ reviewers: ['carla.ruiz'] });
    expect(view.effective.squash).toBe(true);
    expect(view.inheritedFrom.squash).toBe('default (user settings)');
  });

  it('shows the User scope from the user settings alone', () => {
    const workspace = scopeData({ default: { squash: false } }, []);
    expect(profileView({ user, workspace }, 'user', 'default').effective.squash).toBe(true);
  });

  it('reads only known keys with a valid value, and the rules with their place', () => {
    const data = scopeData({ default: { reviewers: 'ana', colour: 'blue', draft: true } }, [{ repo: 'git.acme.com/payments/**', profile: 'default', set: { reviewers: ['carla.ruiz'] } }, 'junk']);
    expect(data.profiles.default).toEqual({ draft: true });
    expect(data.rules).toEqual([
      { from: 0, repo: 'git.acme.com/payments/**', profile: 'default', set: { reviewers: ['carla.ruiz'] } },
      { from: 1, profile: '' },
    ]);
  });

  it('shows a rule as its number, glob and profile, with its set summary', () => {
    expect(ruleText({ repo: 'git.acme.com/payments/**', profile: 'default' }, 1)).toBe('2 git.acme.com/payments/** → default');
    expect(ruleText({ branch: 'hotfix/**', profile: 'hotfix' }, 0)).toBe('1 hotfix/** → hotfix');
    expect(setSummary({ reviewers: ['carla.ruiz'], squash: true })).toBe('set reviewers carla.ruiz · squash on');
    expect(setSummary(undefined)).toBe('');
  });
});

describe('What Save writes', () => {
  it('writes nothing for an unchanged draft', () => {
    const scope = scopeData({ default: { squash: true } }, [{ branch: 'hotfix/**', profile: 'hotfix' }]);
    const changes = scopeChanges(scope, structuredClone(scope));
    expect(changes).toEqual({ changed: {}, deleted: [], rules: null });
    expect(hasChanges(changes)).toBe(false);
  });

  it('replaces the edited profile, keeps the other profiles and the keys the editor does not know, and removes the deleted', () => {
    const latest = { default: { squash: true, colour: 'blue' }, hotfix: { labels: ['hotfix'] }, old: { draft: true }, extra: { title: 'x' } };
    const value = profilesValue(latest, { changed: { default: { squash: false, labels: ['docs'] } }, deleted: ['old'] });
    expect(value).toEqual({ default: { colour: 'blue', squash: false, labels: ['docs'] }, hotfix: { labels: ['hotfix'] }, extra: { title: 'x' } });
  });

  it('writes the rules in the new order, each with its set and other keys', () => {
    const source = [
      { repo: 'git.acme.com/payments/**', profile: 'default', set: { reviewers: ['carla.ruiz'] }, note: 'payments' },
      { branch: 'hotfix/**', profile: 'hotfix' },
    ];
    const rules = scopeData({}, source).rules;
    const moved = [rules[1], rules[0], { branch: 'docs/**', profile: 'docs' }] as typeof rules;
    expect(scopeChanges({ profiles: {}, rules }, { profiles: {}, rules: moved }).rules).toEqual(moved);
    expect(rulesValue(source, moved)).toEqual([
      { branch: 'hotfix/**', profile: 'hotfix' },
      { repo: 'git.acme.com/payments/**', profile: 'default', set: { reviewers: ['carla.ruiz'] }, note: 'payments' },
      { branch: 'docs/**', profile: 'docs' },
    ]);
  });
});

describe('Profile editor messages', () => {
  it('accepts a save with known keys', () => {
    const message = { type: 'profilesSave', scope: 'workspace', changed: { docs: { labels: ['docs'] } }, deleted: [], rules: null };
    expect(parseProfilesMessage(message)).toEqual(message);
  });

  it('accepts a user search in Reviewers', () => {
    const message = { type: 'profilesSearchUsers', repo: 'file:///a', field: 'reviewers', text: 'jhon' };
    expect(parseProfilesMessage(message)).toEqual(message);
  });

  it.each<[string, unknown]>([
    ['an unknown profile key', { type: 'profilesSave', scope: 'user', changed: { docs: { colour: 'blue' } }, deleted: [], rules: null }],
    ['a value of the wrong type', { type: 'profilesSave', scope: 'user', changed: { docs: { squash: 'yes' } }, deleted: [], rules: null }],
    ['an invalid profile name', { type: 'profilesSave', scope: 'user', changed: { 'hot fix': {} }, deleted: [], rules: null }],
    ['an unknown scope', { type: 'profilesSave', scope: 'folder', changed: {}, deleted: [], rules: null }],
    ['a new rule without a profile', { type: 'profilesSave', scope: 'user', changed: {}, deleted: [], rules: [{ branch: 'x/**', profile: '' }] }],
    ['a missing field', { type: 'profilesDelete', scope: 'user' }],
    ['an extra field', { type: 'profilesReload', now: true }],
    ['an unknown type', { type: 'eval', code: '1' }],
    ['a user search without a field', { type: 'profilesSearchUsers', repo: 'file:///a', text: 'jhon' }],
    ['a user search in Labels', { type: 'profilesSearchUsers', repo: 'file:///a', field: 'labels', text: 'jhon' }],
    ['a user search with an extra key', { type: 'profilesSearchUsers', repo: 'file:///a', field: 'assignees', text: 'jhon', id: 'x' }],
  ])('refuses %s', (_name, message) => {
    expect(parseProfilesMessage(message)).toBeUndefined();
  });
});

describe('Search users in default matrix', () => {
  const BILLING = { id: 'file:///code/billing-api', name: 'billing-api', host: 'git.acme.com' };
  const WEB = { id: 'file:///code/web-shop', name: 'web-shop', host: 'github.com' };
  const NOTES = 'file:///code/notes';

  it.each([
    ['R1 the focused row when it is hosted', WEB.id, [BILLING, WEB], WEB.id],
    ['R2 the first hosted repository by name when the focused row is not hosted', NOTES, [BILLING, WEB], BILLING.id],
    ['R3 the first hosted repository by name without a focused row', undefined, [WEB, BILLING], BILLING.id],
    ['R4 none without a hosted repository', NOTES, [], null],
  ])('%s', (_name, focused, repos, expected) => {
    expect(searchDefault(focused, repos)).toBe(expected);
  });
});
