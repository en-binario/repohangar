// mr-profiles :: Save as defaults matrix (R1–R4), and a squash the policy forced, which is not saved.

import { describe, expect, it } from 'vitest';
import { mergeScopes, resolveProfile, type ProfileValues } from '../../src/mr/profiles';
import { planSaveDefaults, type SaveDefaultsInput, type SaveTarget } from '../../src/mr/saveDefaults';

// Profile `default` (user scope) has `reviewers` ["ana.perez"], `squash` false; the drawer for billing-api has
// `reviewers` ["ana.perez", "carla.ruiz"], `squash` true, the title edited (the title is not a saved key).
const USER = { default: { reviewers: ['ana.perez'], squash: false } };

function effective(): ProfileValues {
  const result = resolveProfile(mergeScopes(USER, undefined), 'default');
  if (!result.ok) throw new Error(result.error);
  return result.values;
}

function input(target: SaveTarget, drawer: Partial<ProfileValues> = { reviewers: ['ana.perez', 'carla.ruiz'], squash: true }): SaveDefaultsInput {
  const values = { ...effective(), ...drawer };
  return {
    target,
    profile: 'default',
    repo: 'billing-api',
    repoKey: 'git.acme.com/payments/billing-api',
    values: {
      reviewers: values.reviewers,
      assignees: values.assignees,
      labels: values.labels,
      squash: values.squash,
      deleteSourceBranch: values.deleteSourceBranch,
      draft: values.draft,
    },
    effective: effective(),
    squashForced: false,
    scopeProfiles: target === 'user' ? USER : target === 'workspace' ? {} : undefined,
    memory: {},
  };
}

describe('Save as defaults matrix', () => {
  it('R1 For me (all workspaces) writes the differing keys into the user-scope profile', () => {
    expect(planSaveDefaults(input('user'))).toEqual({
      kind: 'settings',
      scope: 'user',
      value: { default: { reviewers: ['ana.perez', 'carla.ruiz'], squash: true } },
      keys: ['reviewers', 'squash'],
      text: 'Saved reviewers, squash to the MR profile "default" (user settings).',
    });
  });

  it('R2 For this workspace (shared) writes them into the workspace-scope profile', () => {
    expect(planSaveDefaults(input('workspace'))).toEqual({
      kind: 'settings',
      scope: 'workspace',
      value: { default: { reviewers: ['ana.perez', 'carla.ruiz'], squash: true } },
      keys: ['reviewers', 'squash'],
      text: 'Saved reviewers, squash to the MR profile "default" (workspace settings).',
    });
  });

  it('R3 For this repo only writes them into the memory, keyed by host and project path, and no setting', () => {
    expect(planSaveDefaults(input('repo'))).toEqual({
      kind: 'memory',
      value: { 'git.acme.com/payments/billing-api': { reviewers: ['ana.perez', 'carla.ruiz'], squash: true } },
      keys: ['reviewers', 'squash'],
      text: 'Saved reviewers, squash for billing-api in this workspace.',
    });
  });

  it.each<SaveTarget>(['user', 'workspace', 'repo'])('R4 %s with no value differing from the profile saves nothing', (target) => {
    expect(planSaveDefaults(input(target, {}))).toEqual({ kind: 'nothing', text: 'Nothing to save: the values match the MR profile "default".' });
  });
});

describe('Save as defaults and the squash policy', () => {
  it('does not save a squash the policy forced', () => {
    const plan = planSaveDefaults({ ...input('user'), squashForced: true });
    expect(plan).toMatchObject({ kind: 'settings', value: { default: { reviewers: ['ana.perez', 'carla.ruiz'], squash: false } }, keys: ['reviewers'] });
    expect(plan.text).toBe('Saved reviewers to the MR profile "default" (user settings).');
  });

  it('keeps the other keys and profiles of the scope', () => {
    const plan = planSaveDefaults({ ...input('user'), scopeProfiles: { default: { reviewers: ['ana.perez'], squash: false, title: '{ticket}' }, hotfix: { labels: ['hotfix'] } } });
    expect(plan).toMatchObject({
      value: { default: { reviewers: ['ana.perez', 'carla.ruiz'], squash: true, title: '{ticket}' }, hotfix: { labels: ['hotfix'] } },
    });
  });
});
