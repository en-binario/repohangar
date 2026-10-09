// mr-profiles :: Profile value matrix (R1–R6), Invalid extends matrix (R1–R2), Resolution order matrix (R1–R4).

import { describe, expect, it } from 'vitest';
import { mergeScopes, resolveValues, type RawProfiles } from '../../src/mr/profiles';

function resolve(user: RawProfiles | undefined, workspace: RawProfiles | undefined, profile: string) {
  const result = resolveValues({ profiles: mergeScopes(user, workspace), profile });
  if (!result.ok) throw new Error(result.error);
  return result.values;
}

describe('Profile value matrix', () => {
  it.each<[string, RawProfiles | undefined, RawProfiles | undefined, string, string[], boolean, string[]]>([
    ['R1 uses the built-in defaults without any profile', undefined, undefined, 'default', [], false, []],
    ['R2 uses the user default profile', { default: { reviewers: ['ana.perez'], squash: true } }, undefined, 'default', ['ana.perez'], true, []],
    [
      'R3 takes the keys the workspace sets and the user keys it does not',
      { default: { reviewers: ['ana.perez'], squash: true } },
      { default: { reviewers: ['carla.ruiz'] } },
      'default',
      ['carla.ruiz'],
      true,
      [],
    ],
    [
      'R4 follows extends to default',
      { default: { squash: true, labels: ['needs-review'] }, hotfix: { extends: 'default', labels: ['hotfix'] } },
      undefined,
      'hotfix',
      [],
      true,
      ['hotfix'],
    ],
    ['R5 falls back to default for a profile without extends', { default: { squash: true }, hotfix: { labels: ['hotfix'] } }, undefined, 'hotfix', [], true, ['hotfix']],
    [
      'R6 follows extends to another profile, then default',
      { default: { squash: true }, hotfix: { extends: 'base' }, base: { reviewers: ['sre.oncall'] } },
      undefined,
      'hotfix',
      ['sre.oncall'],
      true,
      [],
    ],
  ])('%s', (_name, user, workspace, profile, reviewers, squash, labels) => {
    const values = resolve(user, workspace, profile);
    expect([values.reviewers, values.squash, values.labels]).toEqual([reviewers, squash, labels]);
  });

  it('ignores unknown keys and values of the wrong type', () => {
    const values = resolve({ default: { reviewers: 'ana.perez', squash: 'yes', colour: 'blue', openAfterCreate: 'popup' } }, undefined, 'default');
    expect([values.reviewers, values.squash, values.openAfterCreate]).toEqual([[], false, 'notify']);
  });
});

describe('Invalid extends matrix', () => {
  it('R1 reports a profile that extends a missing one', () => {
    const result = resolveValues({ profiles: mergeScopes({ hotfix: { extends: 'base' } }, undefined), profile: 'hotfix' });
    expect(result).toEqual({ ok: false, error: 'MR profile "hotfix" extends "base", which does not exist.' });
  });

  it('R2 reports a cycle of extends', () => {
    const result = resolveValues({ profiles: mergeScopes({ a: { extends: 'b' }, b: { extends: 'a' } }, undefined), profile: 'a' });
    expect(result).toEqual({ ok: false, error: 'MR profile "a" extends itself through "b".' });
  });
});

describe('Resolution order matrix', () => {
  const profiles = mergeScopes({ default: { reviewers: ['ana.perez'] }, hotfix: { draft: true } }, undefined);
  it.each<[string, string, object | undefined, object | undefined, string[], boolean]>([
    ['R1 uses default', 'default', undefined, undefined, ['ana.perez'], false],
    ['R2 lets the rule set override default', 'default', { reviewers: ['carla.ruiz'] }, undefined, ['carla.ruiz'], false],
    ['R3 layers a profile without extends over default', 'hotfix', undefined, undefined, ['ana.perez'], true],
    ['R4 lets the drawer edits override the rule set', 'default', { reviewers: ['carla.ruiz'] }, { reviewers: ['luis.gomez'], draft: true }, ['luis.gomez'], true],
  ])('%s', (_name, profile, set, edits, reviewers, draft) => {
    const result = resolveValues({ profiles, profile, ...(set ? { set } : {}), ...(edits ? { edits } : {}) });
    expect(result.ok && [result.values.reviewers, result.values.draft]).toEqual([reviewers, draft]);
  });

  it('marks the keys a profile, rule or edit set as explicit, not the built-in ones', () => {
    const result = resolveValues({ profiles, profile: 'default', edits: { title: 'x' } });
    expect(result.ok && [...result.explicit].sort()).toEqual(['reviewers', 'title']);
  });
});
