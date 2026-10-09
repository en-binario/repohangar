// hosting-providers :: Compare page matrix (R1–R7).

import { describe, expect, it } from 'vitest';
import { GitHubProvider } from '../../src/providers/github';
import { GitLabProvider } from '../../src/providers/gitlab';
import { Http } from '../../src/providers/http';
import type { Head, ReviewInfo, RowData } from '../../src/shared/model';
import { compareState } from '../../src/shared/review';
import { rowMenu } from '../../src/shared/rowMenu';
import { loaded, row } from './rows';

const gitlab = new GitLabProvider(new Http(), 'git.acme.com', 'https://git.acme.com');
const github = new GitHubProvider(new Http(), 'github.com', 'https://github.com');
const feature: Head = { kind: 'branch', name: 'feature/ABC-12-notes', upstream: 'origin/feature/ABC-12-notes', ahead: 2, behind: 0 };
const main: Head = { kind: 'branch', name: 'main', upstream: 'origin/main', ahead: 0, behind: 0 };
const withCredential: ReviewInfo = loaded(null);

/** The URL the item opens, or the disabled reason. */
function outcome(r: RowData, providerDefault: string | undefined): string {
  const state = compareState(r, providerDefault);
  if (!state.enabled) return `disabled: ${state.reason}`;
  const target = state.target ?? providerDefault;
  if (!target || r.head.kind !== 'branch') return 'disabled: Default branch unknown';
  const provider = r.provider === 'github' ? github : gitlab;
  return provider.compareUrl(r.provider === 'github' ? 'acme/web-shop' : 'payments/billing-api', target, r.head.name);
}

describe('Compare page matrix', () => {
  it.each<[string, Partial<RowData>, string | undefined, string]>([
    ['R1 is disabled without a known provider', { provider: 'unknown', head: feature }, undefined, 'disabled: Not on a known GitLab or GitHub host'],
    ['R2 is disabled on a detached HEAD', { provider: 'gitlab', head: { kind: 'detached', commit: 'a1b2c3d' }, defaultBranch: 'main' }, undefined, 'disabled: Not on a branch'],
    [
      'R3 opens the GitLab compare page from origin/HEAD',
      { provider: 'gitlab', head: feature, defaultBranch: 'main', review: withCredential },
      undefined,
      'https://git.acme.com/payments/billing-api/-/compare/main...feature/ABC-12-notes',
    ],
    [
      'R4 opens the GitHub compare page from origin/HEAD',
      { provider: 'github', head: feature, defaultBranch: 'main', review: withCredential },
      undefined,
      'https://github.com/acme/web-shop/compare/main...feature/ABC-12-notes',
    ],
    [
      'R5 uses the provider default branch when origin/HEAD is missing',
      { provider: 'gitlab', head: feature, defaultBranch: null, review: withCredential },
      'develop',
      'https://git.acme.com/payments/billing-api/-/compare/develop...feature/ABC-12-notes',
    ],
    [
      'R6 is disabled when origin/HEAD is missing and there is no credential',
      { provider: 'gitlab', head: feature, defaultBranch: null, review: { kind: 'signIn', host: 'git.acme.com' } },
      undefined,
      'disabled: Default branch unknown',
    ],
    ['R7 is disabled on the target itself', { provider: 'gitlab', head: main, defaultBranch: 'main', review: withCredential }, undefined, 'disabled: Already on main'],
  ])('%s', (_name, overrides, providerDefault, expected) => {
    expect(outcome(row(overrides), providerDefault)).toBe(expected);
  });

  it('places Open compare page after Copy branch name, with the reason as tooltip when disabled', () => {
    const group = rowMenu(row({ provider: 'gitlab', head: main, defaultBranch: 'main', review: withCredential }), 'win32', 'gitGraph')[2] ?? [];
    expect(group.map((i) => i.label)).toEqual(['Reveal in File Explorer', 'Copy path', 'Copy branch name', 'Open compare page ↗']);
    expect(group[3]).toMatchObject({ action: 'openCompare', enabled: false, reason: 'Already on main' });
  });
});
