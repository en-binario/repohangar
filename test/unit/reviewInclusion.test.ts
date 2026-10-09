// hosting-providers :: Repository inclusion matrix (R1–R8).

import { describe, expect, it } from 'vitest';
import { included, reviewInfo, type HostState, type InfoContext } from '../../src/providers/reviewInfo';
import { reviewCell } from '../../src/shared/review';
import type { RowData } from '../../src/shared/model';
import { gitlabReview, row } from './rows';

const gitlab = { host: 'git.acme.com', projectPath: 'payments/billing-api', webUrl: 'https://git.acme.com/payments/billing-api' };
const github = { host: 'github.com', projectPath: 'acme/web-shop', webUrl: 'https://github.com/acme/web-shop' };
const onBranch: RowData['head'] = { kind: 'branch', name: 'feature/ABC-12-notes', upstream: 'origin/feature/ABC-12-notes', ahead: 0, behind: 0 };

function ctx(state: HostState): InfoContext {
  return {
    hostState: () => state,
    stored: () => ({ review: gitlabReview(), headSha: 'c3d4e5f', fetchedAt: 10 }),
    sessionStart: 0,
    hostFailing: () => false,
  };
}

describe('Repository inclusion matrix', () => {
  it.each<[string, Partial<RowData>, HostState, boolean, string]>([
    ['sends nothing for a repository without a provider', { provider: null, hosted: undefined }, 'credential', false, '—'],
    ['sends nothing for an unknown host and shows ?', { provider: 'unknown', hosted: gitlab }, 'credential', false, '?'],
    [
      'sends nothing for a detached HEAD, even during an operation',
      { provider: 'gitlab', hosted: gitlab, head: { kind: 'detached', commit: 'a1b2c3d' }, operation: { kind: 'rebase', step: 3, total: 7 } },
      'credential',
      false,
      '—',
    ],
    ['sends nothing without a credential and shows Sign in', { provider: 'gitlab', hosted: gitlab, head: onBranch }, 'none', false, 'Sign in'],
    ['sends nothing for a skipped host', { provider: 'gitlab', hosted: gitlab, head: onBranch }, 'skipped', false, '—'],
    ['includes a GitLab branch with a credential', { provider: 'gitlab', hosted: gitlab, head: onBranch, headSha: 'c3d4e5f' }, 'credential', true, '!142'],
    ['sends nothing for a GitHub branch without a credential', { provider: 'github', hosted: github, head: onBranch }, 'none', false, 'Sign in'],
    ['includes a GitHub branch with a credential', { provider: 'github', hosted: github, head: onBranch, headSha: 'c3d4e5f' }, 'credential', true, '!142'],
  ])('%s', (_name, overrides, state, inRequest, cell) => {
    const r = row(overrides);
    expect(included(r, ctx(state))).toBe(inRequest);
    expect(reviewCell(reviewInfo(r, ctx(state)), 10).text).toBe(cell);
  });
});
