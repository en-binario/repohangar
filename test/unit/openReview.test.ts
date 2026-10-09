// hosting-providers :: Open merge request matrix (R1–R8); Copy merge request link notifications.

import { describe, expect, it } from 'vitest';
import { GitHubProvider } from '../../src/providers/github';
import { GitLabProvider } from '../../src/providers/gitlab';
import { Http } from '../../src/providers/http';
import type { Head, RowData } from '../../src/shared/model';
import { copyLinkPlan, openReviewPlan, type OpenPlan } from '../../src/shared/review';
import { githubReview, gitlabReview, loaded, row } from './rows';

const feature: Head = { kind: 'branch', name: 'feature/ABC-12-notes', upstream: 'origin/feature/ABC-12-notes', ahead: 0, behind: 0 };
const gitlabHosted = { host: 'git.acme.com', projectPath: 'payments/billing-api', webUrl: 'https://git.acme.com/payments/billing-api' };
const githubHosted = { host: 'github.com', projectPath: 'acme/web-shop', webUrl: 'https://github.com/acme/web-shop' };
const gitlab = new GitLabProvider(new Http(), 'git.acme.com', 'https://git.acme.com');
const github = new GitHubProvider(new Http(), 'github.com', 'https://github.com');

function plan(overrides: Partial<RowData>): OpenPlan {
  const r = row(overrides);
  return openReviewPlan(r, r.provider === 'github' ? github : gitlab);
}

const signIn = { kind: 'signIn', host: 'git.acme.com' } as const;

describe('Open merge request matrix', () => {
  it.each<[string, Partial<RowData>, OpenPlan]>([
    [
      'R1 says the repository is not on a known host',
      { provider: 'unknown', hosted: gitlabHosted, head: feature },
      { kind: 'notify', text: 'billing-api is not on a known GitLab or GitHub host.' },
    ],
    ['R2 says the repository is not on a branch', { provider: 'gitlab', hosted: gitlabHosted, head: { kind: 'detached', commit: 'a1b2c3d' } }, { kind: 'notify', text: 'billing-api is not on a branch.' }],
    [
      'R3 opens the GitLab merge request',
      { provider: 'gitlab', hosted: gitlabHosted, head: feature, review: loaded(gitlabReview()) },
      { kind: 'open', url: 'https://git.acme.com/payments/billing-api/-/merge_requests/142' },
    ],
    [
      'R4 opens the GitHub pull request',
      { name: 'web-shop', provider: 'github', hosted: githubHosted, head: feature, review: loaded(githubReview()) },
      { kind: 'open', url: 'https://github.com/acme/web-shop/pull/311' },
    ],
    [
      'R5 says there is no open merge request',
      { provider: 'gitlab', hosted: gitlabHosted, head: feature, review: loaded(null, 'gitlab') },
      { kind: 'notify', text: 'No open merge request for feature/ABC-12-notes in billing-api.' },
    ],
    [
      'R6 says there is no open pull request',
      { name: 'web-shop', provider: 'github', hosted: githubHosted, head: feature, review: loaded(null, 'github') },
      { kind: 'notify', text: 'No open pull request for feature/ABC-12-notes in web-shop.' },
    ],
    [
      'R7 opens the GitLab merge request list of the branch without a credential',
      { provider: 'gitlab', hosted: gitlabHosted, head: feature, review: signIn },
      { kind: 'open', url: 'https://git.acme.com/payments/billing-api/-/merge_requests?state=opened&source_branch=feature%2FABC-12-notes' },
    ],
    [
      'R8 opens the GitHub pull request search of the branch for a skipped host',
      { name: 'web-shop', provider: 'github', hosted: githubHosted, head: feature, review: { kind: 'skipped', host: 'github.com' } },
      { kind: 'open', url: 'https://github.com/acme/web-shop/pulls?q=is%3Apr+is%3Aopen+head%3Afeature%2FABC-12-notes' },
    ],
  ])('%s', (_name, overrides, expected) => {
    expect(plan(overrides)).toEqual(expected);
  });
});

describe('Copy merge request link', () => {
  it('copies the URL of an open merge request', () => {
    expect(copyLinkPlan(row({ provider: 'gitlab', hosted: gitlabHosted, head: feature, review: loaded(gitlabReview()) }))).toEqual({
      kind: 'open',
      url: 'https://git.acme.com/payments/billing-api/-/merge_requests/142',
    });
  });

  it('copies nothing without a credential and names the branch', () => {
    expect(copyLinkPlan(row({ provider: 'gitlab', hosted: gitlabHosted, head: feature, review: signIn }))).toEqual({
      kind: 'notify',
      text: 'No merge request loaded for feature/ABC-12-notes in billing-api.',
    });
  });
});
