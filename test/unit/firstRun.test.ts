// provider-auth :: Host line matrix (R1–R6), First-run summary line. mr-profiles :: Defaults line matrix (R1–R2).

import { describe, expect, it } from 'vitest';
import { defaultsLine, firstRunModel, hostLine, type HostAccount } from '../../src/providers/firstRun';
import type { RowData } from '../../src/shared/model';
import { row } from './rows';

describe('Host line matrix', () => {
  it.each<[string, string, 'gitlab' | 'github', HostAccount, string, string[]]>([
    [
      'R1 github.com signed in with the VS Code account',
      'github.com',
      'github',
      { state: 'credential', account: { username: 'luisgomez', source: 'session' } },
      'github.com  ✓ Signed in as luisgomez (VS Code account)',
      [],
    ],
    ['R2 github.com not connected', 'github.com', 'github', { state: 'none' }, 'github.com  ○ Not connected', ['signInGitHub', 'skip']],
    [
      'R3 GitLab imported from glab',
      'git.acme.com',
      'gitlab',
      { state: 'credential', account: { username: 'ana.perez', source: 'glab' } },
      'git.acme.com  ✓ Signed in as ana.perez (glab login)',
      [],
    ],
    [
      'R4 GitLab with a stored token',
      'git.acme.com',
      'gitlab',
      { state: 'credential', account: { username: 'ana.perez', source: 'token' } },
      'git.acme.com  ✓ Signed in as ana.perez (token)',
      [],
    ],
    ['R5 GitLab not connected', 'git.acme.com', 'gitlab', { state: 'none' }, 'git.acme.com  ○ Not connected', ['pasteToken', 'skip']],
    ['R6 GitHub Enterprise not connected', 'github.acme.com', 'github', { state: 'none' }, 'github.acme.com  ○ Not connected', ['pasteToken', 'skip']],
  ])('%s', (_name, host, provider, account, line, buttons) => {
    expect(hostLine(host, provider, account)).toEqual({ host, line, buttons });
  });
});

describe('First-run summary line', () => {
  const on = (host: string, provider: 'gitlab' | 'github', i: number): RowData =>
    row({ id: `${host}-${i}`, name: `${host}-${i}`, provider, hosted: { host, projectPath: `g/r${i}`, webUrl: `https://${host}/g/r${i}` } });

  it('counts the repositories per host, most first, then the local ones', () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => on('github.com', 'github', i)),
      ...Array.from({ length: 9 }, (_, i) => on('git.acme.com', 'gitlab', i)),
      row({ id: 'scratch', name: 'scratch', provider: null, remote: null }),
    ];
    const panel = firstRunModel(rows, () => ({ state: 'none' }));
    expect(panel?.summary).toBe('Found 14 repositories: 9 on git.acme.com (GitLab) · 4 on github.com (GitHub) · 1 local only');
    expect(panel?.hosts.map((h) => h.host)).toEqual(['git.acme.com', 'github.com']);
  });

  it('is not shown without a GitLab or GitHub repository', () => {
    expect(firstRunModel([row({ provider: null, remote: null })], () => ({ state: 'none' }))).toBeUndefined();
  });
});

describe('Defaults line matrix', () => {
  const none = { text: 'Merge request defaults: none yet.', button: 'setUpProfile', note: '(you can also save them from the form)' };

  it.each<[string, unknown, unknown]>([
    ['R1 not set at either scope', undefined, undefined],
    ['R1 only { "default": {} }', { default: {} }, undefined],
    ['R1 only { "default": {} } at both scopes', { default: {} }, { default: {} }],
  ])('%s: none yet, with Set up a default profile', (_name, user, workspace) => {
    expect(defaultsLine(user, workspace)).toEqual(none);
  });

  it('R2 default and hotfix with keys: 2 profiles, with Edit profiles', () => {
    expect(defaultsLine({ default: { squash: true } }, { hotfix: { labels: ['hotfix'] } })).toEqual({
      text: 'Merge request defaults: 2 profiles.',
      button: 'editProfiles',
    });
  });

  it('comes after the host lines of the panel', () => {
    const rows = [row({ provider: 'gitlab', hosted: { host: 'git.acme.com', projectPath: 'payments/billing-api', webUrl: 'https://git.acme.com/payments/billing-api' } })];
    expect(firstRunModel(rows, () => ({ state: 'none' }), defaultsLine(undefined, undefined))?.defaults).toEqual(none);
  });
});
