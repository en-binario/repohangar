// mr-profiles :: Rule matrix (R1–R6), and a rule that names a missing profile.

import { describe, expect, it } from 'vitest';
import { mergeScopes, resolveValues } from '../../src/mr/profiles';
import { chooseRule, missingProfileText, readRules } from '../../src/mr/rules';

const rules = readRules([
  { branch: 'hotfix/**', profile: 'hotfix' },
  { repo: 'git.acme.com/payments/**', profile: 'default', set: { reviewers: ['carla.ruiz'] } },
  { repo: 'github.com/acme/web-*', profile: 'default', set: { labels: ['frontend'] } },
]);

describe('Rule matrix', () => {
  it.each<[string, string, string, number | undefined, string, object]>([
    ['R1 chooses hotfix for a hotfix branch', 'git.acme.com/payments/billing-api', 'hotfix/ABC-99-timeout', 1, 'hotfix', {}],
    ['R2 chooses the payments rule', 'git.acme.com/payments/billing-api', 'feature/ABC-12-notes', 2, 'default', { reviewers: ['carla.ruiz'] }],
    ['R3 matches a subgroup with **', 'git.acme.com/payments/core/ledger', 'feature/ABC-12-notes', 2, 'default', { reviewers: ['carla.ruiz'] }],
    ['R4 matches web-* on github.com', 'github.com/acme/web-shop', 'feature/ABC-12-notes', 3, 'default', { labels: ['frontend'] }],
    ['R5 uses default when no rule matches', 'github.com/acme/admin-portal', 'feature/ABC-12-notes', undefined, 'default', {}],
    ['R6 compares hosts case-insensitively and branches case-sensitively', 'Git.Acme.com/payments/billing-api', 'Hotfix/ABC-99', 2, 'default', { reviewers: ['carla.ruiz'] }],
  ])('%s', (_name, repo, branch, index, profile, set) => {
    const chosen = chooseRule(rules, repo, branch);
    expect([chosen.index, chosen.profile, chosen.set]).toEqual([index, profile, set]);
  });

  it('reports a rule that names a missing profile', () => {
    const chosen = chooseRule(readRules([{ branch: '**', profile: 'release' }]), 'git.acme.com/payments/billing-api', 'main');
    const result = resolveValues({ profiles: mergeScopes({}, undefined), profile: chosen.profile });
    expect(result.ok).toBe(false);
    expect(missingProfileText(chosen.index ?? 0, chosen.profile)).toBe('MR rule 1 uses the profile "release", which does not exist.');
  });
});
