// provider-auth :: Host line matrix (R1–R6), First-run summary line.

import { describe, expect, it } from 'vitest';
import { firstRunModel, hostLine, type HostAccount } from '../../src/providers/firstRun';
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
