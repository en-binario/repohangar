// mr-creation :: Guard matrix (R1–R10), GitLab path matrix (R1–R6); Push matrix plans (R1–R4).

import { describe, expect, it } from 'vitest';
import { checkGuards, pushPlan, type GuardResult, type GuardState } from '../../src/mr/guards';
import type { Head } from '../../src/shared/model';

const feature = (upstream: { ahead: number; behind: number } | null): Head => ({
  kind: 'branch',
  name: 'feature/ABC-12-notes',
  ...(upstream ? { upstream: 'origin/feature/ABC-12-notes', ...upstream } : {}),
});

const base: GuardState = {
  repo: 'billing-api',
  operation: null,
  head: feature({ ahead: 0, behind: 0 }),
  provider: 'gitlab',
  host: 'git.acme.com',
  credential: true,
  usePushOptions: 'whenNoToken',
  target: 'main',
  aheadOfTarget: 2,
  dirtyFiles: 0,
};

describe('Guard matrix', () => {
  it.each<[string, Partial<GuardState>, GuardResult]>([
    ['R1 stops during a rebase', { operation: { kind: 'rebase', step: 3, total: 7 } }, { kind: 'stop', text: 'Finish the rebase in billing-api first.' }],
    ['R2 stops on a detached HEAD', { head: { kind: 'detached', commit: 'a1b2c3d' } }, { kind: 'stop', text: 'billing-api is not on a branch.' }],
    ['R3 stops on an unknown host', { provider: 'unknown' }, { kind: 'stop', text: 'billing-api is not on a known GitLab or GitHub host.' }],
    [
      'R4 stops until sign-in on GitHub without a credential',
      { provider: 'github', host: 'github.com', credential: false },
      { kind: 'stop', text: 'Sign in to github.com to create pull requests.', button: 'Sign In…' },
    ],
    ['R5 follows the push-options path on GitLab without a token', { credential: false, head: feature(null) }, { kind: 'create', path: 'pushOptions' }],
    [
      'R6 stops on the target branch',
      { head: { kind: 'branch', name: 'main', upstream: 'origin/main', ahead: 0, behind: 0 } },
      { kind: 'stop', text: "You're on main. Create a branch for your changes first.", button: 'Create Branch…' },
    ],
    ['R7 stops with nothing to merge', { aheadOfTarget: 0 }, { kind: 'stop', text: 'Nothing to merge into main from feature/ABC-12-notes.' }],
    [
      'R8 stops when the remote branch is ahead',
      { head: feature({ ahead: 0, behind: 2 }) },
      { kind: 'stop', text: "The remote branch of billing-api has 2 commits you don't have.", button: 'Pull' },
    ],
    [
      'R9 creates with a warning for uncommitted files',
      { dirtyFiles: 3 },
      { kind: 'create', path: 'api', warning: { text: '3 uncommitted files are not in the merge request.', button: 'Open Source Control' } },
    ],
    ['R10 creates on a clean branch', {}, { kind: 'create', path: 'api' }],
  ])('%s', (_name, overrides, expected) => {
    expect(checkGuards({ ...base, ...overrides })).toEqual(expected);
  });
});

describe('GitLab path matrix', () => {
  it.each<[string, boolean, GuardState['usePushOptions'], Head, GuardResult]>([
    ['R1 uses the API with a token', true, 'whenNoToken', feature(null), { kind: 'create', path: 'api' }],
    ['R2 uses the API with a token and never', true, 'never', feature(null), { kind: 'create', path: 'api' }],
    ['R3 stops without a token and never', false, 'never', feature(null), { kind: 'stop', text: 'Sign in to git.acme.com to create merge requests.', button: 'Sign In…' }],
    ['R4 uses push options without a token', false, 'whenNoToken', feature({ ahead: 2, behind: 0 }), { kind: 'create', path: 'pushOptions' }],
    ['R5 uses push options with always', true, 'always', feature(null), { kind: 'create', path: 'pushOptions' }],
    [
      'R6 stops a branch already pushed and level',
      false,
      'whenNoToken',
      feature({ ahead: 0, behind: 0 }),
      {
        kind: 'stop',
        text: 'feature/ABC-12-notes is already pushed, so GitLab cannot create the merge request during a push. Sign in to git.acme.com to create it.',
        button: 'Sign In…',
      },
    ],
  ])('%s', (_name, credential, usePushOptions, head, expected) => {
    expect(checkGuards({ ...base, credential, usePushOptions, head })).toEqual(expected);
  });
});

describe('Push plans', () => {
  it.each<[string, Head, boolean, ReturnType<typeof pushPlan>]>([
    ['R1 publishes a branch without upstream', feature(null), true, { kind: 'publish', commits: 2 }],
    ['R2 pushes a branch ahead of its upstream', feature({ ahead: 2, behind: 0 }), true, { kind: 'push', commits: 2 }],
    ['R3 does not push a level branch', feature({ ahead: 0, behind: 0 }), true, { kind: 'none' }],
    [
      'R4 stops when pushIfNeeded is false',
      feature(null),
      false,
      { kind: 'stop', text: 'feature/ABC-12-notes is not pushed to origin. Push it, or set "pushIfNeeded": true in the MR profile.', button: 'Push' },
    ],
  ])('%s', (_name, head, pushIfNeeded, expected) => {
    expect(pushPlan(head as Extract<Head, { kind: 'branch' }>, 2, pushIfNeeded, 'origin')).toEqual(expected);
  });
});
